const fs = require('fs/promises');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

function restoreBuffers(value) {
  if (Array.isArray(value)) return value.map(restoreBuffers);
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreBuffers(item)]));
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const sourcePath = path.join(__dirname, '..', '.local-data.json');
  const source = restoreBuffers(JSON.parse(await fs.readFile(sourcePath, 'utf8')));
  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'first-aircond');
    if (process.argv.includes('--repair-settings')) {
      const { updatedAt, ...settings } = source.siteSettings || {};
      await db.collection('site_settings').updateOne(
        { key: 'homepage' },
        { $set: { ...settings, updatedAt: updatedAt ? new Date(updatedAt) : new Date() } },
        { upsert: true },
      );
      await db.collection('siteSettings').deleteMany({ key: 'main' });
      console.log('Homepage settings migrated.');
      return;
    }
    const counts = await Promise.all(['products', 'categories', 'messages'].map((name) => db.collection(name).countDocuments()));
    const settingsExist = Boolean(await db.collection('site_settings').findOne({ key: 'homepage' }));
    if (counts.some(Boolean) || settingsExist) throw new Error('Destination is not empty; migration stopped to prevent duplicates.');

    const categoryIds = new Map((source.categories || []).map((category) => [category.id, new ObjectId()]));
    const categories = (source.categories || []).map(({ id, parentId, createdAt, ...category }) => ({
      ...category,
      _id: categoryIds.get(id),
      parentId: categoryIds.get(parentId)?.toString() || null,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    }));
    const products = (source.products || []).map(({ id, createdAt, updatedAt, ...product }) => ({
      ...product,
      _id: new ObjectId(),
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
    }));
    const messages = (source.messages || []).map(({ id, createdAt, ...message }) => ({
      ...message,
      _id: new ObjectId(),
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    }));

    if (categories.length) await db.collection('categories').insertMany(categories);
    if (products.length) await db.collection('products').insertMany(products);
    if (messages.length) await db.collection('messages').insertMany(messages);
    if (source.siteSettings) {
      const { updatedAt, ...settings } = source.siteSettings;
      await db.collection('site_settings').insertOne({ key: 'homepage', ...settings, updatedAt: updatedAt ? new Date(updatedAt) : new Date() });
    }
    console.log(`Migrated ${products.length} product(s), ${categories.length} category record(s), ${messages.length} message(s), and ${source.siteSettings ? 1 : 0} settings record.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
