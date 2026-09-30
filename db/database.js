const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const mongoUrl = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'first-aircond';
let clientPromise;
const localDataFile = path.join(__dirname, '..', '.local-data.json');

async function readLocalData() {
  try {
    const data = JSON.parse(await fs.readFile(localDataFile, 'utf8'));
    return { products: [], categories: [], messages: [], siteSettings: null, ...data };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { products: [], categories: [], messages: [], siteSettings: null };
  }
}

async function writeLocalData(data) {
  await fs.writeFile(localDataFile, JSON.stringify(data, null, 2), 'utf8');
}

function localImageBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  return null;
}

function serializeLocalProduct(product) {
  if (!product) return null;
  const { imageData, imageMime, ...rest } = product;
  return { ...rest, image: imageData ? `/api/images/${product.id}` : null };
}

function serializeCategory(category) {
  if (!category) return null;
  const id = category.id || (category._id && category._id.toString());
  const { _id, imageData, imageMime, ...rest } = category;
  return { ...rest, id, image: imageData ? `/api/category-images/${encodeURIComponent(id)}` : null };
}

function categoryImageLayout(values = {}) {
  const number = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
  return {
    imageFit: values.imageFit === 'contain' ? 'contain' : 'cover',
    imageSize: number(values.imageSize, 100, 25, 200),
    imageMarginTop: number(values.imageMarginTop, 0, -200, 200),
    imageMarginRight: number(values.imageMarginRight, 0, -200, 200),
    imageMarginBottom: number(values.imageMarginBottom, 0, -200, 200),
    imageMarginLeft: number(values.imageMarginLeft, 0, -200, 200),
  };
}

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

async function listProducts({ category, brand, search, size } = {}) {
  if (!mongoUrl) {
    const data = await readLocalData();
    const term = (search || '').toLowerCase();
    return data.products
      .filter((p) => (!category || category === 'all' || p.category === category) && (!brand || String(p.brand || '').toLowerCase() === String(brand).toLowerCase()) && (!size || p.size === size) && (!term || [p.name, p.brand, p.description].some((v) => String(v || '').toLowerCase().includes(term))))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(serializeLocalProduct);
  }
  const db = await getDatabase();
  const filter = {};
  if (category && category !== 'all') filter.category = category;
  if (size) filter.size = size;
  if (brand) filter.brand = { $regex: `^${String(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { brand: { $regex: search, $options: 'i' } },
    { description: { $regex: search, $options: 'i' } },
  ];
  const products = await db.collection('products').find(filter).sort({ createdAt: -1 }).toArray();
  return products.map(serializeProduct);
}

async function getProduct(id, includeImage = false) {
  if (!mongoUrl) {
    const data = await readLocalData();
    const product = data.products.find((item) => item.id === id);
    if (!product) return null;
    if (includeImage) return { ...product, imageData: localImageBuffer(product.imageData) };
    return serializeLocalProduct(product);
  }
  const objectId = toObjectId(id);
  if (!objectId) return null;
  const db = await getDatabase();
  const product = await db.collection('products').findOne({ _id: objectId });
  return includeImage ? product : serializeProduct(product);
}

async function listCategories() {
  const records = await listCategoryRecords();
  return records;
}

async function listCategoryRecords() {
  if (!mongoUrl) {
    const data = await readLocalData();
    const records = (data.categories || []).map(serializeCategory);
    const known = new Set(records.map((item) => item.name));
    const legacy = [...new Set(data.products.map((p) => p.category).filter(Boolean))]
      .filter((name) => !known.has(name))
      .map((name) => ({ id: `legacy-${name}`, name, nameEn: name }));
    return [...records, ...legacy];
  }
  const db = await getDatabase();
  const [categories, productNames] = await Promise.all([
    db.collection('categories').find().sort({ order: 1, createdAt: 1 }).toArray(),
    db.collection('products').distinct('category'),
  ]);
  const known = new Set(categories.map((item) => item.name));
  return [
    ...categories.map(serializeCategory),
    ...productNames.filter((name) => name && !known.has(name)).map((name) => ({ id: `legacy-${name}`, name, nameEn: name })),
  ];
}

async function createCategory({ name, nameEn, parentId, imageData, imageMime, ...layout }) {
  const category = { name: name.trim(), nameEn: (nameEn || name).trim(), parentId: parentId || null, ...categoryImageLayout(layout), ...(imageData ? { imageData, imageMime } : {}), createdAt: new Date() };
  if (!mongoUrl) {
    const data = await readLocalData();
    data.categories.push({ ...category, id: crypto.randomUUID(), createdAt: category.createdAt.toISOString() });
    return writeLocalData(data);
  }
  const db = await getDatabase();
  await db.collection('categories').insertOne(category);
}

async function updateCategory(id, { name, nameEn, oldName, parentId, imageData, imageMime, removeImage, ...layout }) {
  const nextName = name.trim();
  const nextParentId = parentId && parentId !== id ? parentId : null;
  const layoutChanges = categoryImageLayout(layout);
  if (!mongoUrl) {
    const data = await readLocalData();
    const index = data.categories.findIndex((item) => item.id === id);
    const imageChanges = removeImage ? { imageData: null, imageMime: null } : (imageData ? { imageData, imageMime } : {});
    if (index >= 0) data.categories[index] = { ...data.categories[index], name: nextName, nameEn: (nameEn || nextName).trim(), parentId: nextParentId, ...layoutChanges, ...imageChanges };
    else data.categories.push({ id: crypto.randomUUID(), name: nextName, nameEn: (nameEn || nextName).trim(), parentId: nextParentId, ...layoutChanges, ...imageChanges, createdAt: new Date().toISOString() });
    data.products = data.products.map((product) => product.category === oldName ? { ...product, category: nextName } : product);
    return writeLocalData(data);
  }
  const db = await getDatabase();
  const objectId = toObjectId(id);
  const imageChanges = removeImage ? { imageData: null, imageMime: null } : (imageData ? { imageData, imageMime } : {});
  if (objectId) await db.collection('categories').updateOne({ _id: objectId }, { $set: { name: nextName, nameEn: (nameEn || nextName).trim(), parentId: nextParentId, ...layoutChanges, ...imageChanges } });
  else await db.collection('categories').insertOne({ name: nextName, nameEn: (nameEn || nextName).trim(), parentId: nextParentId, ...layoutChanges, ...imageChanges, createdAt: new Date() });
  await db.collection('products').updateMany({ category: oldName }, { $set: { category: nextName } });
}

async function getCategoryImage(id) {
  if (!mongoUrl) {
    const data = await readLocalData();
    const category = data.categories.find((item) => item.id === id);
    if (!category || !category.imageData) return null;
    return { data: localImageBuffer(category.imageData), mime: category.imageMime };
  }
  const objectId = toObjectId(id);
  if (!objectId) return null;
  const db = await getDatabase();
  const category = await db.collection('categories').findOne({ _id: objectId }, { projection: { imageData: 1, imageMime: 1 } });
  return category && category.imageData ? { data: category.imageData.buffer, mime: category.imageMime } : null;
}

async function deleteCategory(id, name) {
  if (!mongoUrl) {
    const data = await readLocalData();
    data.categories = data.categories.filter((item) => item.id !== id);
    data.categories = data.categories.map((item) => item.parentId === id ? { ...item, parentId: null } : item);
    data.products = data.products.map((product) => product.category === name ? { ...product, category: 'غير مصنف' } : product);
    return writeLocalData(data);
  }
  const db = await getDatabase();
  const objectId = toObjectId(id);
  if (objectId) await db.collection('categories').deleteOne({ _id: objectId });
  await db.collection('categories').updateMany({ parentId: id }, { $set: { parentId: null } });
  await db.collection('products').updateMany({ category: name }, { $set: { category: 'غير مصنف' } });
}

async function createMessage(message) {
  if (!mongoUrl) {
    const data = await readLocalData();
    data.messages.push({ ...message, id: crypto.randomUUID(), createdAt: new Date().toISOString(), read: false });
    return writeLocalData(data);
  }
  const db = await getDatabase();
  await db.collection('messages').insertOne({ ...message, createdAt: new Date(), read: false });
}

async function listAdminProducts() {
  if (!mongoUrl) return listProducts();
  const db = await getDatabase();
  const products = await db.collection('products').find().sort({ createdAt: -1 }).toArray();
  return products.map(serializeProduct);
}

async function countUnreadMessages() {
  if (!mongoUrl) {
    const data = await readLocalData();
    return data.messages.filter((message) => !message.read).length;
  }
  const db = await getDatabase();
  return db.collection('messages').countDocuments({ read: false });
}

async function createProduct(product) {
  if (!mongoUrl) {
    const data = await readLocalData();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    data.products.push({ ...product, id, createdAt: now, updatedAt: now });
    await writeLocalData(data);
    return id;
  }
  const db = await getDatabase();
  const now = new Date();
  const result = await db.collection('products').insertOne({ ...product, createdAt: now, updatedAt: now });
  return result.insertedId.toString();
}

async function updateProduct(id, product) {
  if (!mongoUrl) {
    const data = await readLocalData();
    const index = data.products.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const changes = Object.fromEntries(Object.entries(product).filter(([, value]) => value !== undefined));
    data.products[index] = { ...data.products[index], ...changes, updatedAt: new Date().toISOString() };
    await writeLocalData(data);
    return true;
  }
  const objectId = toObjectId(id);
  if (!objectId) return false;
  const db = await getDatabase();
  const changes = Object.fromEntries(Object.entries(product).filter(([, value]) => value !== undefined));
  const result = await db.collection('products').updateOne({ _id: objectId }, { $set: { ...changes, updatedAt: new Date() } });
  return result.matchedCount > 0;
}

async function deleteProduct(id) {
  if (!mongoUrl) {
    const data = await readLocalData();
    data.products = data.products.filter((item) => item.id !== id);
    return writeLocalData(data);
  }
  const objectId = toObjectId(id);
  if (!objectId) return;
  const db = await getDatabase();
  await db.collection('products').deleteOne({ _id: objectId });
}

async function listMessages() {
  if (!mongoUrl) {
    const data = await readLocalData();
    return data.messages.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(({ createdAt, ...message }) => ({ ...message, created_at: createdAt }));
  }
  const db = await getDatabase();
  const messages = await db.collection('messages').find().sort({ createdAt: -1 }).toArray();
  return messages.map(({ _id, createdAt, ...message }) => ({ ...message, id: _id.toString(), created_at: createdAt }));
}

async function markMessagesRead() {
  if (!mongoUrl) {
    const data = await readLocalData();
    data.messages = data.messages.map((message) => ({ ...message, read: true }));
    return writeLocalData(data);
  }
  const db = await getDatabase();
  await db.collection('messages').updateMany({ read: false }, { $set: { read: true } });
}

async function deleteMessage(id) {
  if (!mongoUrl) {
    const data = await readLocalData();
    data.messages = data.messages.filter((message) => message.id !== id);
    return writeLocalData(data);
  }
  const objectId = toObjectId(id);
  if (!objectId) return;
  const db = await getDatabase();
  await db.collection('messages').deleteOne({ _id: objectId });
}

const DEFAULT_SITE_SETTINGS = {
  heroEyebrow: '● نخدم المنازل والشركات منذ 2008',
  heroTitle: 'تبريد يظل هادئًا طوال الصيف.',
  heroDescription: 'نبيع ونثبت ونصلح أنظمة مكيفات الهواء من كاريير وميديا، بأسعار واضحة وفنيين يلتزمون بالمواعيد وضمان تركيب لمدة عامين على كل تركيب.',
  heroPrimaryLabel: 'تصفح المنتجات', heroSecondaryLabel: 'طلب زيارة موقع',
  gauge1Label: 'وقت الاستجابة', gauge1Value: 'في اليوم نفسه في أغلب المناطق',
  gauge2Label: 'العلامات التجارية', gauge2Value: 'Carrier & Midea',
  gauge3Label: 'ضمان التركيب', gauge3Value: 'سنتين',
  gauge4Label: 'العروض المجانية', gauge4Value: 'دائمًا',
  trust1Title: 'تركيب مضمون', trust1Text: 'ضمان لمدة عامين',
  trust2Title: 'استجابة سريعة', trust2Text: 'خدمة في نفس اليوم',
  trust3Title: 'خبرة حقيقية', trust3Text: 'أكثر من 15 عامًا',
  trust4Title: 'ماركات موثوقة', trust4Text: 'كاريير وميديا',
  brandsTitle: 'العلامات التجارية التي نبيعها ونصلحها',
  servicesEyebrow: 'ماذا نقدم', servicesTitle: 'فريق واحد من البداية إلى النهاية',
  service1Title: 'تركيب مكيفات جديدة', service1Text: 'مكيفات سبليت أو دكت أو نوافذ يتم اختيارها وفقًا للمساحة بدقة دون مبالغة في العرض.',
  service2Title: 'الصيانة والإصلاح', service2Text: 'تشخيص، شحن غاز، استبدال قطع، وخدمة موسمية للحفاظ على كفاءة الأجهزة.',
  service3Title: 'عقود سنوية', service3Text: 'فحوصات مجدولة للتأكد من اكتشاف المشاكل الصغيرة قبل أن تتحول إلى نفقات كبيرة.',
  service4Title: 'مشاريع تجارية', service4Text: 'تقدير وحساب مناسب للمكاتب والعيادات والمحال والمباني الصغيرة متعددة الوحدات.',
  catalogEyebrow: 'الكتالوج', catalogTitle: 'الأكثر طلبًا الآن', catalogButton: 'عرض جميع المنتجات',
  ctaTitle: 'لست متأكدًا من الوحدة المناسبة لك؟',
  ctaText: 'أرسل لنا مساحة الغرفة وصورة للمكان، وسنقترح لك السعة المناسبة ونمنحك السعر في نفس اليوم.',
  ctaButton: 'تحدث مع فني',
  heroEyebrowEn: '● Serving homes and businesses since 2008',
  heroTitleEn: 'Quiet comfort, all summer long.',
  heroDescriptionEn: 'We supply, install, and service Carrier and Midea air-conditioning systems with clear pricing, punctual technicians, and a two-year installation warranty.',
  heroPrimaryLabelEn: 'Browse products', heroSecondaryLabelEn: 'Request a site visit',
  gauge1LabelEn: 'Response time', gauge1ValueEn: 'Same day in most areas',
  gauge2LabelEn: 'Brands', gauge2ValueEn: 'Carrier & Midea',
  gauge3LabelEn: 'Installation warranty', gauge3ValueEn: 'Two years',
  gauge4LabelEn: 'Free quotations', gauge4ValueEn: 'Always',
  trust1TitleEn: 'Guaranteed installation', trust1TextEn: 'Two-year warranty',
  trust2TitleEn: 'Fast response', trust2TextEn: 'Same-day service',
  trust3TitleEn: 'Proven experience', trust3TextEn: 'More than 15 years',
  trust4TitleEn: 'Trusted brands', trust4TextEn: 'Carrier and Midea',
  brandsTitleEn: 'Brands we supply and service',
  servicesEyebrowEn: 'What we do', servicesTitleEn: 'One team from start to finish',
  service1TitleEn: 'New AC installation', service1TextEn: 'Split, ducted, and window systems sized accurately for your space without overselling.',
  service2TitleEn: 'Maintenance and repair', service2TextEn: 'Diagnostics, refrigerant charging, parts replacement, and seasonal servicing.',
  service3TitleEn: 'Annual contracts', service3TextEn: 'Scheduled inspections that catch small problems before they become major expenses.',
  service4TitleEn: 'Commercial projects', service4TextEn: 'Accurate estimates for offices, clinics, shops, and small multi-unit buildings.',
  catalogEyebrowEn: 'Catalog', catalogTitleEn: 'Most requested right now', catalogButtonEn: 'View all products',
  ctaTitleEn: 'Not sure which unit is right for you?',
  ctaTextEn: 'Send us the room size and a photo of the space. We will recommend the right capacity and provide a same-day quote.',
  ctaButtonEn: 'Speak with a technician',
  whatsappNumber: '201000000000',
  instagramHandle: '',
  facebookHandle: '',
};

async function getSiteSettings() {
  if (!mongoUrl) {
    const data = await readLocalData();
    return { ...DEFAULT_SITE_SETTINGS, ...(data.siteSettings || {}) };
  }
  const db = await getDatabase();
  const saved = await db.collection('site_settings').findOne({ key: 'homepage' });
  return { ...DEFAULT_SITE_SETTINGS, ...(saved || {}), _id: undefined, key: undefined };
}

async function updateSiteSettings(settings) {
  const allowed = Object.keys(DEFAULT_SITE_SETTINGS);
  const values = {};
  allowed.forEach((key) => { if (typeof settings[key] === 'string') values[key] = settings[key].trim().slice(0, 1000); });
  if (!mongoUrl) {
    const data = await readLocalData();
    data.siteSettings = { ...(data.siteSettings || {}), ...values, updatedAt: new Date().toISOString() };
    return writeLocalData(data);
  }
  const db = await getDatabase();
  await db.collection('site_settings').updateOne(
    { key: 'homepage' },
    { $set: { ...values, updatedAt: new Date() } },
    { upsert: true }
  );
}

module.exports = { getProduct, listProducts, listCategories, listCategoryRecords, createCategory, updateCategory, deleteCategory, getCategoryImage, createMessage, listAdminProducts, countUnreadMessages, createProduct, updateProduct, deleteProduct, listMessages, markMessagesRead, deleteMessage, getSiteSettings, updateSiteSettings };
