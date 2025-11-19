const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'test';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

let cachedClient = global._mongoClient || null;
let cachedDb = global._mongoDb || null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token'
};

async function getDb() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI not set');
  if (!cachedClient) {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    cachedClient = client;
    cachedDb = client.db(DB_NAME);
    global._mongoClient = cachedClient;
    global._mongoDb = cachedDb;
  }
  return cachedDb;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' }, body: '' };
  }
  const token = event.headers['x-admin-token'] || '';
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    if (!body || !body.category || !body.collection || !Array.isArray(body.fields)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'category, collection, fields[] required' }) };
    }

    const db = await getDb();
    const col = db.collection('configs');

    // upsert by category
    const now = new Date();
    const cfg = { ...body, updatedAt: now, createdAt: body.createdAt || now };
    await col.updateOne({ category: body.category }, { $set: cfg }, { upsert: true });

    // also insert into server-side categories mapping collection for quick lookup (optional)
    const metaCol = db.collection('_categories');
    await metaCol.updateOne({ category: body.category }, { $set: { collection: body.collection, fields: body.fields } }, { upsert: true });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, config: cfg }) };
  } catch (err) {
    console.error('admin-config error', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};