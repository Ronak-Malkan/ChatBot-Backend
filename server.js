const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const amqp = require('amqplib');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let channel, queue, channel2, responseQueue;

// Store connections with clientId as the key
const connections = new Map();

// Function to connect to RabbitMQ
async function connectRabbitMQ() {
  const conn = await amqp.connect('amqp://localhost');
  channel = await conn.createChannel();
  channel2 = await conn.createChannel();
  queue = 'chat_queries';
  responseQueue = 'chat_response';
  channel.assertQueue(queue, { durable: true });
  channel2.assertQueue(responseQueue, { durable: true });

  // Listen for messages from the worker and send to clients
    channel2.consume(responseQueue, async (msg) => {
        if (msg !== null) {
            const { response, clientId } = JSON.parse(msg.content.toString());
            const ws = connections.get(clientId);

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ response }));
            }
            // Acknowledge the message in the queue
            channel.ack(msg);
        }
    });
}

connectRabbitMQ().then(() => console.log('Connected to RabbitMQ')).catch(err => console.error(err));

// WebSocket connection
wss.on('connection', function connection(ws) {
    console.log('Client Connected');
    const clientId = ws._socket.remoteAddress + ':' + ws._socket.remotePort;
  // Store the connection with the unique clientId
  connections.set(clientId, ws);

  ws.on('message', async function incoming(message) {
    console.log('received: %s', message);
    const msg = JSON.parse(message);
    const { query } = msg;
    // Send message to RabbitMQ
    await channel.sendToQueue(queue, Buffer.from(JSON.stringify({ query, clientId })), { persistent: true });
  });

  ws.on('close', function close() {
    // Find the clientId of the closed connection and remove it from the map
    for (let [clientId, socket] of connections.entries()) {
        if (socket === ws) {
            connections.delete(clientId);
            break;
        }
    }
    console.log('Client disconnected');
  });
});

server.listen(8080, () => {
  console.log('Listening on http://localhost:8080');
});
