const recordButton = document.getElementById('recordButton');
const transcriptDiv = document.getElementById('transcript');
const responseDiv = document.getElementById('response');

let mediaRecorder;
let socket;
let audioChunks = [];

// Replace with your Heroku backend URL
const BACKEND_URL = 'wss://realtimevoice-new-1095f45e1cdd.herokuapp.com/';

recordButton.addEventListener('click', () => {
    if (recordButton.textContent === 'Start Recording') {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            recordButton.textContent = 'Stop Recording';

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioChunks = [];
                sendAudio(audioBlob);
            };

            connectWebSocket();
        })
        .catch(err => {
            console.error('Error accessing microphone:', err);
        });
}

function stopRecording() {
    mediaRecorder.stop();
    recordButton.textContent = 'Start Recording';
    if (socket) {
        socket.close();
    }
}

function connectWebSocket() {
    socket = new WebSocket(BACKEND_URL);

    socket.onopen = () => {
        console.log('Connected to backend WebSocket.');
        transcriptDiv.textContent = 'Connected. Recording...';
    };

    socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'transcript') {
            transcriptDiv.textContent = data.text;
        } else if (data.type === 'response') {
            responseDiv.textContent = data.text;
        }
    };

    socket.onerror = error => {
        console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed.');
    };
}

function sendAudio(audioBlob) {
    const reader = new FileReader();
    reader.readAsArrayBuffer(audioBlob);
    reader.onloadend = () => {
        const arrayBuffer = reader.result;
        const base64Audio = arrayBufferToBase64(arrayBuffer);
        socket.send(JSON.stringify({
            type: 'input_audio',
            audio: base64Audio
        }));
    };
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => binary += String.fromCharCode(b));
    return btoa(binary);
}
