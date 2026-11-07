const { Kafka, logLevel } = require('kafkajs');

const ES_URL = process.env.ELASTIC_URL || 'http://elasticsearch:9200';
const ES_AUTH = 'Basic ' + Buffer.from(`${process.env.ELASTIC_USER}:${process.env.ELASTIC_PASSWORD}`).toString('base64');

const TOPICS = ['user.events', 'product.events', 'order.events', 'bid.events'];

const kafka = new Kafka({
  clientId: 'analytics-consumer',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  logLevel: logLevel.ERROR,
  retry: { retries: 20, initialRetryTime: 1000 },
});

const consumer = kafka.consumer({ groupId: 'analytics-consumer-group' });

function todayIndex() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `events-${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

async function waitForElasticsearch(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(`${ES_URL}/_cluster/health`, { headers: { Authorization: ES_AUTH } });
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
    console.log(`Waiting for Elasticsearch... (${i + 1}/${retries})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Elasticsearch never became available');
}

async function indexEvent(topic, event) {
  const doc = { ...event, topic, '@timestamp': event.emittedAt || new Date().toISOString() };
  const resp = await fetch(`${ES_URL}/${todayIndex()}/_doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: ES_AUTH },
    body: JSON.stringify(doc),
  });
  if (!resp.ok) {
    console.error(`Failed to index event (${resp.status}):`, await resp.text());
  }
}

(async () => {
  await waitForElasticsearch();

  await consumer.connect();
  await Promise.all(TOPICS.map((topic) => consumer.subscribe({ topic, fromBeginning: false })));

  console.log(`analytics-consumer subscribed to: ${TOPICS.join(', ')}`);

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        await indexEvent(topic, event);
      } catch (err) {
        console.error('Failed to process message', err.message);
      }
    },
  });
})().catch((err) => {
  console.error('analytics-consumer crashed', err);
  process.exit(1);
});
