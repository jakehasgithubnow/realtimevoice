class AudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const inputChannel = input[0];
        this.port.postMessage(inputChannel);
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
