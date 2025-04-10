import React from "react";

const AudioPlayer = ({ tracks, currentTrack, isPlaying, onPlay, onPause }) => {
  if (!tracks || tracks.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No songs in queue. Add a song to start listening!
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Playback Queue</h2>
      <div className="space-y-2">
        {tracks.map((track) => {
          const isCurrent = currentTrack && currentTrack.id === track.id;

          return (
            <div
              key={track.id}
              className={`flex justify-between items-center p-2 rounded shadow ${
                isCurrent ? "bg-blue-50 border border-blue-300" : "bg-white"
              }`}
            >
              <div>
                <div className="font-medium">{track.title}</div>
                <div className="text-sm text-gray-500">{track.artist}</div>
              </div>
              <div className="flex items-center gap-2">
                {isCurrent && isPlaying ? (
                  <button
                    className="text-yellow-500 hover:underline text-sm"
                    onClick={() => onPause()}
                  >
                    ⏸ Pause
                  </button>
                ) : (
                  <button
                    className="text-green-500 hover:underline text-sm"
                    onClick={() => onPlay(track)}
                  >
                    ▶️ Play
                  </button>
                )}
                <button
                  className="text-red-500 hover:underline text-sm"
                  onClick={() => track.onRemove(track.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t">
        <div className="flex justify-between font-semibold">
          <span>Total Tracks:</span>
          <span>{tracks.length}</span>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
