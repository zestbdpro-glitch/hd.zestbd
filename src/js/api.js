import { SITE_CONFIG, getPublicProductFallback } from './config.js';

const ENV = import.meta.env || {};
const API_BASE = (ENV.VITE_API_BASE_URL || './api').replace(/\/$/, '');
const DEMO_MODE = ENV.VITE_DEMO_MODE === 'true';
const SERVICE_ERROR = 'এই মুহূর্তে সেবা পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।';
const VERIFICATION_ERROR = 'যাচাই সম্পন্ন হয়নি। আবার যাচাই করে অর্ডার দিন।';
const SERVER_ERROR_MESSAGES = new Map([
  ['Product is unavailable.', 'এই মুহূর্তে পণ্যটি পাওয়া যাচ্ছে না।'],
  ['Product is currently unavailable.', 'এই মুহূর্তে পণ্যটি অর্ডার করা যাচ্ছে না।'],
  ['Invalid product slug.', 'এই মুহূর্তে পণ্যটি অর্ডার করা যাচ্ছে না।'],
  ['There is not enough stock for this quantity.', 'এই পরিমাণ পণ্য স্টকে নেই। পরিমাণ কমিয়ে আবার চেষ্টা করুন।'],
  ['This delivery area is unavailable.', 'এই এলাকায় বর্তমানে ডেলিভারি দেওয়া হচ্ছে না। অন্য এলাকা নির্বাচন করুন।'],
  ['Too many attempts. Please try again later.', 'অল্প সময়ে অনেকবার চেষ্টা করেছেন। কিছুক্ষণ পরে আবার চেষ্টা করুন।'],
  ['Verification failed. Please retry the verification.', VERIFICATION_ERROR],
  ['Verification hostname does not match.', VERIFICATION_ERROR],
  ['Verification token must be text.', VERIFICATION_ERROR],
  ['Verification token must contain 1 to 2048 characters.', VERIFICATION_ERROR],
  ['Order verification is not configured yet.', SERVICE_ERROR],
  ['The store database is not configured yet.', SERVICE_ERROR],
  ['The store configuration is invalid.', SERVICE_ERROR],
  ['The store database is temporarily unavailable.', SERVICE_ERROR],
  ['The request could not be completed. Please try again.', SERVICE_ERROR],
  ['Enter a valid Bangladesh mobile number.', 'বাংলাদেশের একটি সঠিক মোবাইল নম্বর লিখুন।'],
  ['Phone number must be text.', 'বাংলাদেশের একটি সঠিক মোবাইল নম্বর লিখুন।'],
  ['Phone number must contain 1 to 30 characters.', 'বাংলাদেশের একটি সঠিক মোবাইল নম্বর লিখুন।'],
  ['Full name must be text.', 'আপনার পুরো নাম লিখুন।'],
  ['Full name must contain 2 to 120 characters.', 'আপনার পুরো নাম ২ থেকে ১২০ অক্ষরের মধ্যে লিখুন।'],
  ['Delivery address must be text.', 'ডেলিভারির সম্পূর্ণ ঠিকানা লিখুন।'],
  ['Delivery address must contain 10 to 800 characters.', 'ডেলিভারির সম্পূর্ণ ঠিকানা ১০ থেকে ৮০০ অক্ষরের মধ্যে লিখুন।'],
  ['Quantity must be between 1 and 10.', 'পরিমাণ ১ থেকে ১০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।'],
  ['Order note must be text.', 'অর্ডারের অতিরিক্ত তথ্য সঠিকভাবে লিখুন।'],
  ['Order note must contain 0 to 500 characters.', 'অর্ডারের অতিরিক্ত তথ্য ৫০০ অক্ষরের মধ্যে লিখুন।'],
  ['Submission blocked.', 'অর্ডার পাঠানো যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।'],
  ['Invalid request identifier.', 'অর্ডার পাঠানো যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।'],
  ['This request identifier was already used for a different order.', 'অর্ডার পাঠানো যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।']
]);

export async function fetchProductData() {
  if (DEMO_MODE && isLocalhost()) {
    return getPublicProductFallback();
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/product.php`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
  } catch {
    throw new Error('পণ্যের তথ্য লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।');
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'এই মুহূর্তে পণ্যের তথ্য পাওয়া যাচ্ছে না।'));
  }

  try {
    return await response.json();
  } catch {
    throw new Error('পণ্যের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।');
  }
}

export async function createOrder(payload) {
  if (DEMO_MODE && isLocalhost()) {
    await wait(520);
    return {
      orderReference: `DEV-${Date.now().toString(36).toUpperCase()}`,
      status: 'pending',
      productName: payload.productName || SITE_CONFIG.product.name,
      quantity: payload.quantity,
      unitPrice: payload.unitPrice,
      deliveryFee: payload.deliveryFee,
      totalAmount: payload.totalAmount,
      demoMode: true
    };
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/order.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('অর্ডারের উত্তর পাওয়া যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।');
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'অর্ডার পাঠানো যায়নি। আবার চেষ্টা করুন।'));
  }

  try {
    return await response.json();
  } catch {
    throw new Error('অর্ডারের উত্তর পড়া যায়নি। আবার চেষ্টা করুন।');
  }
}

export function trackEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('decorcraft:analytics', { detail: { name, ...detail } }));

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: name, ...detail });
  }
}

async function getErrorMessage(response, fallback) {
  try {
    const data = await response.json();
    const message = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : '';
    return SERVER_ERROR_MESSAGES.get(message.trim()) || fallback;
  } catch {
    return fallback;
  }
}

function isLocalhost() {
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
