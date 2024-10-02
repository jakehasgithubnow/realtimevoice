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

        // Update this line with your actual Render.com URL
        socket = new WebSocket('wss://realtimevoice.onrender.com');

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

            // Replace ScriptProcessorNode with AudioWorkletNode
            audioContext.audioWorklet.addModule('audio-processor.js').then(() => {
                const audioWorklet = new AudioWorkletNode(audioContext, 'audio-processor');
                source.connect(audioWorklet).connect(audioContext.destination);

                audioWorklet.port.onmessage = (event) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            data: btoa(String.fromCharCode.apply(null, event.data))
                        }));
                    }
                };
            });
        };

        socket.onmessage = async (event) => {
            try {
                let message;
                if (event.data instanceof Blob) {
                    // Handle binary data (likely audio)
                    const arrayBuffer = await event.data.arrayBuffer();
                    const audioBuffer = new ArrayBuffer(arrayBuffer.byteLength);
                    new Uint8Array(audioBuffer).set(new Uint8Array(arrayBuffer));
                    audioQueue.push(audioBuffer);
                    if (!isPlaying) {
                        playNextAudio();
                    }
                } else {
                    // Handle text data (JSON)
                    message = JSON.parse(event.data);
                    if (message.type === 'conversation.item.created' && message.item.role === 'assistant') {
                        const content = message.item.content[0];
                        if (content.type === 'text') {
                            addMessageToConversation('Assistant', content.text);
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing message:', error);
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
    
    try {
        const decodedBuffer = await audioContext.decodeAudioData(audioBuffer);
        const source = audioContext.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(audioContext.destination);
        source.onended = playNextAudio;
        source.start(0);
    } catch (error) {
        console.error('Error decoding audio data:', error);
        playNextAudio();
    }
}
