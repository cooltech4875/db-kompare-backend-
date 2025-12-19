import {
  getItem,
  getTimestamp,
  sendResponse,
  updateItemInDynamoDB,
} from "../../helpers/helpers.js";
import { TABLE_NAME } from "../../helpers/constants.js";
import { createCustomer, createPaymentIntent } from "../../helpers/stripe.js";
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Lambda: Complete Certification Plan Purchase Flow
 * - Creates PaymentIntent
 * - Confirms Payment
 * - Updates user certificateCredits on success
 */
export const handler = async (event) => {
  try {
    const { userId, paymentMethodId, planId } = JSON.parse(event.body || "{}");

    if (!userId || !paymentMethodId || !planId) {
      return sendResponse(400, "Missing required fields", null);
    }

    // Fetch user and plan
    const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
    const user = userRes.Item;
    if (!user) {
      return sendResponse(404, "User not found", null);
    }

    const planRes = await getItem(TABLE_NAME.CERTIFICATION_PLANS, { id: planId });
    const plan = planRes.Item;
    if (!plan) {
      return sendResponse(404, "Plan not found", null);
    }

    // Handle free plans
    const planPrice = plan.price || 0;
    const certificationsUnlocked = plan.certificationsUnlocked || 0;

    if (planPrice === 0) {
      const currentCredits = typeof user.certificateCredits === "number" ? user.certificateCredits : 0;
      const newCredits = currentCredits + certificationsUnlocked;

      await updateItemInDynamoDB({
        table: TABLE_NAME.USERS,
        Key: { id: userId },
        UpdateExpression: "SET certificateCredits = :newCredits, updatedAt = :u",
        ExpressionAttributeValues: {
          ":newCredits": newCredits,
          ":u": getTimestamp(),
        },
      });

      const message = `Plan activated successfully! You had ${currentCredits} credits, ${certificationsUnlocked} credits added. Total credits: ${newCredits}`;

      return sendResponse(200, message, {
        certificateCredits: newCredits,
        previousCredits: currentCredits,
        creditsAdded: certificationsUnlocked,
        totalCredits: newCredits,
      });
    }

    // Ensure Stripe Customer exists
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await createCustomer({
        email: user.email,
        name: user.name,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;

      await updateItemInDynamoDB({
        table: TABLE_NAME.USERS,
        Key: { id: userId },
        UpdateExpression: "SET stripeCustomerId = :scid, updatedAt = :u",
        ExpressionAttributeValues: {
          ":scid": stripeCustomerId,
          ":u": getTimestamp(),
        },
      });
    }

    // Create and confirm PaymentIntent
    const amountInCents = Math.round(planPrice * 100);
    const paymentIntent = await createPaymentIntent({
      amount: amountInCents,
      currency: "eur",
      customerId: stripeCustomerId,
      paymentMethodId: paymentMethodId,
      metadata: {
        userId: userId,
        planId: planId,
        certificationsUnlocked: certificationsUnlocked.toString(),
      },
    });

    // Confirm payment
    const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
      payment_method: paymentMethodId,
    });

    // If payment succeeded, update user credits
    if (confirmedIntent.status === 'succeeded') {
      const currentCredits = typeof user.certificateCredits === "number" ? user.certificateCredits : 0;
      const newCredits = currentCredits + certificationsUnlocked;

      await updateItemInDynamoDB({
        table: TABLE_NAME.USERS,
        Key: { id: userId },
        UpdateExpression: "SET certificateCredits = :newCredits, updatedAt = :u",
        ExpressionAttributeValues: {
          ":newCredits": newCredits,
          ":u": getTimestamp(),
        },
      });

      const message = `Payment completed successfully! You had ${currentCredits} credits, ${certificationsUnlocked} credits added. Total credits: ${newCredits}`;

      return sendResponse(200, message, {
        certificateCredits: newCredits,
        previousCredits: currentCredits,
        creditsAdded: certificationsUnlocked,
        totalCredits: newCredits,
      });
    }

    // If 3D Secure required, return client secret
    return sendResponse(200, "Payment requires authentication", {
      clientSecret: confirmedIntent.client_secret,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return sendResponse(500, error.message || "Internal server error", null);
  }
};

