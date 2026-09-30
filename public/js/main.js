// public/js/main.js
// Small shared behaviors used on every public page.

let siteSettingsCache = null;

const uiTranslations = {
  'الرئيسية': 'Home', 'المنتجات': 'Products', 'من نحن': 'About us', 'تواصل معنا': 'Contact us',
  'احصل على عرض سعر': 'Get a quote', 'العودة إلى المنتجات': 'Back to products',
  'مكيفات الهواء وقطع الغيار': 'Air conditioners and spare parts',
  'يتم تحديث الأسعار مباشرة من فريقنا، لذلك ما تراه هنا هو السعر الذي ستدفعه. يتم تحديد التوصيل والتركيب بشكل منفصل بحسب موقعك.': 'Prices are updated directly by our team. Delivery and installation are quoted separately based on your location.',
  'الكل': 'All', 'جاري تحميل المنتجات…': 'Loading products…', 'لا توجد منتجات': 'No products found',
  'جرّب بحثًا أو تصنيفًا مختلفًا.': 'Try a different search or category.', 'تعذر تحميل المنتجات': 'Unable to load products',
  'يرجى تحديث الصفحة.': 'Please refresh the page.', 'من نحن': 'About us',
  'فريق صغير يجيب على الهاتف': 'A small team that answers the phone',
  'تواصل مباشرة': 'Contact us directly', 'الهاتف': 'Phone', 'واتساب': 'WhatsApp',
  'البريد الإلكتروني': 'Email', 'منطقة الخدمة': 'Service area', 'ساعات العمل': 'Working hours',
  'أرسل رسالة': 'Send a message', 'الاسم': 'Name', 'الرسالة': 'Message', 'إرسال الرسالة': 'Send message',
  'دعنا نتحدث عن مساحتك': 'Let’s talk about your space',
  'الموقع': 'Website', 'التواصل': 'Contact',
  'جميع الحقوق محفوظة.': 'All rights reserved.', 'متوفر': 'In stock', 'غير متوفر': 'Out of stock',
  'طلب هذه الوحدة': 'Request this unit', 'العلامة': 'Brand', 'التصنيف': 'Category', 'التوفر': 'Availability'
};

function currentLanguage() { return localStorage.getItem('siteLanguage') === 'en' ? 'en' : 'ar'; }

function socialUrl(platform, value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  const handle = clean.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  if (platform === 'instagram') return `https://instagram.com/${handle}`;
  if (platform === 'facebook') return `https://facebook.com/${handle}`;
  return '';
}

function applySocialSettings(settings) {
  const whatsapp = String(settings.whatsappNumber || '').replace(/\D/g, '');
  if (whatsapp) {
    document.querySelectorAll('a[href*="wa.me/"]').forEach((link) => { link.href = `https://wa.me/${whatsapp}`; });
  }
  const footerContact = [...document.querySelectorAll('.footer-grid > div')].pop();
  if (!footerContact) return;
  let socialLinks = footerContact.querySelector('.social-links');
  if (!socialLinks) {
    socialLinks = document.createElement('div');
    socialLinks.className = 'social-links';
    footerContact.appendChild(socialLinks);
  }
  const language = currentLanguage();
  const links = [
    { name: 'Instagram', url: socialUrl('instagram', settings.instagramHandle), icon: 'IG' },
    { name: 'Facebook', url: socialUrl('facebook', settings.facebookHandle), icon: 'f' },
    { name: language === 'en' ? 'WhatsApp' : 'واتساب', url: whatsapp ? `https://wa.me/${whatsapp}` : '', icon: '◉' }
  ].filter((item) => item.url);
  socialLinks.replaceChildren(...links.map((item) => {
    const anchor = document.createElement('a');
    anchor.href = item.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.setAttribute('aria-label', item.name);
    const icon = document.createElement('span');
    icon.textContent = item.icon;
    anchor.append(icon, document.createTextNode(item.name));
    return anchor;
  }));
}

function translateStaticContent(language) {
  document.querySelectorAll('body *:not(script):not(style)').forEach((element) => {
    if (element.children.length) return;
    if (!element.dataset.arText) element.dataset.arText = element.textContent.trim();
    const arabic = element.dataset.arText;
    if (language === 'en' && uiTranslations[arabic]) element.textContent = uiTranslations[arabic];
    else if (language === 'ar' && arabic) element.textContent = arabic;
  });
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((element) => {
    if (!element.dataset.arPlaceholder) element.dataset.arPlaceholder = element.placeholder;
    const placeholders = { 'بحث عن المنتجات…':'Search products…', 'أخبرنا عن المساحة أو المشكلة…':'Tell us about the space or problem…', 'اختياري إذا توفر بريد إلكتروني':'Optional if email is provided', 'اختياري إذا توفر هاتف':'Optional if phone is provided' };
    element.placeholder = language === 'en' ? (placeholders[element.dataset.arPlaceholder] || element.dataset.arPlaceholder) : element.dataset.arPlaceholder;
  });
}

function applySiteLanguage(language) {
  localStorage.setItem('siteLanguage', language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
  document.body.classList.toggle('is-ltr', language === 'en');
  translateStaticContent(language);
  document.querySelectorAll('[data-setting]').forEach((element) => {
    const baseKey = element.dataset.setting;
    const value = siteSettingsCache && siteSettingsCache[language === 'en' ? `${baseKey}En` : baseKey];
    if (typeof value === 'string' && value) element.textContent = value;
  });
  const toggle = document.getElementById('languageToggle');
  if (toggle) {
    toggle.textContent = language === 'ar' ? 'EN' : 'العربية';
    toggle.setAttribute('aria-label', language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
  }
  if (siteSettingsCache) applySocialSettings(siteSettingsCache);
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.innerHTML = isOpen ? '&times;' : '&#9776;';
    });
    links.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '&#9776;';
    }));
  }

  const navCta = document.querySelector('.nav-cta');
  if (navCta) {
    const languageButton = document.createElement('button');
    languageButton.type = 'button';
    languageButton.id = 'languageToggle';
    languageButton.className = 'language-toggle';
    languageButton.addEventListener('click', () => applySiteLanguage(currentLanguage() === 'ar' ? 'en' : 'ar'));
    navCta.prepend(languageButton);
  }

  const editableContent = document.querySelectorAll('[data-setting]');
  if (editableContent.length) {
    fetch('/api/site-settings')
      .then((response) => {
        if (!response.ok) throw new Error('Settings unavailable');
        return response.json();
      })
      .then((settings) => { siteSettingsCache = settings; applySiteLanguage(currentLanguage()); applySocialSettings(settings); })
      .catch(() => { /* Keep the built-in content when the API is unavailable. */ });
  }
  applySiteLanguage(currentLanguage());
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatPrice(value) {
  const num = Number(value);
  return num.toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }) + ' ج.م';
}
