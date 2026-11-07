const { Kafka, logLevel } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'backend-api',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  logLevel: logLevel.ERROR,
  retry: { retries: 8, initialRetryTime: 500 },
});

const producer = kafka.producer();
let connected = false;

async function connectProducer() {
  if (connected) return;
  await producer.connect();
  connected = true;
  console.log('Kafka producer connected');
}

// Fire-and-forget event publish. Never let an analytics event break a request.
async function publishEvent(topic, payload) {
  try {
    await connectProducer();
    await producer.send({
      topic,
      messages: [{
        key: String(payload.id || payload.userId || ''),
        value: JSON.stringify({ ...payload, emittedAt: new Date().toISOString() }),
      }],
    });
  } catch (err) {
    console.error(`Failed to publish event to ${topic}:`, err.message);
  }
}

module.exports = { publishEvent, connectProducer };
