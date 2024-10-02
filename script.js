// script.js

// Replace with your Heroku proxy server URL
const proxyServerUrl = 'wss://realtimevoice-proxy.herokuapp.com/'; // Update if different

// Initialize WebSocket connection
const ws = new WebSocket(proxyServerUrl);

const statusDiv = document.getElementById('status');
const conversationDiv = document.getElementById('conversation');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const interruptButton = document.getElementById('interruptButton');

let mediaRecorder;
let audioStream;
let isRecording = false;
let isResponding = false;

// Function to add messages to the conversation div
function addMessageToConversation(role, text) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', role);
  messageDiv.textContent = text;
  conversationDiv.appendChild(messageDiv);
  conversationDiv.scrollTop = conversationDiv.scrollHeight;
}

// Function to add audio to the conversation div
function addAudioToConversation(role, audioBlob) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', role);

  const audioElement = document.createElement('audio');
  audioElement.controls = true;
  audioElement.src = URL.createObjectURL(audioBlob);
  audioElement.autoplay = true;

  messageDiv.appendChild(audioElement);
  conversationDiv.appendChild(messageDiv);
  conversationDiv.scrollTop = conversationDiv.scrollHeight;
}

// Handle WebSocket connection open
ws.addEventListener('open', () => {
  console.log('Connected to proxy server.');
  statusDiv.textContent = 'Connected.';
  
  // Send initial response.create event with modalities set to audio and text
  const initialEvent = {
    type: 'response.create',
    response: {
      modalities: ['audio', 'text'],
      instructions: 'Please assist the user.',
    },
  };
  ws.send(JSON.stringify(initialEvent));
});

// Handle incoming WebSocket messages
ws.addEventListener('message', async (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);

  if (message.type === 'conversation.item.created') {
    const item = message.item;
    if (item.role === 'assistant' && item.content) {
      isResponding = true;
      interruptButton.disabled = false;
      for (const contentItem of item.content) {
        if (contentItem.type === 'text') {
          addMessageToConversation('assistant', contentItem.text);
        } else if (contentItem.type === 'audio') {
          const audioData = contentItem.audio;
          const audioBlob = base64ToBlob(audioData, 'audio/wav');
          addAudioToConversation('assistant', audioBlob);
          playAudioBlob(audioBlob);
        }
      }
      isResponding = false;
      interruptButton.disabled = true;
    }
  } else if (message.type === 'error') {
    console.error('Error:', message.error);
    statusDiv.textContent = `Error: ${message.error}`;
  }
});

// Handle WebSocket errors
ws.addEventListener('error', (error) => {
  console.error('WebSocket error:', error);
  statusDiv.textContent = 'WebSocket Error.';
});

// Handle WebSocket close
ws.addEventListener('close', () => {
  console.log('Connection closed.');
  statusDiv.textContent = 'Disconnected.';
  startButton.disabled = true;
  stopButton.disabled = true;
  interruptButton.disabled = true;
});

// Function to convert base64 to Blob
function base64ToBlob(base64, mime) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// Function to play audio Blob
function playAudioBlob(blob) {
  const audioURL = URL.createObjectURL(blob);
  const audio = new Audio(audioURL);
  audio.play();
}

// Handle Start Recording
startButton.addEventListener('click', async () => {
  if (isRecording) return;

  // Request microphone access
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        // Convert audio data to base64
        const reader = new FileReader();
        reader.readAsArrayBuffer(event.data);
        reader.onloadend = () => {
          const arrayBuffer = reader.result;
          // Convert to PCM 16-bit little endian, 24kHz, mono
          convertToPCM16LE(arrayBuffer).then((pcmData) => {
            const base64Audio = btoa(String.fromCharCode(...pcmData));
            const audioEvent = {
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_audio',
                    audio: base64Audio,
                  },
                ],
              },
            };
            ws.send(JSON.stringify(audioEvent));
            // Commit the audio buffer
            ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          });
        };
      }
    };

    mediaRecorder.start(100); // Collect 100ms chunks for more real-time streaming
    isRecording = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    interruptButton.disabled = true;
    statusDiv.textContent = 'Recording...';
  } catch (err) {
    console.error('Error accessing microphone:', err);
    statusDiv.textContent = 'Microphone access denied.';
  }
});

// Handle Stop Recording
stopButton.addEventListener('click', () => {
  if (!isRecording) return;

  mediaRecorder.stop();
  audioStream.getTracks().forEach(track => track.stop());
  isRecording = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  interruptButton.disabled = true;
  statusDiv.textContent = 'Stopped Recording.';
});

// Handle Interrupt
interruptButton.addEventListener('click', () => {
  if (isResponding && ws.readyState === WebSocket.OPEN) {
    const interruptEvent = {
      type: 'response.cancel',
    };
    ws.send(JSON.stringify(interruptEvent));
    isResponding = false;
    interruptButton.disabled = true;
    statusDiv.textContent = 'Response interrupted.';
  }
});

// Function to convert audio to PCM 16-bit little endian, 24kHz, mono
async function convertToPCM16LE(arrayBuffer) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 24000,
  });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  let channelData = audioBuffer.getChannelData(0); // Mono

  // Resample if necessary
  if (audioContext.sampleRate !== 24000) {
    const offlineContext = new OfflineAudioContext(1, audioBuffer.length, 24000);
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start(0);
    const resampledBuffer = await offlineContext.startRendering();
    channelData = resampledBuffer.getChannelData(0);
  }

  // Convert to 16-bit PCM
  const pcmData = new Int16Array(channelData.length);
  for (let i = 0; i < channelData.length; i++) {
    let s = Math.max(-1, Math.min(1, channelData[i]));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  // Convert Int16Array to Uint8Array (little endian)
  const uint8Buffer = new Uint8Array(pcmData.buffer);

  return uint8Buffer;
}
