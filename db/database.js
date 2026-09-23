const { MongoClient, ObjectId } = require('mongodb');

const mongoUrl = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'first-aircond';
let clientPromise;

function getDatabase() {
  if (!mongoUrl) throw new Error('MONGODB_URI is required.');
  if (!clientPromise) clientPromise = new MongoClient(mongoUrl).connect();
  return clientPromise.then((client) => client.db(databaseName));
}

function toObjectId(id) { return ObjectId.isValid(id) ? new ObjectId(id) : null; }

function serializeProduct(product) {
  if (!product) return null;
  const { _id, imageData, imageMime, ...rest } = product;
  return { ...rest, id: _id.toString(), image: imageData ? `/api/images/${_id}` : null };
}

async function listProducts({ category, search } = {}) {
  const db = await getDatabase();
  const filter = {};
  if (category && category !== 'all') filter.category = category;
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { brand: { $regex: search, $options: 'i' } },
    { description: { $regex: search, $options: 'i' } },
  ];
  const products = await db.collection('products').find(filter).sort({ createdAt: -1 }).toArray();
  return products.map(serializeProduct);
}

async function getProduct(id, includeImage = false) {
  const objectId = toObjectId(id);
  if (!objectId) return null;
  const db = await getDatabase();
  const product = await db.collection('products').findOne({ _id: objectId });
  return includeImage ? product : serializeProduct(product);
}

async function listCategories() {
  const db = await getDatabase();
  return db.collection('products').distinct('category');
}

async function createMessage(message) {
  const db = await getDatabase();
  await db.collection('messages').insertOne({ ...message, createdAt: new Date(), read: false });
}

async function listAdminProducts() {
  const db = await getDatabase();
  const products = await db.collection('products').find().sort({ createdAt: -1 }).toArray();
  return products.map(serializeProduct);
}

async function countUnreadMessages() {
  const db = await getDatabase();
  return db.collection('messages').countDocuments({ read: false });
}

async function createProduct(product) {
  const db = await getDatabase();
  const now = new Date();
  const result = await db.collection('products').insertOne({ ...product, createdAt: now, updatedAt: now });
  return result.insertedId.toString();
}

async function updateProduct(id, product) {
  const objectId = toObjectId(id);
  if (!objectId) return false;
  const db = await getDatabase();
  const changes = Object.fromEntries(Object.entries(product).filter(([, value]) => value !== undefined));
  const result = await db.collection('products').updateOne({ _id: objectId }, { $set: { ...changes, updatedAt: new Date() } });
  return result.matchedCount > 0;
}

async function deleteProduct(id) {
  const objectId = toObjectId(id);
  if (!objectId) return;
  const db = await getDatabase();
  await db.collection('products').deleteOne({ _id: objectId });
}

async function listMessages() {
  const db = await getDatabase();
  const messages = await db.collection('messages').find().sort({ createdAt: -1 }).toArray();
  return messages.map(({ _id, createdAt, ...message }) => ({ ...message, id: _id.toString(), created_at: createdAt }));
}

async function markMessagesRead() {
  const db = await getDatabase();
  await db.collection('messages').updateMany({ read: false }, { $set: { read: true } });
}

async function deleteMessage(id) {
  const objectId = toObjectId(id);
  if (!objectId) return;
  const db = await getDatabase();
  await db.collection('messages').deleteOne({ _id: objectId });
}

module.exports = { getProduct, listProducts, listCategories, createMessage, listAdminProducts, countUnreadMessages, createProduct, updateProduct, deleteProduct, listMessages, markMessagesRead, deleteMessage };