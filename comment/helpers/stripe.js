import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Low-level Stripe API wrappers
 */

async function createCustomer(customer) {
  return await stripe.customers.create(customer);
}

async function retrieveCustomer(customerId) {
  return await stripe.customers.retrieve(customerId);
}

async function createSetupIntent(customerId) {
  return await stripe.setupIntents.create({ customer: customerId });
}

async function attachPaymentMethod(paymentMethodId, customerId) {
  return await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
}

async function listPaymentMethods(customerId, type = 'card') {
  const { data } = await stripe.paymentMethods.list({
    customer: customerId,
    type
  });
  return data;
}

async function detachPaymentMethod(paymentMethodId) {
  return await stripe.paymentMethods.detach(paymentMethodId);
}

async function createPaymentIntent({
  customerId,
  amount,
  metadata = {},
  currency= 'eur'

}) {
  const paymentIntentParams = {
    amount: amount,
    currency: currency,
    customer: customerId,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never'
    },
    metadata
  };

  return await stripe.paymentIntents.create(paymentIntentParams);
}

async function retrievePaymentIntent(paymentIntentId) {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * High-level helper functions
 */

/**
 * Ensure a Stripe Customer exists for a user record.
 * Creates one if user.stripeCustomerId is missing.
 * @param {Object} user - Your user object, must support id, email, stripeCustomerId
 * @param {Function} updateUser - Callback to persist stripeCustomerId on your user
 * @returns {Promise<string>} stripeCustomerId
 */
async function ensureCustomer(user, updateUser) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await createCustomer(user.email, { internalId: user.id });
  await updateUser(user.id, { stripeCustomerId: customer.id });
  return customer.id;
}

/**
 * Prepare a user for off-session charges by collecting a payment method.
 * Returns a client_secret for the frontend to confirm SetupIntent.
 */
async function preparePaymentMethod(user, updateUser) {
  const customerId = await ensureCustomer(user, updateUser);
  const setupIntent = await createSetupIntent(customerId);
  return setupIntent.client_secret;
}

/**
 * Save a PaymentMethod to the customer and set it as default.
 */
async function saveDefaultPaymentMethod(user, paymentMethodId, updateUser) {
  const customerId = user.stripeCustomerId;
  await attachPaymentMethod(paymentMethodId, customerId);
  // Update user's defaultPaymentMethod in your DB
  await updateUser(user.id, { defaultPaymentMethod: paymentMethodId });
}

/**
 * Charge a user for a certificate fee off-session.
 * @param {Object} user - must have stripeCustomerId and defaultPaymentMethod
 * @param {number} amountCents - e.g., 1000 for €10
 * @param {Object} metadata - e.g., { certificateId }
 * @returns {Promise<Stripe.PaymentIntent>}
 */
async function chargeCertificateFee(user, amountCents, metadata = {}) {
  if (!user.defaultPaymentMethod) {
    throw new Error('No default payment method. Call preparePaymentMethod first.');
  }
  return await createPaymentIntent({
    customerId: user.stripeCustomerId,
    paymentMethodId: user.defaultPaymentMethod,
    amountCents,
    metadata
  });
}

/**
 * Main flow: issue certificate, charging if over free quota.
 * @param {Object} user - must support id, stripeCustomerId, defaultPaymentMethod, certificatesIssued
 * @param {Function} updateUser - callback to increment certificates count
 * @param {string} certificateId - your internal ID for tracking
 * @returns {Promise<Object>} { free: boolean, paymentIntent?: object }
 */
async function processCertificate(user, updateUser, certificateId) {
  const FREE_QUOTA = 25;
  if (user.certificatesIssued < FREE_QUOTA) {
    await updateUser(user.id, { certificatesIssued: user.certificatesIssued + 1 });
    return { free: true };
  } else {
    const intent = await chargeCertificateFee(user, 1000, { certificateId });
    if (intent.status === 'succeeded') {
      await updateUser(user.id, { certificatesIssued: user.certificatesIssued + 1 });
    }
    return { free: false, paymentIntent: intent };
  }
}

/**
 * Express webhook handler for Stripe events.
 */
function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const { certificateId } = event.data.object.metadata;
      // TODO: mark certificateId as issued in your DB
      break;
    }
    case 'payment_intent.payment_failed': {
      const customerId = event.data.object.customer;
      // TODO: notify customer to update payment method
      break;
    }
    default:
      console.warn(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
}

export  {
  // Low-level
  createCustomer,
  retrieveCustomer,
  createSetupIntent,
  attachPaymentMethod,
  listPaymentMethods,
  detachPaymentMethod,
  createPaymentIntent,
  retrievePaymentIntent,
  // High-level
  ensureCustomer,
  preparePaymentMethod,
  saveDefaultPaymentMethod,
  chargeCertificateFee,
  processCertificate,
  // Webhooks
  handleStripeWebhook
};
