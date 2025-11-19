const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'test';
// --- START PATCH ---
const LOCAL_CATEGORIES_PATH = path.join(__dirname, 'categories.json');

// try to read server-side categories.json first (kept for manual whitelist)
let LOCAL_CATEGORIES = {};
try {
  LOCAL_CATEGORIES = JSON.parse(fs.readFileSync(LOCAL_CATEGORIES_PATH, 'utf8'));
} catch (e) {
  // fallback: if categories.json not present, use bundled local-configs.json
  try {
    // local-configs.json contains full configs keyed by category
    const bundled = require('./local-configs.json');
    // convert bundled config to categories map { category: { collection, fields } }
    for (const k of Object.keys(bundled)) {
      const c = bundled[k];
      LOCAL_CATEGORIES[k] = { collection: c.collection, fields: (c.fields || []).map(f => f.name) };
    }
    console.warn('categories.json not found — using bundled local-configs.json fallback');
  } catch (err2) {
    console.warn('Could not load local-configs.json fallback:', err2.message);
  }
}

let cachedClient = global._mongoClient || null;
let cachedDb = global._mongoDb || null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function getDb() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI not set in env');
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

// Helper: find config info (fields + collection) from DB _categories or local categories.json
async function resolveCategoryInfo(category) {
  // first try DB meta collection _categories
  try {
    const db = await getDb();
    const meta = db.collection('_categories');
    const doc = await meta.findOne({ category });
    if (doc) return { collection: doc.collection, fields: doc.fields };
  } catch (e) {
    // ignore DB errors here, fallback to local
    console.warn('Error reading _categories:', e.message);
  }
  // fallback to local categories.json
  if (LOCAL_CATEGORIES && LOCAL_CATEGORIES[category]) {
    return { collection: LOCAL_CATEGORIES[category].collection, fields: LOCAL_CATEGORIES[category].fields };
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,PUT,DELETE' }, body: '' };
  }
  const params = event.queryStringParameters || {};
  const category = params.category || (event.headers['x-category'] || '');
  if (!category) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'category required' }) };

  try {
    const info = await resolveCategoryInfo(category);
    if (!info) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'unknown category' }) };
    const collectionName = info.collection;
    const allowedFields = Array.isArray(info.fields) ? info.fields : [];

    const db = await getDb();
    const col = db.collection(collectionName);

    // GET: list items (supports ?limit=)
    if (event.httpMethod === 'GET') {
      const limit = Math.min(parseInt(params.limit || '100', 10), 1000);
      const docs = await col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: docs }) };
    }

    // POST: create new document with server-side validation (whitelist)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      // whitelist fields
      const doc = { createdAt: new Date() };
      for (const f of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, f)) {
          doc[f] = body[f];
        } else {
          // if field has default, attempt to take default from config (not available here)
        }
      }
      // basic validation: required fields check via local categories.json if available
      // (We recommend more advanced validation in production)
      // insert
      const result = await col.insertOne(doc);
      return { statusCode: 201, headers: CORS, body: JSON.stringify({ insertedId: result.insertedId }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    console.error('mongo-proxy error', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};