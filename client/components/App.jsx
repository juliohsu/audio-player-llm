import { useEffect, useRef, useState } from "react";
import logo from "/assets/audio-player-logo.jpg";
import AudioPlayer from "./AudioPlayer";

const sessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "add_track",
        description: "Add a track to the playlist",
        parameters: {
          type: "object",
          properties: {
            track_id: { type: "string", description: "Unique ID of the track" },
            title: { type: "string", description: "Track title" },
            artist: { type: "string", description: "Track artist or creator" },
            url: { type: "string", description: "URL to stream the track audio from" },
          },
          required: ["track_id", "title", "artist", "url"],
        },
      },
      {
        type: "function",
        name: "remove_track",
        description: "Remove a track from the playlist by its ID",
        parameters: {
          type: "object",
          properties: {
            track_id: {
              type: "string",
              description: "Unique ID of the track to remove",
            },
          },
          required: ["track_id"],
        },
      },
      {
        type: "function",
        name: "play_track",
        description:
          "Play a specific track or resume the currently selected one",
        parameters: {
          type: "object",
          properties: {
            track_id: {
              type: "string",
              description:
                "Track ID to play (optional; plays the current track if omitted)",
            },
          },
          required: [],
        },
      },
      {
        type: "function",
        name: "pause_track",
        description: "Pause the track that is currently playing",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
    tool_choice: "auto",
  },
};

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [dataChannel, setDataChannel] = useState(null);
  const [toolsConfigured, setToolsConfigured] = useState(false);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  const [playlist, setPlaylist] = useState([
    {
      id: 0,
      title: "SoundHelix Song 1",
      artist: "Test Artist",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      onRemove: (id) =>
        setPlaylist((prev) => prev.filter((track) => track.id !== id)),
    },
  ]);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTrack = (track) => {
    console.log(track);
    if (audioElement.current) {
      audioElement.current.src = track.url;
      audioElement.current.play();
      setCurrentTrack(track);
      setIsPlaying(true);
    }
  };
  const pauseTrack = () => {
    console.log(audioElement.current);
    if (audioElement.current) {
      audioElement.current.pause();
      setIsPlaying(false);
    }
  };

  const updatePlaylist = (action, payload = {}) => {
    switch (action) {
      case "add":
        setPlaylist((prev) => {
          const exists = prev.some((t) => t.id === payload.id);
          return exists ? prev : [...prev, { ...payload }];
        });
        sendClientEvent({
          type: "response.create",
          response: {
            instructions: `Track "${payload.title}" by ${payload.artist} was added to the playlist.`,
          },
        });
        break;

      case "remove":
        setPlaylist((prev) => prev.filter((t) => t.id !== payload.id));
        sendClientEvent({
          type: "response.create",
          response: {
            instructions: `Track was removed from the playlist.`,
          },
        });
        break;

      case "play_track":
        if (payload.track_id) {
          const trackToPlay = playlist.find((t) => t.id === String(payload.track_id));
          if (trackToPlay) {
            playTrack(trackToPlay);
          } else {
            console.warn("Track not found:", payload.track_id);
          }
        } else if (currentTrack) {
          playTrack(currentTrack);
        } else {
          console.warn("No track to play.");
        }
        break;

      case "pause_track":
        pauseTrack();
        break;

      default:
        break;
    }
  };

  const handleFunctionCall = (output) => {

    console.log("Function Call:", {
      name: output.name,
      arguments: JSON.parse(output.arguments),
    });

    const params = JSON.parse(output.arguments);
    switch (output.name) {
      case "add_track":
        updatePlaylist("add", {
          id: params.track_id,
          title: params.title,
          artist: params.artist,
          url: params.url,
        });
        break;

      case "remove_track":
        updatePlaylist("remove", { track_id: params.track_id });
        break;

      case "play_track":
        updatePlaylist("play_track", { track_id: params.track_id });
        break;

      case "pause_track":
        updatePlaylist("pause_track");
        break;

      default:
        break;
    }
  };

  function sendClientEvent(message) {
    if (dataChannel) {
      if (message.type === "tools.configure") {
        console.log("🔧 Configuring tools");
      }
      dataChannel.send(JSON.stringify(message));
    }
  }

  async function startSession() {
    try {
      const tokenResponse = await fetch("/token");
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.client_secret.value;

      const pc = new RTCPeerConnection();

      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";

      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      peerConnection.current = pc;
    } catch (error) {
      console.error("Error starting session:", error);
    }
  }

  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current?.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    setToolsConfigured(false);
  }

  useEffect(() => {
    if (dataChannel) {
      const handleMessage = (e) => {
        const event = JSON.parse(e.data);

        // Configure tools after session is created
        if (!toolsConfigured && event.type === "session.created") {
          sendClientEvent(sessionUpdate);
          setToolsConfigured(true);
        }

        // Handle function calls in responses
        if (event.type === "response.done" && event.response.output) {
          event.response.output.forEach((output) => {
            if (output.type === "function_call") {
              handleFunctionCall(output);
            }
          });
        }
      };

      const handleError = (error) => {
        console.error("Data channel error:", error);
      };

      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
      });
      dataChannel.addEventListener("message", handleMessage);
      dataChannel.addEventListener("error", handleError);

      // Cleanup function to remove event listeners
      return () => {
        dataChannel.removeEventListener("message", handleMessage);
        dataChannel.removeEventListener("error", handleError);
      };
    }
  }, [dataChannel, toolsConfigured]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center">
          <img className="w-6 h-6" src={logo} alt="OpenAI Logo" />
          <h1 className="ml-4 text-xl font-semibold">
            Voice Audio Player Assistant
          </h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <button
              onClick={isSessionActive ? stopSession : startSession}
              className={`px-8 py-4 rounded-full text-white text-lg font-medium transition-all ${
                isSessionActive
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {isSessionActive ? "End Call" : "Start Call"}
            </button>
            {isSessionActive && (
              <p className="mt-4 text-green-600">
                Voice assistant is active and listening...
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow">
            <AudioPlayer
              tracks={playlist}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={playTrack}
              onPause={pauseTrack}
            />
            <audio ref={audioElement} hidden />
          </div>
        </div>
      </main>
    </div>
  );
}
