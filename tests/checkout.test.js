import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBDT } from '../src/js/config.js';
import { createOrder, fetchProductData } from '../src/js/api.js';
import {
  calculateOrderTotals,
  normalizeBangladeshPhone,
  validateBangladeshPhone,
  validateOrderInput
} from '../src/js/checkout.js';

test('normalizes Bangladesh mobile numbers', () => {
  assert.equal(normalizeBangladeshPhone('+880 1712-345678'), '01712345678');
  assert.equal(normalizeBangladeshPhone('01712 345 678'), '01712345678');
});

test('normalizes Bengali and mixed-script phone digits', () => {
  assert.equal(normalizeBangladeshPhone('০১৭১২ ৩৪৫ ৬৭৮'), '01712345678');
  assert.equal(normalizeBangladeshPhone('+৮৮০ ১৭১২-৩৪৫৬৭৮'), '01712345678');
  assert.equal(normalizeBangladeshPhone('+880 ১৭১২-345678'), '01712345678');
  assert.equal(normalizeBangladeshPhone(null), '');
});

test('validates Bangladesh mobile numbers', () => {
  assert.equal(validateBangladeshPhone('01712345678'), true);
  assert.equal(validateBangladeshPhone('+8801812345678'), true);
  assert.equal(validateBangladeshPhone('০১৮১২৩৪৫৬৭৮'), true);
  assert.equal(validateBangladeshPhone('01212345678'), false);
  assert.equal(validateBangladeshPhone('০১২১২৩৪৫৬৭৮'), false);
  assert.equal(validateBangladeshPhone('0171234'), false);
});

test('calculates totals with Bengali quantities without changing numeric payloads', () => {
  assert.deepEqual(
    calculateOrderTotals({ unitPrice: 1299.5, quantity: '২', deliveryFee: 80 }),
    { quantity: 2, unitPrice: 1299.5, subtotal: 2599, deliveryFee: 80, totalAmount: 2679 }
  );
  assert.equal(calculateOrderTotals({ unitPrice: 1000, quantity: '৯৯', deliveryFee: 100 }).quantity, 10);
});

test('calculates order totals from authoritative values', () => {
  assert.deepEqual(
    calculateOrderTotals({
      unitPrice: 3490,
      quantity: '2',
      deliveryFee: 80
    }),
    {
      quantity: 2,
      unitPrice: 3490,
      subtotal: 6980,
      deliveryFee: 80,
      totalAmount: 7060
    }
  );
});

test('bounds quantity and validates required order fields', () => {
  assert.equal(calculateOrderTotals({ unitPrice: 1000, quantity: '99', deliveryFee: 100 }).quantity, 10);

  const errors = validateOrderInput({
    customerName: 'A',
    customerPhone: '0123',
    deliveryAddress: 'short',
    deliveryZoneId: '',
    quantity: '0'
  });

  assert.deepEqual(Object.keys(errors).sort(), [
    'customerName',
    'customerPhone',
    'deliveryAddress',
    'deliveryZoneId',
    'quantity'
  ]);
  assert.ok(validateOrderInput({ quantity: '1.5' }).quantity);
});

test('accepts Bengali customer details and quantities and rejects invalid quantities', () => {
  const input = {
    customerName: 'পরীক্ষার ক্রেতা',
    customerPhone: '+৮৮০ ১৭১২-৩৪৫৬৭৮',
    deliveryAddress: 'বাড়ি ১২, রোড ৪, ধানমন্ডি, ঢাকা',
    deliveryZoneId: 'inside_dhaka',
    quantity: '২'
  };
  assert.deepEqual(validateOrderInput(input), {});
  for (const quantity of ['০', '১১', '১.৫', 'দুই', '১e১', '0x2', '']) {
    assert.equal(validateOrderInput({ ...input, quantity }).quantity, 'পরিমাণ ১ থেকে ১০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।');
  }
});

test('required-field validation messages are Bengali', () => {
  assert.deepEqual(validateOrderInput({}), {
    customerName: 'আপনার পুরো নাম লিখুন।',
    customerPhone: 'বাংলাদেশের একটি সঠিক মোবাইল নম্বর লিখুন।',
    deliveryAddress: 'ডেলিভারির সম্পূর্ণ ঠিকানা লিখুন।',
    deliveryZoneId: 'ডেলিভারি এলাকা নির্বাচন করুন।',
    quantity: 'পরিমাণ ১ থেকে ১০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।'
  });
});

test('currency formatting preserves fractional product prices', () => {
  assert.match(formatBDT(1299.5), /১,২৯৯\.৫০/);
  assert.match(formatBDT(3490), /৩,৪৯০/);
});

test('API HTTP fallback errors are Bengali', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    json: async () => { throw new SyntaxError('Invalid JSON'); }
  }));
  await assert.rejects(fetchProductData(), /এই মুহূর্তে পণ্যের তথ্য পাওয়া যাচ্ছে না।/);
  await assert.rejects(createOrder({}), /অর্ডার পাঠানো যায়নি। আবার চেষ্টা করুন।/);
});

test('API network errors are Bengali', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(fetchProductData(), /পণ্যের তথ্য লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।/);
  await assert.rejects(createOrder({}), /অর্ডারের উত্তর পাওয়া যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।/);
});

test('API invalid success responses have Bengali errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => { throw new SyntaxError('Invalid JSON'); }
  }));
  await assert.rejects(fetchProductData(), /পণ্যের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।/);
  await assert.rejects(createOrder({}), /অর্ডারের উত্তর পড়া যায়নি। আবার চেষ্টা করুন।/);
});

test('API translates common order server errors into Bengali', async (t) => {
  const messages = [
    ['There is not enough stock for this quantity.', 'এই পরিমাণ পণ্য স্টকে নেই। পরিমাণ কমিয়ে আবার চেষ্টা করুন।'],
    ['This delivery area is unavailable.', 'এই এলাকায় বর্তমানে ডেলিভারি দেওয়া হচ্ছে না। অন্য এলাকা নির্বাচন করুন।'],
    ['Product is currently unavailable.', 'এই মুহূর্তে পণ্যটি অর্ডার করা যাচ্ছে না।'],
    ['Too many attempts. Please try again later.', 'অল্প সময়ে অনেকবার চেষ্টা করেছেন। কিছুক্ষণ পরে আবার চেষ্টা করুন।'],
    ['Verification failed. Please retry the verification.', 'যাচাই সম্পন্ন হয়নি। আবার যাচাই করে অর্ডার দিন।'],
    ['Verification hostname does not match.', 'যাচাই সম্পন্ন হয়নি। আবার যাচাই করে অর্ডার দিন।'],
    ['Verification token must contain 1 to 2048 characters.', 'যাচাই সম্পন্ন হয়নি। আবার যাচাই করে অর্ডার দিন।'],
    ['Order verification is not configured yet.', 'এই মুহূর্তে সেবা পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।'],
    ['The store database is temporarily unavailable.', 'এই মুহূর্তে সেবা পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।'],
    ['Quantity must be between 1 and 10.', 'পরিমাণ ১ থেকে ১০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।']
  ];
  let message = '';
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, json: async () => ({ error: message }) }));
  for (const [english, bengali] of messages) {
    message = english;
    await assert.rejects(createOrder({}), { message: bengali });
  }
});

test('API translates recognized message fields and hides unknown server errors', async (t) => {
  let data = { message: ' Product is unavailable. ' };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, json: async () => data }));
  await assert.rejects(fetchProductData(), { message: 'এই মুহূর্তে পণ্যটি পাওয়া যাচ্ছে না।' });
  for (const response of [{ error: 'Unexpected SQL error: private database details' }, { error: { privateDetails: 'secret' } }, null]) {
    data = response;
    await assert.rejects(createOrder({}), { message: 'অর্ডার পাঠানো যায়নি। আবার চেষ্টা করুন।' });
  }
});
