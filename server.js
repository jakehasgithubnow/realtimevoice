const express = require('express');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('./'));

const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');

  let openaiWs;

  const connectToOpenAI = () => {
    openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openaiWs.on('open', () => {
      console.log('Connected to OpenAI WebSocket');
      ws.send(JSON.stringify({ type: 'connection', status: 'connected' }));
    });

    openaiWs.on('message', (data) => {
      ws.send(data);
    });

    openaiWs.on('close', () => {
      console.log('OpenAI WebSocket closed');
      ws.close();
    });

    openaiWs.on('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Error connecting to OpenAI' }));
    });
  };

  connectToOpenAI();

  ws.on('message', (message) => {
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(message);
    } else {
      console.log('OpenAI WebSocket not ready, attempting to reconnect...');
      connectToOpenAI();
    }
  });

  ws.on('close', () => {
    console.log('Client WebSocket closed');
    if (openaiWs) {
      openaiWs.close();
    }
  });
});
