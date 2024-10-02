let socket;
let mediaRecorder;
let audioContext;
let audioStream;
let audioQueue = [];
let isPlaying = false;

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusElement = document.getElementById('status');
const conversationElement = document.getElementById('conversation');

startButton.addEventListener('click', startConversation);
stopButton.addEventListener('click', stopConversation);

async function startConversation() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(audioStream);

        socket = new WebSocket('wss://your-server-url.com'); // Replace with your server URL

        socket.onopen = () => {
            statusElement.textContent = 'Status: Connected';
            startButton.disabled = true;
            stopButton.disabled = false;

            socket.send(JSON.stringify({
                type: 'response.create',
                response: {
                    modalities: ['text', 'audio'],
                    instructions: 'You are a helpful AI assistant. Respond concisely.'
                }
            }));

            const processor = audioContext.createScriptProcessor(1024, 1, 1);
            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const uint8Array = new Uint8Array(inputData.buffer);
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'input_audio_buffer.append',
                        data: btoa(String.fromCharCode.apply(null, uint8Array))
                    }));
                }
            };
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'conversation.item.created' && message.item.role === 'assistant') {
                const content = message.item.content[0];
                if (content.type === 'text') {
                    addMessageToConversation('Assistant', content.text);
                } else if (content.type === 'audio') {
                    const audioData = atob(content.audio);
                    const audioBuffer = new ArrayBuffer(audioData.length);
                    const view = new Uint8Array(audioBuffer);
                    for (let i = 0; i < audioData.length; i++) {
                        view[i] = audioData.charCodeAt(i);
                    }
                    audioQueue.push(audioBuffer);
                    if (!isPlaying) {
                        playNextAudio();
                    }
                }
            }
        };

        socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            statusElement.textContent = 'Status: Error';
        };

        socket.onclose = () => {
            statusElement.textContent = 'Status: Disconnected';
            startButton.disabled = false;
            stopButton.disabled = true;
        };
    } catch (error) {
        console.error('Error starting conversation:', error);
        statusElement.textContent = 'Status: Error';
    }
}

function stopConversation() {
    if (socket) {
        socket.close();
    }
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusElement.textContent = 'Status: Disconnected';
}

function addMessageToConversation(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    conversationElement.appendChild(messageElement);
    conversationElement.scrollTop = conversationElement.scrollHeight;
}

async function playNextAudio() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        return;
    }

    isPlaying = true;
    const audioBuffer = audioQueue.shift();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createBufferSource();

    try {
        const decodedBuffer = await audioContext.decodeAudioData(audioBuffer);
        source.buffer = decodedBuffer;
        source.connect(audioContext.destination);
        source.onended = playNextAudio;
        source.start(0);
    } catch (error) {
        console.error('Error decoding audio data:', error);
        playNextAudio();
    }
}
