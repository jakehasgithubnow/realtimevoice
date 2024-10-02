// script.js

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const responseAudio = document.getElementById('responseAudio');

let mediaRecorder;
let socket;
let audioChunks = [];

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  stopBtn.disabled = false;

  // Get user audio
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.start();

  mediaRecorder.addEventListener('dataavailable', event => {
    audioChunks.push(event.data);
    // Convert audio chunk to base64 and send to backend
    const reader = new FileReader();
    reader.readAsDataURL(event.data);
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      sendAudioChunk(base64data);
    };
  });

  mediaRecorder.addEventListener('stop', () => {
    // Handle stopping of recording
    console.log('Recording stopped');
  });

  // Establish WebSocket connection
  const backendURL = 'https://realtimevoice.vercel.app/api/realtime'; // Replace with your Vercel backend URL
  socket = new WebSocket(backendURL);

  socket.onopen = () => {
    console.log('WebSocket connection opened');
    // Initialize session or send initial events if necessary
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);
    // Handle received audio data
    if (data.type === 'audio_response') {
      const audioBlob = base64ToBlob(data.audio, 'audio/wav');
      const audioUrl = URL.createObjectURL(audioBlob);
      responseAudio.src = audioUrl;
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  socket.onclose = () => {
    console.log('WebSocket connection closed');
  };
});

stopBtn.addEventListener('click', () => {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  mediaRecorder.stop();
  socket.close();
});

function sendAudioChunk(base64Audio) {
  if (socket.readyState === WebSocket.OPEN) {
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_audio',
          audio: base64Audio
        }]
      }
    };
    socket.send(JSON.stringify(event));
  }
}

function base64ToBlob(base64, type = 'audio/wav') {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: type });
}
