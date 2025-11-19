const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'test';

// local fallback configs bundled with function
const localConfigs = require('./local-configs.json');

// cache
let cachedClient = global._mongoClient || null;
let cachedDb = global._mongoDb || null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function getDb() {
  if (!MONGODB_URI) return null;
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
    return { statusCode: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,OPTIONS' }, body: '' };
  }
  const params = event.queryStringParameters || {};
  const category = params.category;
  if (!category) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'category required' }) };

  try {
    // try DB first
    const db = await getDb();
    if (db) {
      const col = db.collection('configs');
      const cfg = await col.findOne({ category });
      if (cfg) {
        // remove internal _id
        delete cfg._id;
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ config: cfg }) };
      }
    }

    // fallback to bundled local config
    if (localConfigs[category]) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ config: localConfigs[category] }) };
    }

    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'config not found' }) };
  } catch (err) {
    console.error('config-proxy error', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};