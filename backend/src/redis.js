const { createClient } = require('redis');

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.error('Redis client error', err.message));

let connecting = null;
function connect() {
  if (!connecting) connecting = client.connect().catch((err) => {
    console.error('Redis connect failed:', err.message);
    connecting = null;
    throw err;
  });
  return connecting;
}

// Cache reads are best-effort: any Redis hiccup should degrade to "no cache",
// never break the request.
async function cacheGet(key) {
  try {
    await connect();
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  try {
    await connect();
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    // ignore - cache is not the source of truth
  }
}

async function cacheDel(key) {
  try {
    await connect();
    await client.del(key);
  } catch {
    // ignore
  }
}

module.exports = { cacheGet, cacheSet, cacheDel, PRODUCT_LIST_CACHE_KEY: 'products:list:default' };
