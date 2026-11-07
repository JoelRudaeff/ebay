const { Kafka, logLevel } = require('kafkajs');

// Demo notification service: consumes domain events and logs what a real
// email/SMS/push provider would send. Swap the `notify()` body for a real
// provider (SES, Twilio, etc.) to make this production-ready.

const kafka = new Kafka({
  clientId: 'notification-consumer',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  logLevel: logLevel.ERROR,
  retry: { retries: 20, initialRetryTime: 1000 },
});

const consumer = kafka.consumer({ groupId: 'notification-consumer-group' });

function notify(topic, event) {
  switch (event.type) {
    case 'user.registered':
      console.log(`[notify] Welcome email -> ${event.email}`);
      break;
    case 'order.created':
      console.log(`[notify] Order confirmation -> buyer #${event.buyerId} for order #${event.orderId} ($${(event.totalCents / 100).toFixed(2)})`);
      break;
    case 'bid.placed':
      console.log(`[notify] Outbid alert check -> product #${event.productId}, new bid $${(event.amountCents / 100).toFixed(2)}`);
      break;
    default:
      console.log(`[notify] (no template) ${topic}: ${event.type}`);
  }
}

(async () => {
  await consumer.connect();
  await Promise.all(
    ['user.events', 'order.events', 'bid.events'].map((topic) => consumer.subscribe({ topic, fromBeginning: false }))
  );

  console.log('notification-consumer running');

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        notify(topic, JSON.parse(message.value.toString()));
      } catch (err) {
        console.error('Failed to process message', err.message);
      }
    },
  });
})().catch((err) => {
  console.error('notification-consumer crashed', err);
  process.exit(1);
});
