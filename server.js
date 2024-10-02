const express = require('express');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });

  openaiWs.on('open', () => {
    ws.send(JSON.stringify({ type: 'connection', status: 'connected' }));
  });

  openaiWs.on('message', (data) => {
    ws.send(data);
  });

  openaiWs.on('close', () => {
    ws.close();
  });

  ws.on('message', (message) => {
    openaiWs.send(message);
  });

  ws.on('close', () => {
    openaiWs.close();
  });
});
