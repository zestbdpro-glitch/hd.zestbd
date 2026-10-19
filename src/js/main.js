import { fetchProductData, trackEvent } from './api.js';
import { SITE_CONFIG, formatBDT } from './config.js';
import { initCheckout } from './checkout.js';
import { initGallery } from './gallery.js';
import { createElement as createIcon, Star, ArrowUpRight } from 'lucide';

let productData = {
  product: SITE_CONFIG.product,
  deliveryZones: SITE_CONFIG.deliveryZones
};

document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initOrderLinks();
  initStickyBar();
  initPolicies();
  setStaticContent(productData);
  trackEvent('page_view', { page: 'home_decor_landing' });

  try {
    productData = await fetchProductData(SITE_CONFIG.productSlug);
  } catch (error) {
    console.warn(error);
    productData.product = { ...productData.product, active: false };
  }

  setStaticContent(productData);
  initGallery(productData.product.media);
  initCheckout(productData.product, productData.deliveryZones);
  renderStructuredData(productData.product);
});

function setStaticContent({ product, deliveryZones, site }) {
  if (site) Object.assign(SITE_CONFIG, site);
  document.title = `${SITE_CONFIG.brandName} - ${product.headline || product.name}`;
  setText('[data-brand-name]', SITE_CONFIG.brandName);
  setText('[data-brand-name-footer]', SITE_CONFIG.brandName);
  setText('[data-brand-name-copy]', SITE_CONFIG.brandName);
  setText('[data-brand-initials]', SITE_CONFIG.brandInitials);
  setText('[data-brand-tagline]', SITE_CONFIG.tagline);
  const mainUrl = safeMainSiteUrl(SITE_CONFIG.mainSiteUrl);
  document.querySelectorAll('[data-main-site-link]').forEach((link) => { link.href = mainUrl; });
  document.querySelectorAll('[data-content]').forEach((element) => {
    element.textContent = SITE_CONFIG[element.dataset.content] || '';
  });
  document.querySelectorAll('[data-feature-title]').forEach((element, index) => { element.textContent = SITE_CONFIG.features[index]?.title || ''; });
  document.querySelectorAll('[data-feature-text]').forEach((element, index) => { element.textContent = SITE_CONFIG.features[index]?.text || ''; });
  const lifestyle = document.querySelector('[data-lifestyle-image]');
  if (lifestyle) { lifestyle.src = SITE_CONFIG.lifestyleImage; lifestyle.alt = SITE_CONFIG.lifestyleImageAlt; }
  renderReviews(SITE_CONFIG.reviews || []);
  renderFeaturedProducts(SITE_CONFIG.featuredProducts || [], mainUrl);
  setText('[data-product-heading]', product.headline || product.name);
  setText('[data-product-description]', product.description);
  setText('[data-product-price]', formatBDT(product.price));
  setText('[data-summary-product]', product.name);
  setText('[data-summary-unit]', formatBDT(product.price));
  setText('[data-sticky-price]', formatBDT(product.price + (deliveryZones[0]?.deliveryFee || 0)));
  setText('[data-delivery-note]', product.deliveryNote || 'এলাকাভেদে ডেলিভারি চার্জ প্রযোজ্য।');
  setText('[data-year]', String(new Date().getFullYear()));
  const contacts = [];
  if (SITE_CONFIG.supportPhone && !/X/i.test(SITE_CONFIG.supportPhone)) contacts.push(`ফোন: ${SITE_CONFIG.supportPhone}`);
  if (SITE_CONFIG.supportEmail && !/@example\.com$/i.test(SITE_CONFIG.supportEmail)) contacts.push(`ইমেইল: ${SITE_CONFIG.supportEmail}`);
  setText('[data-contact-info]', contacts.join(' | ') || 'যোগাযোগের তথ্য এখনও প্রকাশ করা হয়নি।');

  const compare = document.querySelector('[data-compare-price]');
  if (compare) {
    const hasRealDiscount = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price);
    compare.hidden = !hasRealDiscount;
    compare.textContent = hasRealDiscount ? formatBDT(product.compareAtPrice) : '';
  }

  renderSpecs(product.specifications || {});
  renderFaq(product.faq || []);
  renderOffer(product);
  updateMeta(product);
}

function renderSpecs(specifications) {
  const list = document.querySelector('[data-spec-list]');
  if (!list) return;

  const rows = Object.entries(specifications).filter(([, value]) => Boolean(String(value || '').trim()));
  list.replaceChildren(
    ...rows.map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    })
  );
}

function renderFaq(items) {
  const list = document.querySelector('[data-faq-list]');
  if (!list) return;

  list.replaceChildren(
    ...items.map((item, index) => {
      const wrapper = document.createElement('article');
      const button = document.createElement('button');
      const panel = document.createElement('div');
      const panelId = `faq-panel-${index + 1}`;

      wrapper.className = 'faq-item';
      if (index === 0) wrapper.classList.add('is-open');

      button.type = 'button';
      button.setAttribute('aria-expanded', index === 0 ? 'true' : 'false');
      button.setAttribute('aria-controls', panelId);
      button.innerHTML = `<span>${escapeHtml(item.question)}</span><span aria-hidden="true">+</span>`;
      button.addEventListener('click', () => {
        const open = wrapper.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(open));
      });

      panel.id = panelId;
      panel.className = 'faq-panel';
      panel.textContent = item.answer;
      wrapper.append(button, panel);
      return wrapper;
    })
  );
}

function renderOffer(product) {
  const title = document.querySelector('[data-offer-title]');
  const copy = document.querySelector('[data-offer-copy]');
  if (!title || !copy) return;

  if (product.offer?.title && product.offer?.copy) {
    title.textContent = product.offer.title;
    copy.textContent = product.offer.copy;
    return;
  }

  title.textContent = `${product.name} অর্ডার করুন`;
  copy.textContent = `${formatBDT(product.price)}। অর্ডারের হিসাবে ডেলিভারি চার্জ যোগ হবে।`;
}

function renderReviews(reviews) {
  const list = document.querySelector('[data-reviews]');
  if (!list) return;
  const published = Array.isArray(reviews) ? reviews.slice(0, 3).filter((review) => review && review.active !== false && review.name?.trim() && review.text?.trim()) : [];
  document.querySelector('#reviews').hidden = published.length === 0;
  const navigation = document.querySelector('[data-nav] a[href="#reviews"]');
  if (navigation) navigation.hidden = published.length === 0;
  if (published.length && ['No customer reviews yet.', 'এই পণ্যের জন্য এখনও কোনো ক্রেতার মতামত প্রকাশ করা হয়নি।'].includes(SITE_CONFIG.reviewsText)) setText('[data-content="reviewsText"]', '');
  list.replaceChildren(...published.map((review) => {
    const article = document.createElement('article');
    const text = document.createElement('p');
    const name = document.createElement('strong');
    const stars = document.createElement('div');
    const rating = Math.min(5, Math.max(1, Number.parseInt(review.rating, 10) || 5));
    article.className = 'review-card';
    stars.className = 'review-stars';
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', `${new Intl.NumberFormat('bn-BD').format(rating)} / ৫ স্টার`);
    for (let index = 0; index < 5; index++) stars.append(createIcon(Star, { width: 18, height: 18, fill: index < rating ? 'currentColor' : 'none', 'aria-hidden': 'true', focusable: 'false' }));
    text.textContent = review.text;
    text.className = 'review-text';
    name.textContent = review.name;
    article.append(stars, text, name);
    if (safeImagePath(review.image)) {
      const image = document.createElement('img');
      image.className = 'review-photo';
      image.src = review.image;
      image.alt = review.imageAlt || 'ক্রেতার দেওয়া পণ্যের ছবি';
      image.width = 400; image.height = 300; image.loading = 'lazy'; image.decoding = 'async';
      article.append(image);
    }
    return article;
  }));
}

function safeMainSiteUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  return 'https://zestbd.com/';
}

function safeImagePath(value) {
  if (typeof value !== 'string' || !value) return false;
  if (/^(?:\.\/)?(?:assets|uploads)\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

function renderFeaturedProducts(products, mainUrl) {
  const list = document.querySelector('[data-featured-products]');
  if (!list) return;
  const host = new URL(mainUrl).hostname.toLowerCase().replace(/^www\./, '');
  const published = (Array.isArray(products) ? products : []).filter((item) => {
    if (!item || item.active === false || !item.name?.trim() || !safeImagePath(item.image)) return false;
    try {
      const url = new URL(item.url);
      return url.protocol === 'https:' && !url.username && !url.password && url.hostname.toLowerCase().replace(/^www\./, '') === host;
    } catch { return false; }
  }).slice(0, 3);
  document.querySelector('#featured-products').hidden = published.length === 0;
  list.replaceChildren(...published.map((item) => {
    const link = document.createElement('a');
    const image = document.createElement('img');
    const body = document.createElement('div');
    const name = document.createElement('h3');
    const action = document.createElement('span');
    link.className = 'featured-product'; link.href = item.url;
    image.src = item.image; image.alt = item.imageAlt || item.name;
    image.width = 640; image.height = 480; image.loading = 'lazy'; image.decoding = 'async';
    body.className = 'featured-product-body'; name.textContent = item.name;
    action.className = 'featured-product-action'; action.append(document.createTextNode('পণ্য দেখুন'), createIcon(ArrowUpRight, { width: 18, height: 18, 'aria-hidden': 'true', focusable: 'false' }));
    body.append(name);
    if (item.price !== null && item.price !== undefined && item.price !== '' && Number.isFinite(Number(item.price))) {
      const price = document.createElement('strong'); price.textContent = formatBDT(item.price); body.append(price);
    }
    body.append(action); link.append(image, body); return link;
  }));
}

function initPolicies() {
  const dialog = document.querySelector('[data-policy-dialog]');
  if (!dialog) return;
  document.querySelectorAll('[data-policy]').forEach((button) => button.addEventListener('click', () => {
    dialog.querySelector('h2').textContent = button.textContent;
    dialog.querySelector('[data-policy-body]').textContent = SITE_CONFIG.policies?.[button.dataset.policy] || 'এই নীতিমালা এখনও প্রকাশ করা হয়নি। অর্ডারের আগে বিস্তারিত জানতে যোগাযোগ করুন।';
    dialog.showModal();
  }));
  dialog.querySelector('[data-close-policy]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}

function initNavigation() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const nextState = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(nextState));
    nav.classList.toggle('is-open', nextState);
    document.body.classList.toggle('nav-open', nextState);
  });

  nav.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
      document.body.classList.remove('nav-open');
    }
  });
}

function initOrderLinks() {
  document.querySelectorAll('[data-order-link]').forEach((link) => {
    link.addEventListener('click', () => {
      trackEvent('click_order_now', { location: link.closest('section')?.id || 'header' });
    });
  });
}

function initStickyBar() {
  const sticky = document.querySelector('[data-mobile-sticky]');
  const order = document.querySelector('#order');
  const footer = document.querySelector('.site-footer');
  if (!sticky || !order || !footer || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const shouldHide = entries.some((entry) => entry.isIntersecting);
      sticky.classList.toggle('is-hidden', shouldHide);
    },
    { threshold: 0.08 }
  );

  observer.observe(order);
  observer.observe(footer);
}

function updateMeta(product) {
  const canonical = document.querySelector('link[rel="canonical"]');
  const description = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');

  if (canonical) canonical.href = SITE_CONFIG.canonicalUrl;
  if (description) description.content = product.description;
  if (ogTitle) ogTitle.content = `${SITE_CONFIG.brandName} - ${product.name}`;
  if (ogDescription) ogDescription.content = product.description;
  const ogImage = document.querySelector('meta[property="og:image"]');
  const image = product.media.find((item) => item.type === 'image');
  if (ogImage && image) ogImage.content = new URL(image.fallback || image.src, SITE_CONFIG.canonicalUrl).href;
}

function renderStructuredData(product) {
  const existing = document.querySelector('#product-jsonld');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'product-jsonld';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.media.filter((item) => item.type === 'image').map((item) => new URL(item.fallback || item.src, location.href).href),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BDT',
      price: String(product.price),
      availability:
        product.active === false || product.stockQuantity === 0
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      url: SITE_CONFIG.canonicalUrl
    }
  });
  document.head.append(script);
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return entities[char];
  });
}
