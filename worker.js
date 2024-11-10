const amqp = require('amqplib');
const axios = require('axios');

async function start() {
  const conn = await amqp.connect('amqp://localhost');
  const channel = await conn.createChannel();
  const channel2 = await conn.createChannel();
  const queue = 'chat_queries';
  channel.assertQueue(queue, { durable: true });

  const responseQueue = 'chat_response';
  channel2.assertQueue(responseQueue, { durable: true });

  channel.consume(queue, async (msg) => {
    if (msg !== null) {
      const { query, clientId } = JSON.parse(msg.content.toString());
      console.log(`Received query: ${query}, Client ID: ${clientId}`);

      try {
        // Send query to Python server
        const response = await axios.post('api', { query });
        console.log('Response from Python:', response.data);

        //send response to RabbitMQ
        await channel2.sendToQueue(responseQueue, Buffer.from(JSON.stringify({ response, clientId, query })), { persistent: true });
      } catch (error) {
        console.error('Error calling Python server:', error);
      }

      channel.ack(msg);
    }
  });
}

start();
