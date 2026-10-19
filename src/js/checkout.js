import { createOrder, trackEvent } from './api.js';
import { SITE_CONFIG, formatBDT, formatNumber } from './config.js';

let checkoutState = {
  product: SITE_CONFIG.product,
  deliveryZones: SITE_CONFIG.deliveryZones,
  turnstileToken: ''
};

export function normalizeBangladeshPhone(input) {
  const digits = normalizeBengaliDigits(input).replace(/\D/g, '');
  if (digits.startsWith('8801') && digits.length === 13) return `0${digits.slice(3)}`;
  if (digits.startsWith('01') && digits.length === 11) return digits;
  return digits;
}

export function validateBangladeshPhone(input) {
  return /^01[3-9]\d{8}$/.test(normalizeBangladeshPhone(input));
}

export function calculateOrderTotals({ unitPrice, quantity, deliveryFee }) {
  const safeQuantity = Math.min(10, Math.max(1, Number.parseInt(normalizeBengaliDigits(quantity), 10) || 1));
  const price = Number(unitPrice || 0);
  const fee = Number(deliveryFee || 0);
  const subtotal = price * safeQuantity;
  return {
    quantity: safeQuantity,
    unitPrice: price,
    subtotal,
    deliveryFee: fee,
    totalAmount: subtotal + fee
  };
}

export function validateOrderInput(input) {
  const errors = {};

  if (!input.customerName || input.customerName.trim().length < 2) {
    errors.customerName = 'আপনার পুরো নাম লিখুন।';
  }

  if (!validateBangladeshPhone(input.customerPhone)) {
    errors.customerPhone = 'বাংলাদেশের একটি সঠিক মোবাইল নম্বর লিখুন।';
  }

  if (!input.deliveryAddress || input.deliveryAddress.trim().length < 10) {
    errors.deliveryAddress = 'ডেলিভারির সম্পূর্ণ ঠিকানা লিখুন।';
  }

  if (!input.deliveryZoneId) {
    errors.deliveryZoneId = 'ডেলিভারি এলাকা নির্বাচন করুন।';
  }

  const quantityText = normalizeBengaliDigits(input.quantity).trim();
  const quantity = Number(quantityText);
  if (!/^\d+$/.test(quantityText) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    errors.quantity = 'পরিমাণ ১ থেকে ১০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।';
  }

  return errors;
}

function normalizeBengaliDigits(input) {
  return String(input ?? '').replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));
}

export function createClientRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function initCheckout(product, deliveryZones) {
  checkoutState = {
    ...checkoutState,
    product,
    deliveryZones: deliveryZones.filter((zone) => zone.active !== false)
  };

  const form = document.querySelector('[data-order-form]');
  if (!form) return;

  const available = product.active !== false && product.stockQuantity !== 0 && checkoutState.deliveryZones.length > 0;
  form.querySelector('[data-submit-order]').disabled = !available;
  if (!available) showStatus(form.querySelector('[data-form-status]'), 'এই মুহূর্তে অর্ডার নেওয়া হচ্ছে না।', true);

  renderDeliveryZones(form);
  updateSummary(form);
  initTurnstile();

  form.addEventListener('input', () => updateSummary(form));
  form.addEventListener('change', () => updateSummary(form));
  form.addEventListener('submit', (event) => handleSubmit(event, form));
}

export function updateSummary(form) {
  const selectedZone = getSelectedZone(form);
  const totals = calculateOrderTotals({
    unitPrice: checkoutState.product.price,
    quantity: form.elements.quantity?.value || 1,
    deliveryFee: selectedZone?.deliveryFee || 0
  });

  setText('[data-summary-product]', checkoutState.product.name);
  setText('[data-summary-unit]', formatBDT(totals.unitPrice));
  setText('[data-summary-quantity]', formatNumber(totals.quantity));
  setText('[data-summary-subtotal]', formatBDT(totals.subtotal));
  setText('[data-summary-delivery]', formatBDT(totals.deliveryFee));
  setText('[data-summary-total]', formatBDT(totals.totalAmount));
  setText('[data-sticky-price]', formatBDT(totals.totalAmount));

  return totals;
}

function renderDeliveryZones(form) {
  const select = form.querySelector('[data-zone-select]');
  if (!select) return;

  select.replaceChildren(
    ...checkoutState.deliveryZones.map((zone) => {
      const option = document.createElement('option');
      option.value = zone.id;
      option.textContent = `${zone.zoneName} - ${formatBDT(zone.deliveryFee)}`;
      return option;
    })
  );
}

async function handleSubmit(event, form) {
  event.preventDefault();
  clearErrors(form);

  const button = form.querySelector('[data-submit-order]');
  const status = form.querySelector('[data-form-status]');
  const selectedZone = getSelectedZone(form);
  const totals = updateSummary(form);
  const values = Object.fromEntries(new FormData(form).entries());
  const errors = validateOrderInput(values);

  if (values.companyWebsite) {
    showStatus(status, 'অর্ডার পাঠানো যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।', true);
    return;
  }

  if (Object.keys(errors).length) {
    showErrors(form, errors);
    showStatus(status, 'চিহ্নিত ঘরগুলোর তথ্য ঠিক করে আবার চেষ্টা করুন।', true);
    return;
  }

  const clientRequestId = getOrCreateRequestId(JSON.stringify([checkoutState.product.slug, values.customerName.trim(), normalizeBangladeshPhone(values.customerPhone), values.deliveryAddress.trim(), values.deliveryZoneId, totals.quantity, String(values.customerNote || '').trim()]));
  const payload = {
    productSlug: checkoutState.product.slug,
    productName: checkoutState.product.name,
    customerName: values.customerName.trim(),
    customerPhone: normalizeBangladeshPhone(values.customerPhone),
    deliveryAddress: values.deliveryAddress.trim(),
    deliveryZoneId: values.deliveryZoneId,
    quantity: totals.quantity,
    customerNote: String(values.customerNote || '').trim(),
    clientRequestId,
    honeypot: values.companyWebsite || '',
    turnstileToken: checkoutState.turnstileToken,
    unitPrice: totals.unitPrice,
    deliveryFee: totals.deliveryFee,
    totalAmount: totals.totalAmount
  };

  button.disabled = true;
  button.textContent = 'অর্ডার পাঠানো হচ্ছে...';
  showStatus(status, 'আপনার ক্যাশ অন ডেলিভারি অর্ডার পাঠানো হচ্ছে...', false);
  trackEvent('begin_checkout', { productSlug: payload.productSlug, quantity: payload.quantity });

  try {
    const result = await createOrder(payload);
    sessionStorage.removeItem('decorcraft-client-request-id');
    sessionStorage.removeItem('decorcraft-order-fingerprint');
    showStatus(
      status,
      `আপনার অর্ডার পাওয়া গেছে। অর্ডার নম্বর: ${result.orderReference}। সর্বমোট: ${formatBDT(result.totalAmount || totals.totalAmount)}${result.demoMode ? ' (শুধু স্থানীয় পরীক্ষার অর্ডার)' : ''}`,
      false
    );
    trackEvent('purchase_or_order_submitted', {
      orderReference: result.orderReference,
      totalAmount: result.totalAmount || totals.totalAmount
    });
    form.reset();
    if (checkoutState.product.stockQuantity !== null && checkoutState.product.stockQuantity !== undefined) {
      checkoutState.product.stockQuantity = Math.max(0, checkoutState.product.stockQuantity - totals.quantity);
    }
    renderDeliveryZones(form);
    updateSummary(form);
  } catch (error) {
    showStatus(status, error.message || 'অর্ডার পাঠানো যায়নি। আবার চেষ্টা করুন।', true);
  } finally {
    button.disabled = checkoutState.product.stockQuantity === 0;
    button.textContent = button.disabled ? 'স্টক শেষ' : 'অর্ডার নিশ্চিত করুন';
    resetTurnstile();
  }
}

function getSelectedZone(form) {
  const zoneId = form.elements.deliveryZoneId?.value;
  return checkoutState.deliveryZones.find((zone) => zone.id === zoneId) || checkoutState.deliveryZones[0];
}

function getOrCreateRequestId(fingerprint) {
  const key = 'decorcraft-client-request-id';
  const existing = sessionStorage.getItem(key);
  if (existing && sessionStorage.getItem('decorcraft-order-fingerprint') === fingerprint) return existing;
  const id = createClientRequestId();
  sessionStorage.setItem(key, id);
  sessionStorage.setItem('decorcraft-order-fingerprint', fingerprint);
  return id;
}

function clearErrors(form) {
  form.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute('aria-invalid'));
  form.querySelectorAll('[data-error-for]').forEach((error) => {
    error.textContent = '';
  });
}

function showErrors(form, errors) {
  Object.entries(errors).forEach(([name, message]) => {
    const field = form.elements[name];
    const error = form.querySelector(`[data-error-for="${name}"]`);
    if (field) field.setAttribute('aria-invalid', 'true');
    if (error) error.textContent = message;
  });
}

function showStatus(element, message, isError) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', Boolean(isError));
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function initTurnstile() {
  if (!SITE_CONFIG.turnstileSiteKey) return;

  const slot = document.querySelector('[data-turnstile-slot]');
  if (!slot) return;

  slot.hidden = false;
  window.onDecorcraftTurnstile = (token) => {
    checkoutState.turnstileToken = token;
  };
  window.onDecorcraftTurnstileExpired = () => { checkoutState.turnstileToken = ''; };

  const widget = document.createElement('div');
  widget.className = 'cf-turnstile';
  widget.dataset.sitekey = SITE_CONFIG.turnstileSiteKey;
  widget.dataset.callback = 'onDecorcraftTurnstile';
  widget.dataset.expiredCallback = 'onDecorcraftTurnstileExpired';
  widget.dataset.errorCallback = 'onDecorcraftTurnstileExpired';
  slot.replaceChildren(widget);

  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  script.async = true;
  script.defer = true;
  document.head.append(script);
}

function resetTurnstile() {
  checkoutState.turnstileToken = '';
  if (window.turnstile) window.turnstile.reset();
}
