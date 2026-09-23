// public/js/products.js
// Fetches products from /api and renders them. Used by index.html,
// products.html, and product.html.

function productCardHtml(product) {
  const img = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : `<span class="placeholder">لا توجد صورة بعد</span>`;

  return `
    <a class="product-card" href="/product?id=${product.id}">
      <div class="product-thumb">${img}</div>
      <div class="product-body">
        ${product.brand ? `<span class="product-brand">${escapeHtml(product.brand)}</span>` : ''}
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-desc">${escapeHtml(truncate(product.description, 90))}</p>
        <div class="product-foot">
          <span class="price">${formatPrice(product.price)}</span>
          <span class="stock-badge ${product.in_stock ? 'in' : 'out'}">${product.in_stock ? 'متوفر' : 'غير متوفر'}</span>
        </div>
      </div>
    </a>
  `;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len).trim() + '…' : str;
}

async function loadFeaturedProducts() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    if (!products.length) {
      grid.innerHTML = `<p style="color: rgba(255,255,255,0.6);">يتم إضافة المنتجات قريبًا — عاود الزيارة لاحقًا.</p>`;
      return;
    }
    grid.innerHTML = products.slice(0, 4).map(productCardHtml).join('');
  } catch (err) {
    grid.innerHTML = `<p style="color: rgba(255,255,255,0.6);">Couldn't load products right now.</p>`;
  }
}

async function initProductsPage() {
  const grid = document.getElementById('productGrid');
  const filtersEl = document.getElementById('categoryFilters');
  const searchInput = document.getElementById('searchInput');
  if (!grid) return;

  let activeCategory = 'all';
  let searchTimer = null;

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      const categories = await res.json();
      categories.forEach((cat) => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.dataset.category = cat;
        btn.textContent = cat;
        filtersEl.appendChild(btn);
      });
      filtersEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        filtersEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        render();
      });
    } catch (err) { /* categories are a nice-to-have, fail quietly */ }
  }

  async function render() {
    grid.innerHTML = `<p>Loading products…</p>`;
    const params = new URLSearchParams();
    if (activeCategory !== 'all') params.set('category', activeCategory);
    if (searchInput && searchInput.value.trim()) params.set('search', searchInput.value.trim());

    try {
      const res = await fetch('/api/products?' + params.toString());
      const products = await res.json();
      if (!products.length) {
        grid.innerHTML = `<div class="empty-state"><h3>لا توجد منتجات</h3><p>جرّب بحثًا أو تصنيفًا مختلفًا.</p></div>`;
        return;
      }
      grid.innerHTML = products.map(productCardHtml).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><h3>تعذر تحميل المنتجات</h3><p>يرجى تحديث الصفحة.</p></div>`;
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 300);
    });
  }

  await loadCategories();
  await render();
}

async function loadProductDetail() {
  const container = document.getElementById('productDetail');
  if (!container) return;
  const id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    container.innerHTML = `<div class="empty-state"><h3>لم يتم تحديد المنتج</h3><p><a href="/products">تصفح جميع المنتجات</a></p></div>`;
    return;
  }

  try {
    const res = await fetch(`/api/products/${id}`);
    if (!res.ok) throw new Error('not found');
    const p = await res.json();

    document.title = `${p.name} | First Air Cond`;

    const img = p.image
      ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`
      : `<span class="placeholder">لا توجد صورة بعد</span>`;

    container.innerHTML = `
      <div class="product-detail">
        <div class="gallery">${img}</div>
        <div>
          ${p.brand ? `<span class="product-brand">${escapeHtml(p.brand)}</span>` : ''}
          <h1 style="margin-top:6px;">${escapeHtml(p.name)}</h1>
          <div class="price">${formatPrice(p.price)}</div>
          <span class="stock-badge ${p.in_stock ? 'in' : 'out'}">${p.in_stock ? 'متوفر' : 'غير متوفر'}</span>
          <p style="margin-top:20px;">${escapeHtml(p.description) || 'لا يوجد وصف حتى الآن.'}</p>
          <ul class="spec-list">
            <li><span>العلامة</span><span>${escapeHtml(p.brand) || '—'}</span></li>
            <li><span>التصنيف</span><span>${escapeHtml(p.category)}</span></li>
            <li><span>التوفر</span><span>${p.in_stock ? 'متوفر' : 'غير متوفر'}</span></li>
          </ul>
          <div class="hero-actions">
            <a href="/contact" class="btn btn-primary">طلب هذه الوحدة</a>
            <a href="https://wa.me/201000000000" target="_blank" rel="noopener" class="btn btn-ghost">واتساب</a>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>لم يتم العثور على المنتج</h3><p><a href="/products">تصفح جميع المنتجات</a></p></div>`;
  }
}
