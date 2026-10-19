import '../styles/admin-base.css';
import { createIcons, LogIn, ShoppingBag, Package, Images, FileText, Truck, UserRound, LogOut, ExternalLink, Search, RefreshCw, Download, ChevronLeft, ChevronRight, X, Save, Plus, Trash2, Upload, Eye } from 'lucide';

const icons = { LogIn, ShoppingBag, Package, Images, FileText, Truck, UserRound, LogOut, ExternalLink, Search, RefreshCw, Download, ChevronLeft, ChevronRight, X, Save, Plus, Trash2, Upload, Eye };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { csrf: '', setup: false, product: null, site: null, mediaDraft: [], lifestyleDraft: null, deliveryZones: [], orders: [], page: 1, pages: 1, selectedOrder: null, dirty: new Set() };
const apiBase = new URL('../api/', location.href);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (value) => new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 }).format(Number(value || 0));
const date = (value) => new Date(`${value.replace(' ', 'T')}Z`).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' });
const mediaUrl = (path) => new URL(path, new URL('../', location.href)).href;
const refreshIcons = () => createIcons({ icons });
const saveButton = (label) => `<div class="form-actions"><button class="button primary" type="submit"><i data-lucide="save"></i><span>${label}</span></button><button class="icon-button" type="button" data-reload-editor title="Reload editor" aria-label="Reload editor"><i data-lucide="refresh-cw"></i></button><span class="message" data-save-state></span></div>`;
const removeButton = (label) => `<button class="icon-button danger" type="button" data-remove title="Remove ${label}" aria-label="Remove ${label}"><i data-lucide="trash-2"></i></button>`;

function showMessage(text, error = false, target = $('[data-message]')) {
  target.textContent = text;
  target.classList.toggle('error', error);
}

async function request(resource, { body, file } = {}) {
  const headers = { Accept: 'application/json' };
  const options = { credentials: 'same-origin', cache: 'no-store', headers };
  if (body || file) {
    options.method = 'POST';
    headers['X-CSRF-Token'] = state.csrf;
    if (file) options.body = file;
    else { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  }
  const response = await fetch(new URL(resource, apiBase), options);
  let data;
  try { data = await response.json(); } catch { throw new Error('The PHP service is unavailable.'); }
  if (!response.ok) {
    if (response.status === 401 && !$('[data-app]').hidden) { await loadSession(); }
    throw new Error(data.error || 'The request failed.');
  }
  if (data.csrfToken) state.csrf = data.csrfToken;
  return data;
}

async function busy(button, task, target = $('[data-message]')) {
  button.disabled = true;
  try { await task(); } catch (error) { showMessage(error.message, true, target); }
  finally { button.disabled = false; }
}

async function loadSession() {
  const session = await request('admin.php?resource=session');
  state.setup = session.setupRequired;
  $('[data-auth]').hidden = session.authenticated;
  $('[data-app]').hidden = !session.authenticated;
  $('[data-auth-title]').textContent = state.setup ? 'Create Administrator' : 'Sign In';
  $('[data-login-button] span').textContent = state.setup ? 'Create Administrator' : 'Sign In';
  $('[data-setup-field]').hidden = !state.setup;
  const form = $('[data-login-form]');
  form.elements.setupToken.required = state.setup;
  form.elements.password.minLength = state.setup ? 12 : 1;
  form.elements.password.autocomplete = state.setup ? 'new-password' : 'current-password';
  showMessage('', false, $('[data-auth-message]'));
  if (session.authenticated) await openWorkspace(session.email);
}

async function openWorkspace(email) {
  $('[data-auth]').hidden = true;
  $('[data-app]').hidden = false;
  $('[data-admin-email]').textContent = email;
  const store = await request('admin.php?resource=store');
  state.product = store.product;
  state.site = store.site;
  state.deliveryZones = store.deliveryZones;
  $('[data-admin-brand]').textContent = store.site.brandName || 'zestbd';
  resetMediaDraft();
  renderProduct(); renderMedia(); renderWebsite(); renderDelivery();
  bindDirtyForms(); refreshIcons();
  await loadOrders();
}

function field(label, name, value = '', { type = 'text', full = false, required = false, textarea = false, attrs = '' } = {}) {
  return `<label${full ? ' class="full"' : ''}>${label}${textarea ? `<textarea name="${name}" ${required ? 'required' : ''} ${attrs}>${escape(value)}</textarea>` : `<input type="${type}" name="${name}" value="${escape(value)}" ${required ? 'required' : ''} ${attrs} />`}</label>`;
}

function specRow(key = '', value = '') {
  return `<div class="spec-row"><input aria-label="Specification label" data-spec-key value="${escape(key)}" required maxlength="100" /><input aria-label="Specification value" data-spec-value value="${escape(value)}" required maxlength="1000" />${removeButton('specification')}</div>`;
}

function faqRow(question = '', answer = '') {
  return `<div class="faq-row"><label>Question<input data-faq-question value="${escape(question)}" required maxlength="300" /></label>${removeButton('FAQ')}<label class="answer">Answer<textarea data-faq-answer required maxlength="3000">${escape(answer)}</textarea></label></div>`;
}

function contentImageEditor(slot, image = '', alt = '') {
  return `<div class="site-image-editor full" data-content-image-editor>
    <div class="site-image-preview" data-content-image-preview>${image ? `<img src="${escape(mediaUrl(image))}" alt="${escape(alt)}" />` : '<i data-lucide="images" aria-hidden="true"></i>'}</div>
    <div class="site-image-fields"><div class="site-image-actions"><button class="button" type="button" data-content-upload><i data-lucide="upload"></i><span>Upload Image</span></button><button class="icon-button danger" type="button" data-clear-image title="Remove image" aria-label="Remove image"><i data-lucide="trash-2"></i></button></div>
      <input type="file" accept="image/jpeg,image/png,image/webp" data-content-file="${slot}" />
      <label>Image URL or path<input data-content-image value="${escape(image)}" maxlength="1000" /></label>
      <label>Image description<input data-content-image-alt value="${escape(alt)}" maxlength="300" /></label>
      <p class="message" data-content-upload-message></p>
    </div>
  </div>`;
}

function reviewRow(review = {}, index = 0) {
  const active = review.active ?? Boolean(review.name && review.text);
  const rating = review.rating ?? 5;
  return `<fieldset class="site-content-item" data-review-row><legend>Buyer Review ${index + 1}</legend>
    <div class="section-toolbar"><label class="check-label"><input type="checkbox" data-review-active ${active ? 'checked' : ''} />Publish review</label><button class="icon-button danger" type="button" data-clear-content="review" title="Clear review" aria-label="Clear review ${index + 1}"><i data-lucide="trash-2"></i></button></div>
    <div class="field-grid"><label>Customer name<input data-review-name value="${escape(review.name)}" maxlength="120" /></label>
    <label>Star rating<select data-review-rating>${[5, 4, 3, 2, 1].map((value) => `<option value="${value}" ${Number(rating) === value ? 'selected' : ''}>${value} star${value > 1 ? 's' : ''}</option>`).join('')}</select></label>
    <label class="full">Customer review<textarea data-review-text maxlength="2000">${escape(review.text)}</textarea></label>
    ${contentImageEditor(`review-${index}`, review.image, review.imageAlt)}</div></fieldset>`;
}

function featuredRow(item = {}, index = 0) {
  return `<fieldset class="site-content-item" data-featured-row><legend>Featured Product ${index + 1}</legend>
    <div class="section-toolbar"><label class="check-label"><input type="checkbox" data-featured-active ${item.active ? 'checked' : ''} />Publish product</label><button class="icon-button danger" type="button" data-clear-content="featured" title="Clear product" aria-label="Clear product ${index + 1}"><i data-lucide="trash-2"></i></button></div>
    <div class="field-grid"><label>Featured product name<input data-featured-name value="${escape(item.name)}" maxlength="200" /></label>
    <label>Price (BDT, optional)<input type="number" data-featured-price value="${escape(item.price)}" min="0" max="9999999.99" step="0.01" /></label>
    <label class="full">Main-store product URL<input type="url" data-featured-url value="${escape(item.url)}" maxlength="1000" /></label>
    ${contentImageEditor(`featured-${index}`, item.image, item.imageAlt)}</div></fieldset>`;
}

function paintContentImage(editor) {
  const preview = $('[data-content-image-preview]', editor);
  const path = $('[data-content-image]', editor).value.trim();
  preview.replaceChildren();
  if (path) {
    const image = document.createElement('img'); image.src = mediaUrl(path); image.alt = $('[data-content-image-alt]', editor).value; preview.append(image);
  } else { preview.innerHTML = '<i data-lucide="images" aria-hidden="true"></i>'; refreshIcons(); }
}

function renderProduct() {
  const p = state.product;
  $('[data-product-form]').dataset.version = String(p.version);
  $('[data-product-form]').innerHTML = `
    <fieldset><legend>Product Information</legend><div class="field-grid">
      ${field('Product name', 'name', p.name, { required: true, attrs: 'maxlength="200"' })}
      ${field('Slug', 'slug', p.slug, { required: true, attrs: 'pattern="[a-z0-9-]{3,100}" maxlength="100"' })}
      ${field('Headline', 'headline', p.headline, { required: true, full: true, attrs: 'maxlength="240"' })}
      ${field('Description', 'description', p.description, { required: true, textarea: true, full: true, attrs: 'maxlength="3000"' })}
      ${field('Selling price (BDT)', 'price', p.price, { type: 'number', required: true, attrs: 'min="0" max="9999999.99" step="0.01"' })}
      ${field('Previous price (optional)', 'compareAtPrice', p.compareAtPrice, { type: 'number', attrs: 'min="0" max="9999999.99" step="0.01"' })}
      ${field('Stock quantity (blank = unlimited)', 'stockQuantity', p.stockQuantity, { type: 'number', attrs: 'min="0" max="1000000" step="1"' })}
      <label class="check-label"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} />Available for orders</label>
      ${field('Delivery note', 'deliveryNote', p.deliveryNote, { full: true, attrs: 'maxlength="500"' })}
    </div></fieldset>
    <fieldset><legend>Specifications</legend><div class="dynamic-list" data-specs>${Object.entries(p.specifications || {}).map(([key, value]) => specRow(key, value)).join('')}</div><div class="section-toolbar"><button class="button" type="button" data-add="spec"><i data-lucide="plus"></i><span>Add Specification</span></button></div></fieldset>
    <fieldset><legend>FAQ</legend><div class="dynamic-list" data-faqs>${p.faq.map((item) => faqRow(item.question, item.answer)).join('')}</div><div class="section-toolbar"><button class="button" type="button" data-add="faq"><i data-lucide="plus"></i><span>Add FAQ</span></button></div></fieldset>
    <fieldset><legend>Offer</legend><div class="field-grid">${field('Offer title (optional)', 'offerTitle', p.offer?.title, { full: true, attrs: 'maxlength="240"' })}${field('Offer text', 'offerCopy', p.offer?.copy, { full: true, textarea: true, attrs: 'maxlength="2000"' })}</div></fieldset>${saveButton('Save Product')}`;
}

function resetMediaDraft() {
  state.mediaDraft = state.product.media.map((item) => ({ ...item }));
  state.lifestyleDraft = { src: state.site.lifestyleImage, alt: state.site.lifestyleImageAlt };
}

function collectMediaEdits() {
  const form = $('[data-media-form]');
  const video = state.mediaDraft.find((item) => item.type === 'video');
  $$('[data-media-slot]', form).forEach((article) => {
    const slot = article.dataset.mediaSlot;
    if (slot === 'lifestyle') state.lifestyleDraft.alt = $('[data-media-alt]', article).value;
    else if (slot === 'poster' && video) video.alt = $('[data-media-alt]', article).value;
    else if (slot !== 'video' && slot !== 'poster') state.mediaDraft[Number(slot)].alt = $('[data-media-alt]', article).value;
  });
  if (video && form.elements.videoSrc) video.src = form.elements.videoSrc.value.trim();
}

function mediaItem(slot, title, item) {
  const src = slot === 'lifestyle' ? state.lifestyleDraft.src : slot === 'poster' ? item.poster : item.src;
  const alt = slot === 'lifestyle' ? state.lifestyleDraft.alt : item.alt;
  return `<article class="media-item" data-media-slot="${slot}"><h3>${escape(title)}</h3><img class="media-image" src="${escape(mediaUrl(src))}" alt="${escape(alt)}" /><button class="button" type="button" data-upload="${slot}"><i data-lucide="upload"></i><span>Upload Image</span></button><input type="file" accept="image/jpeg,image/png,image/webp" data-file="${slot}" /><label>Image description<input data-media-alt value="${escape(alt)}" maxlength="300" required /></label><p class="message" data-upload-message></p></article>`;
}

function renderMedia() {
  const media = state.mediaDraft;
  const video = media.find((item) => item.type === 'video');
  $('[data-media-form]').innerHTML = `<div class="section-toolbar"><h2>Product Images</h2></div><div class="media-grid">${media.map((item, index) => item.type === 'image' ? mediaItem(String(index), item.label || `Image ${index + 1}`, item) : '').join('')}</div>
    <div class="section-toolbar"><h2>Product Video</h2>${video ? '<button class="icon-button danger" type="button" data-remove-video title="Remove video" aria-label="Remove video"><i data-lucide="trash-2"></i></button>' : `<button class="button" type="button" data-add-video ${media.length >= 8 ? 'disabled' : ''}><i data-lucide="plus"></i><span>Add Video</span></button>`}</div>
    ${video ? `<div class="media-grid"><article class="media-item" data-media-slot="video"><h3>Product Video</h3><video class="media-image" controls preload="none" poster="${escape(mediaUrl(video.poster))}" ${video.src ? `src="${escape(mediaUrl(video.src))}"` : ''}></video><button class="button" type="button" data-upload="video"><i data-lucide="upload"></i><span>Upload Video</span></button><input type="file" accept="video/mp4" data-file="video" /><label>Video URL or path<input name="videoSrc" value="${escape(video.src)}" required maxlength="1000" /></label><p class="message" data-upload-message></p></article>${mediaItem('poster', 'Video Poster', video)}</div>` : ''}
    <div class="section-toolbar"><h2>Lifestyle Image</h2></div><div class="media-grid">${mediaItem('lifestyle', 'Lifestyle Image')}</div>${saveButton('Save Media')}`;
}

const contentGroups = [
  ['Brand & Contact', [['brandName', 'Brand name'], ['brandInitials', 'Brand initials'], ['tagline', 'Tagline'], ['supportPhone', 'Support phone'], ['supportEmail', 'Support email'], ['mainSiteUrl', 'Main-store home URL']]],
  ['Hero & Product Benefits', [['heroEyebrow', 'Hero label'], ['qualityTitle', 'Product detail label'], ['qualityNote', 'Product detail note'], ['whyEyebrow', 'Benefits label'], ['whyTitle', 'Benefits heading']]],
  ['Lifestyle', [['lifestyleEyebrow', 'Lifestyle label'], ['lifestyleTitle', 'Lifestyle heading'], ['lifestyleText', 'Lifestyle text', true]]],
  ['Details, Checkout & Footer', [['detailsTitle', 'Details heading'], ['detailsText', 'Details text', true], ['orderTitle', 'Checkout heading'], ['orderText', 'Checkout text', true], ['faqTitle', 'FAQ heading'], ['footerDescription', 'Footer text', true]]],
  ['Customer Reviews', [['reviewsTitle', 'Reviews heading'], ['reviewsText', 'Reviews introductory text', true]]],
  ['Featured Products', [['featuredTitle', 'Section heading'], ['featuredText', 'Section introductory text', true]]]
];

function renderWebsite() {
  const s = state.site;
  $('[data-website-form]').innerHTML = contentGroups.map(([heading, fields], groupIndex) => {
    const inputs = fields.map(([key, label, textarea]) => field(label, key, s[key], {
      textarea, full: !!textarea, required: groupIndex === 0,
      type: key === 'supportEmail' ? 'email' : key === 'mainSiteUrl' ? 'url' : 'text',
      attrs: `maxlength="${key === 'brandInitials' ? 4 : key === 'mainSiteUrl' ? 1000 : groupIndex === 0 ? 150 : 3000}"`
    })).join('');
    let extra = '';
    if (groupIndex === 1) extra = `<div class="section-toolbar"><h3>Product Benefits</h3></div><div class="field-grid">${s.features.map((feature, i) => field(`Benefit ${i + 1} title`, `featureTitle${i}`, feature.title, { required: true, attrs: 'maxlength="100"' }) + field(`Benefit ${i + 1} text`, `featureText${i}`, feature.text, { required: true, textarea: true, attrs: 'maxlength="1000"' })).join('')}</div>`;
    if (groupIndex === 4) extra = `<div class="dynamic-list" data-review-list>${Array.from({ length: 3 }, (_, index) => reviewRow(s.reviews?.[index], index)).join('')}</div>`;
    if (groupIndex === 5) extra = `<div class="dynamic-list" data-featured-list>${Array.from({ length: 3 }, (_, index) => featuredRow(s.featuredProducts?.[index], index)).join('')}</div>`;
    return `<details class="content-group" ${groupIndex === 0 ? 'open' : ''}><summary>${heading}</summary><div class="field-grid">${inputs}</div>${extra}</details>`;
  }).join('') + `<details class="content-group"><summary>Policies</summary><div class="field-grid">${['delivery', 'privacy', 'returns', 'terms'].map((key) => field(`${key[0].toUpperCase() + key.slice(1)} policy`, `policy_${key}`, s.policies?.[key], { textarea: true, full: true, attrs: 'maxlength="10000" rows="6"' })).join('')}</div></details>${saveButton('Save Website Content')}`;
}

function renderDelivery() {
  $('[data-delivery-form]').innerHTML = state.deliveryZones.map((zone, index) => `<fieldset data-zone="${zone.id}"><legend>${escape(zone.zoneCode.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))}</legend><div class="field-grid">${field('Area name', `zoneName${index}`, zone.zoneName, { required: true, attrs: 'maxlength="100"' })}${field('Delivery charge (BDT)', `deliveryFee${index}`, zone.deliveryFee, { type: 'number', required: true, attrs: 'min="0" max="9999999.99" step="0.01"' })}<label class="check-label"><input type="checkbox" name="zoneActive${index}" ${zone.active ? 'checked' : ''} />Available for delivery</label></div></fieldset>`).join('') + saveButton('Save Delivery Charges');
}

function markDirty(panel) {
  state.dirty.add(panel);
  const message = $(`[data-panel="${panel}"] [data-save-state]`);
  if (message) message.textContent = 'Unsaved changes';
}

function saved(panel, message) {
  state.dirty.delete(panel);
  const status = $(`[data-panel="${panel}"] [data-save-state]`);
  if (status) status.textContent = 'Saved';
  showMessage(message);
}

function bindDirtyForms() {
  for (const panel of ['product', 'media', 'website', 'delivery']) {
    const form = $(`[data-panel="${panel}"] form`);
    if (form.dataset.bound) continue;
    form.dataset.bound = 'true';
    form.addEventListener('input', () => markDirty(panel));
    form.addEventListener('change', () => markDirty(panel));
  }
}

async function loadOrders() {
  const filters = new FormData($('[data-search-form]'));
  const params = new URLSearchParams({ resource: 'orders', page: String(state.page), search: filters.get('search'), status: filters.get('status') });
  const result = await request(`admin.php?${params}`);
  state.orders = result.orders; state.page = result.page; state.pages = result.pages;
  for (const [key, value] of Object.entries(result.stats)) $(`[data-stat="${key}"]`).textContent = key === 'orderValue' ? money(value) : value;
  $('[data-orders]').innerHTML = result.orders.length ? result.orders.map((order) => `<tr><td>${escape(order.order_reference)}</td><td>${escape(order.customer_name)}<small>${escape(order.customer_phone)}</small></td><td class="product-cell">${escape(order.product_name)}<small>Qty ${order.quantity}</small></td><td>${escape(money(order.total_amount))}</td><td><span class="badge ${order.order_status}">${order.order_status}</span></td><td>${escape(date(order.created_at))}</td><td><button class="icon-button" type="button" data-view-order="${order.id}" title="View ${escape(order.order_reference)}" aria-label="View ${escape(order.order_reference)}"><i data-lucide="eye"></i></button></td></tr>`).join('') : '<tr><td colspan="7" class="empty-cell">No orders found.</td></tr>';
  $('[data-order-count]').textContent = `${result.total} order${result.total === 1 ? '' : 's'}`;
  $('[data-page-count]').textContent = `${state.page} / ${state.pages}`;
  $('[data-prev]').disabled = state.page <= 1;
  $('[data-next]').disabled = state.page >= state.pages;
  refreshIcons();
}

function showOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;
  state.selectedOrder = id;
  $('[data-detail-heading]').textContent = order.order_reference;
  const entries = [['Customer', order.customer_name], ['Phone', order.customer_phone], ['Address', order.delivery_address], ['Product', order.product_name], ['Quantity', order.quantity], ['Unit price', money(order.unit_price)], ['Delivery area', order.delivery_zone_name], ['Delivery charge', money(order.delivery_fee)], ['Total', money(order.total_amount)], ['Date', date(order.created_at)], ['Note', order.customer_note || 'No note']];
  $('[data-order-detail]').innerHTML = `<dl>${entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
  const transitions = { pending: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
  const statuses = [order.order_status, ...transitions[order.order_status]];
  $('[data-status-form] select').innerHTML = statuses.map((status) => `<option value="${status}">${status[0].toUpperCase() + status.slice(1)}</option>`).join('');
  $('[data-status-form] button').disabled = statuses.length === 1;
  showMessage('', false, $('[data-dialog-message]'));
  $('[data-order-dialog]').showModal();
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-reload-editor]')) location.reload();
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    $$('[data-tab]').forEach((button) => { button.classList.toggle('active', button === tab); button.setAttribute('aria-current', button === tab ? 'page' : 'false'); });
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
    $('[data-page-title]').textContent = tab.textContent.trim();
    showMessage('');
  }
  const remove = event.target.closest('[data-remove]');
  if (remove) { markDirty(remove.closest('[data-panel]').dataset.panel); remove.parentElement.remove(); }
  const add = event.target.closest('[data-add]');
  if (add) {
    const type = add.dataset.add;
    const list = $(type === 'spec' ? '[data-specs]' : '[data-faqs]');
    const max = 30;
    if (list.children.length >= max) { showMessage(`Use up to ${max} entries.`, true); return; }
    list.insertAdjacentHTML('beforeend', type === 'spec' ? specRow() : faqRow());
    markDirty(add.closest('[data-panel]').dataset.panel); refreshIcons(); list.lastElementChild.querySelector('input').focus();
  }
  const upload = event.target.closest('[data-upload]');
  if (upload) $(`[data-file="${upload.dataset.upload}"]`).click();
  const contentUpload = event.target.closest('[data-content-upload]');
  if (contentUpload) $('[data-content-file]', contentUpload.closest('[data-content-image-editor]')).click();
  const clearImage = event.target.closest('[data-clear-image]');
  if (clearImage) {
    const editor = clearImage.closest('[data-content-image-editor]');
    $('[data-content-image]', editor).value = ''; paintContentImage(editor); markDirty('website');
  }
  const clearContent = event.target.closest('[data-clear-content]');
  if (clearContent) {
    const row = clearContent.closest('fieldset');
    $$('input, textarea', row).forEach((input) => { if (input.type === 'checkbox') input.checked = false; else input.value = ''; });
    const rating = $('[data-review-rating]', row); if (rating) rating.value = '5';
    paintContentImage($('[data-content-image-editor]', row)); markDirty('website');
  }
  if (event.target.closest('[data-add-video]')) {
    if (state.mediaDraft.length >= 8 || state.mediaDraft.some((item) => item.type === 'video')) return;
    collectMediaEdits();
    const image = state.mediaDraft[0];
    let id = 'demo';
    for (let suffix = 2; state.mediaDraft.some((item) => item.id === id); suffix++) id = `demo-${suffix}`;
    state.mediaDraft.push({ id, type: 'video', label: 'Product video', src: '', poster: image.src, posterFallback: image.fallback || image.src, thumb: image.thumb, alt: state.product.name, width: image.width, height: image.height });
    renderMedia(); markDirty('media'); refreshIcons();
    $('[data-media-form] input[name=videoSrc]').focus();
  }
  if (event.target.closest('[data-remove-video]')) {
    collectMediaEdits();
    state.mediaDraft = state.mediaDraft.filter((item) => item.type !== 'video');
    renderMedia(); markDirty('media'); refreshIcons();
  }
  const view = event.target.closest('[data-view-order]');
  if (view) showOrder(view.dataset.viewOrder);
});

$('[data-login-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  busy($('[data-login-button]'), async () => {
    const result = await request('admin.php', { body: { action: state.setup ? 'setup' : 'login', ...values } });
    event.target.reset();
    await openWorkspace(result.email);
  }, $('[data-auth-message]'));
});

$('[data-logout]').addEventListener('click', () => busy($('[data-logout]'), async () => {
  if (state.dirty.size && !confirm('Discard unsaved changes and sign out?')) return;
  await request('admin.php', { body: { action: 'logout' } });
  state.dirty.clear();
  await loadSession();
}));

$('[data-product-form]').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy($('button[type=submit]', form), async () => {
    const values = Object.fromEntries(new FormData(form));
    const specifications = {};
    for (const row of $$('[data-specs] > div', form)) {
      const label = $('[data-spec-key]', row).value.trim();
      if (Object.hasOwn(specifications, label)) throw new Error(`Duplicate specification label: ${label}`);
      specifications[label] = $('[data-spec-value]', row).value.trim();
    }
    const product = { ...state.product, ...values, version: Number(form.dataset.version), active: form.elements.active.checked, specifications, faq: $$('[data-faqs] > div', form).map((row) => ({ question: $('[data-faq-question]', row).value, answer: $('[data-faq-answer]', row).value })), offer: values.offerTitle.trim() || values.offerCopy.trim() ? { title: values.offerTitle, copy: values.offerCopy } : null };
    const result = await request('admin.php', { body: { action: 'save-product', product } });
    state.product = result.product; form.dataset.version = String(result.product.version); saved('product', 'Product saved.');
  });
});

$('[data-media-form]').addEventListener('change', async (event) => {
  const input = event.target.closest('[data-file]');
  if (!input?.files[0]) return;
  const slot = input.dataset.file;
  const item = slot === 'lifestyle' ? state.lifestyleDraft : ['video', 'poster'].includes(slot) ? state.mediaDraft.find((media) => media.type === 'video') : state.mediaDraft[Number(slot)];
  const article = input.closest('[data-media-slot]');
  const button = $('[data-upload]', article);
  await busy(button, async () => {
    showMessage('Uploading...', false, $('[data-upload-message]', article));
    const data = new FormData(); data.append('file', input.files[0]); data.append('kind', slot === 'video' ? 'video' : 'image');
    const result = await request('upload.php', { file: data });
    if (slot === 'lifestyle') item.src = result.path;
    else if (slot === 'poster') {
      Object.assign(item, { poster: result.path, posterFallback: result.path, thumb: result.path });
      $('[data-media-slot="video"] video')?.setAttribute('poster', mediaUrl(result.path));
    }
    else if (slot === 'video') { Object.assign(item, { src: result.path, width: result.width, height: result.height }); $('input[name=videoSrc]', article).value = result.path; }
    else Object.assign(item, { src: result.path, fallback: result.path, thumb: result.path, width: result.width, height: result.height });
    $('.media-image', article).src = mediaUrl(result.path);
    markDirty('media'); showMessage('Uploaded', false, $('[data-upload-message]', article));
  }, $('[data-upload-message]', article));
  input.value = '';
});

$('[data-media-form]').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy($('button[type=submit]', form), async () => {
    collectMediaEdits();
    const result = await request('admin.php', { body: { action: 'save-media', media: state.mediaDraft, lifestyleImage: state.lifestyleDraft.src, lifestyleImageAlt: state.lifestyleDraft.alt } });
    state.product = result.product; state.site = result.site;
    if (!state.dirty.has('product')) renderProduct();
    resetMediaDraft(); renderMedia(); refreshIcons(); saved('media', 'Media saved.');
  });
});

$('[data-website-form]').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy($('button[type=submit]', form), async () => {
    const values = Object.fromEntries(new FormData(form));
    const site = { ...state.site };
    contentGroups.flatMap(([, fields]) => fields).forEach(([key]) => { site[key] = values[key]; });
    site.features = Array.from({ length: 4 }, (_, i) => ({ title: values[`featureTitle${i}`], text: values[`featureText${i}`] }));
    site.reviews = $$('[data-review-row]', form).map((row) => ({
      name: $('[data-review-name]', row).value, text: $('[data-review-text]', row).value,
      rating: Number($('[data-review-rating]', row).value), active: $('[data-review-active]', row).checked,
      image: $('[data-content-image]', row).value, imageAlt: $('[data-content-image-alt]', row).value
    })).concat(state.site.reviews?.slice(3) || []);
    site.featuredProducts = $$('[data-featured-row]', form).map((row) => ({
      name: $('[data-featured-name]', row).value, price: $('[data-featured-price]', row).value,
      url: $('[data-featured-url]', row).value, active: $('[data-featured-active]', row).checked,
      image: $('[data-content-image]', row).value, imageAlt: $('[data-content-image-alt]', row).value
    }));
    site.policies = Object.fromEntries(['delivery', 'privacy', 'returns', 'terms'].map((key) => [key, values[`policy_${key}`]]));
    const result = await request('admin.php', { body: { action: 'save-site', site } });
    state.site = result.site; $('[data-admin-brand]').textContent = state.site.brandName || 'zestbd'; saved('website', 'Website content saved.');
  });
});

$('[data-website-form]').addEventListener('change', async (event) => {
  const input = event.target.closest('[data-content-file]');
  const editor = event.target.closest('[data-content-image-editor]');
  if (!editor) return;
  if (!input) { if (event.target.matches('[data-content-image], [data-content-image-alt]')) paintContentImage(editor); return; }
  if (!input.files[0]) return;
  await busy($('[data-content-upload]', editor), async () => {
    const message = $('[data-content-upload-message]', editor);
    showMessage('Uploading...', false, message);
    const data = new FormData(); data.append('file', input.files[0]); data.append('kind', 'image');
    const result = await request('upload.php', { file: data });
    $('[data-content-image]', editor).value = result.path;
    paintContentImage(editor); markDirty('website'); showMessage('Uploaded', false, message);
  }, $('[data-content-upload-message]', editor));
  input.value = '';
});

$('[data-delivery-form]').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy($('button[type=submit]', form), async () => {
    const deliveryZones = state.deliveryZones.map((zone, i) => ({ ...zone, zoneName: form.elements[`zoneName${i}`].value, deliveryFee: form.elements[`deliveryFee${i}`].value, active: form.elements[`zoneActive${i}`].checked }));
    const result = await request('admin.php', { body: { action: 'save-delivery', deliveryZones } });
    state.deliveryZones = result.deliveryZones; saved('delivery', 'Delivery charges saved.');
  });
});

$('[data-password-form]').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy($('button[type=submit]', form), async () => {
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) throw new Error('New passwords do not match.');
    await request('admin.php', { body: { action: 'change-password', ...values } });
    form.reset(); showMessage('Password updated.');
  });
});

$('[data-status-form]').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  busy($('button[type=submit]', form), async () => {
    await request('admin.php', { body: { action: 'update-order', id: state.selectedOrder, status: form.elements.status.value } });
    $('[data-order-dialog]').close(); await loadOrders(); showMessage('Order status updated.');
  }, $('[data-dialog-message]'));
});
$('[data-close-dialog]').addEventListener('click', () => $('[data-order-dialog]').close());
$('[data-search-form]').addEventListener('submit', (event) => { event.preventDefault(); state.page = 1; busy($('button[type=submit]', event.currentTarget), loadOrders); });
$('[data-search-form] select').addEventListener('change', () => { state.page = 1; busy($('[data-refresh]'), loadOrders); });
$('[data-refresh]').addEventListener('click', () => busy($('[data-refresh]'), loadOrders));
$('[data-prev]').addEventListener('click', async () => { state.page--; try { await loadOrders(); } catch (error) { showMessage(error.message, true); } });
$('[data-next]').addEventListener('click', async () => { state.page++; try { await loadOrders(); } catch (error) { showMessage(error.message, true); } });
$('[data-export]').addEventListener('click', () => busy($('[data-export]'), async () => {
  const response = await fetch(new URL('export.php', apiBase), { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Export failed. Please sign in and try again.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = 'decor-orders.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
window.addEventListener('beforeunload', (event) => { if (state.dirty.size) { event.preventDefault(); event.returnValue = ''; } });
refreshIcons();
loadSession().catch((error) => showMessage(error.message, true, $('[data-auth-message]')));
