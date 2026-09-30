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
        ${product.size ? `<span class="product-size">${escapeHtml(currentLanguage() === 'en' ? (product.size_en || product.size) : product.size)}</span>` : ''}
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
    grid.innerHTML = `<p style="color: rgba(255,255,255,0.6);">تعذر تحميل المنتجات حاليًا. حاول مرة أخرى بعد قليل.</p>`;
  }
}

async function initProductsPage() {
  const grid = document.getElementById('productGrid');
  const filtersEl = document.getElementById('categoryFilters');
  const searchInput = document.getElementById('searchInput');
  if (!grid) return;

  let activeCategory = 'all';
  let activeBrand = '';
  let activeSize = '';
  let searchTimer = null;

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      const categories = await res.json();
      const showcase = document.getElementById('categoryShowcase');
      const productResults = document.getElementById('productResults');
      const levelHead = document.getElementById('categoryLevelHead');
      const levelTitle = document.getElementById('categoryLevelTitle');
      const backButton = document.getElementById('backToCategories');
      const categoryName = (cat) => typeof cat === 'string' ? cat : cat.name;
      const categoryLabel = (cat) => {
        if (typeof cat === 'string') return cat;
        return currentLanguage() === 'en' ? (cat.nameEn || cat.name) : cat.name;
      };
      const categoryImageStyle = (cat) => {
        const clamp = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
        const fit = cat.imageFit === 'contain' ? 'contain' : 'cover';
        return `--cat-fit:${fit};--cat-size:${clamp(cat.imageSize, 100, 25, 200)}%;--cat-mt:${clamp(cat.imageMarginTop, 0, -200, 200)}px;--cat-mr:${clamp(cat.imageMarginRight, 0, -200, 200)}px;--cat-mb:${clamp(cat.imageMarginBottom, 0, -200, 200)}px;--cat-ml:${clamp(cat.imageMarginLeft, 0, -200, 200)}px`;
      };
      categories.forEach((cat) => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.dataset.category = categoryName(cat);
        btn.textContent = categoryLabel(cat);
        filtersEl.appendChild(btn);
      });
      const roots = categories.filter((cat) => typeof cat === 'string' || !cat.parentId);
      const categoryStack = [];
      const renderCategoryTiles = (items, parent = null) => {
        productResults.hidden = true;
        if (parent) {
          levelHead.hidden = false;
          levelTitle.textContent = categoryLabel(parent);
        } else {
          levelHead.hidden = true;
        }
        if (!items.length) {
          showcase.innerHTML = '<div class="empty-state"><h3>لا توجد أقسام بعد</h3></div>';
          return;
        }
        showcase.innerHTML = items.map((cat, index) => `
          <button class="category-tile" data-id="${escapeHtml(String(cat.id || categoryName(cat))).replace(/&quot;|"/g, '&quot;')}">
            ${cat.image ? `<img class="category-tile-image" src="${escapeHtml(cat.image)}" style="${categoryImageStyle(cat)}" alt="" loading="lazy">` : ''}
            <span class="category-tile-shade"></span>
            <span class="category-number">${String(index + 1).padStart(2, '0')}</span>
            <strong>${escapeHtml(categoryLabel(cat))}</strong>
            <span class="category-arrow">←</span>
          </button>`).join('');
      };
      renderCategoryTiles(roots);
      showcase.addEventListener('click', (event) => {
        const tile = event.target.closest('.category-tile');
        if (!tile) return;
        const selected = categories.find((cat) => String(cat.id || categoryName(cat)) === tile.dataset.id);
        if (!selected) return;
        const children = categories.filter((cat) => cat.parentId === selected.id);
        if (children.length) {
          categoryStack.push(selected);
          renderCategoryTiles(children, selected);
          showcase.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const parent = categories.find((cat) => cat.id === selected.parentId);
        const company = parent && categories.find((cat) => cat.id === parent.parentId);
        if (company && parent) {
          activeCategory = categoryName(parent);
          activeSize = categoryName(selected);
          activeBrand = categoryName(company);
        } else {
          activeCategory = categoryName(selected);
          activeSize = '';
          let root = selected;
          let guard = 0;
          while (root.parentId && guard++ < 10) {
            const next = categories.find((cat) => cat.id === root.parentId);
            if (!next) break;
            root = next;
          }
          activeBrand = categoryName(root);
        }
        productResults.hidden = false;
        filtersEl.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.category === activeCategory));
        render();
        productResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      backButton.addEventListener('click', () => {
        categoryStack.pop();
        if (!categoryStack.length) return renderCategoryTiles(roots);
        const parent = categoryStack[categoryStack.length - 1];
        renderCategoryTiles(categories.filter((cat) => cat.parentId === parent.id), parent);
      });
      filtersEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        filtersEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        activeSize = '';
        const selectedCategory = categories.find((cat) => categoryName(cat) === activeCategory);
        if (selectedCategory) {
          let company = selectedCategory;
          while (company.parentId) company = categories.find((cat) => cat.id === company.parentId) || company;
          activeBrand = categoryName(company);
        } else {
          activeBrand = '';
        }
        render();
      });
    } catch (err) { /* categories are a nice-to-have, fail quietly */ }
  }

  async function render() {
    grid.innerHTML = `<p>جاري تحميل المنتجات…</p>`;
    const params = new URLSearchParams();
    if (activeCategory !== 'all') params.set('category', activeCategory);
    if (activeBrand) params.set('brand', activeBrand);
    if (activeSize) params.set('size', activeSize);
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
            <li><span>الحجم</span><span>${escapeHtml(currentLanguage() === 'en' ? (p.size_en || p.size) : p.size) || '—'}</span></li>
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
