import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import Cart from "./Cart";

const sessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "add_item",
        description: "Add an item to the cart",
        parameters: {
          type: "object",
          properties: {
            item_id: {
              type: "string",
              description: "Unique identifier for the item"
            },
            item_name: {
              type: "string",
              description: "Display name of the item"
            },
            price: {
              type: "number",
              description: "Price of the item"
            }
          },
          required: ["item_id", "item_name", "price"]
        }
      },
      {
        type: "function",
        name: "remove_item",
        description: "Remove an item from the cart",
        parameters: {
          type: "object",
          properties: {
            item_id: {
              type: "string",
              description: "ID of the item to remove"
            }
          },
          required: ["item_id"]
        }
      },
      {
        type: "function",
        name: "update_quantity",
        description: "Update the quantity of an item in the cart",
        parameters: {
          type: "object",
          properties: {
            item_id: {
              type: "string",
              description: "ID of the item to update"
            },
            quantity: {
              type: "number",
              description: "New quantity"
            }
          },
          required: ["item_id", "quantity"]
        }
      },
      {
        type: "function",
        name: "clear_cart",
        description: "Clear all items from the cart",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      {
        type: "function",
        name: "get_cart",
        description: "Get the current contents of the cart",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    ],
    tool_choice: "auto"
  }
};

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [toolsConfigured, setToolsConfigured] = useState(false);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  // Handle cart operations
  const updateCart = (action, item) => {
    switch (action) {
      case 'add':
        setCartItems(prev => {
          const existingItem = prev.find(i => i.id === item.id);
          if (existingItem) {
            return prev.map(i => 
              i.id === item.id 
                ? { ...i, quantity: i.quantity + 1 }
                : i
            );
          }
          return [...prev, { ...item, quantity: 1 }];
        });
        sendClientEvent({
          type: 'response.create',
          response: {
            instructions: `Say that you added the item to the cart, in a natural way`,
          },
        });
        break;
      case 'remove':
        setCartItems(prev => prev.filter(i => i.id !== item.id));
        sendClientEvent({
          type: 'response.create',
          response: {
            instructions: `Say that you removed the item from the cart, in a natural way`,
          },
        });

        break;
      case 'update':
        setCartItems(prev => 
          prev.map(i => i.id === item.id ? { ...i, quantity: item.quantity } : i)
        );
        sendClientEvent({
          type: 'response.create',
          response: {
            instructions: `Say that you updated the quantity of the item in the cart, in a natural way`,
          },
        });
        break;
      case 'clear':
        setCartItems([]);
        sendClientEvent({
          type: 'response.create',
          response: {
            instructions: `Say that you cleared the cart, in a natural way`,
          },
        });
        break;
    }
  };

  // Handle function calls from the AI
  const handleFunctionCall = (output) => {
    console.log('🛠️ Function Call:', {
      name: output.name,
      arguments: JSON.parse(output.arguments)
    });
    
    switch (output.name) {
      case 'add_item': {
        const params = JSON.parse(output.arguments);
        updateCart('add', {
          id: params.item_id,
          name: params.item_name,
          price: params.price
        });
        break;
      }
      case 'remove_item': {
        const params = JSON.parse(output.arguments);
        updateCart('remove', { id: params.item_id });
        break;
      }
      case 'update_quantity': {
        const params = JSON.parse(output.arguments);
        updateCart('update', {
          id: params.item_id,
          quantity: params.quantity
        });
        break;
      }
      case 'clear_cart':
        updateCart('clear');
        break;
      case 'get_cart':
        break;
    }
  };

  function sendClientEvent(message) {
    if (dataChannel) {
      if (message.type === "tools.configure") {
        console.log('🔧 Configuring tools');
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
      console.error('Error starting session:', error);
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
          event.response.output.forEach(output => {
            if (output.type === "function_call") {
              handleFunctionCall(output);
            }
          });
        }
      };

      const handleError = (error) => {
        console.error('Data channel error:', error);
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
          <h1 className="ml-4 text-xl font-semibold">Voice Waiter Assistant</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <button
              onClick={isSessionActive ? stopSession : startSession}
              className={`px-8 py-4 rounded-full text-white text-lg font-medium transition-all ${
                isSessionActive
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {isSessionActive ? 'End Call' : 'Start Call'}
            </button>
            {isSessionActive && (
              <p className="mt-4 text-green-600">Voice assistant is active and listening...</p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow">
            <Cart items={cartItems} />
          </div>
        </div>
      </main>
    </div>
  );
}
