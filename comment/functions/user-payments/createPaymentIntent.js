import {
  getItem,
  getTimestamp,
  sendResponse,
  updateItemInDynamoDB,
} from "../../helpers/helpers.js";
import { TABLE_NAME } from "../../helpers/constants.js";
import { createCustomer, createPaymentIntent } from "../../helpers/stripe.js";

/**
 * Lambda: Initialize certificate issuance
 * - Ensures a Stripe Customer exists for the user
 * - Issues up to FREE_QUOTA certificates for free
 * - Beyond FREE_QUOTA, creates a PaymentIntent and returns its client_secret
 */
export const handler = async (event) => {
  try {
    const { userId, amount, currency } = JSON.parse(event.body);
    
    // Validate required fields
    if (!userId) {
      return sendResponse(400, "Missing userId", null);
    }
    
    if (!amount || amount <= 0) {
      return sendResponse(400, "Missing or invalid amount", null);
    }

    // Default currency to 'eur' if not provided
    const paymentCurrency = currency || "eur";

    // 1. Fetch user record from DynamoDB
    const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
    const user = userRes.Item;
    if (!user) {
      return sendResponse(404, "User not found", null);
    }

    // 2. Ensure Stripe Customer exists
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      // Create Stripe Customer
      const customer = await createCustomer({
        email: user.email,
        name: user.name,
        metadata: { userId },
      });

      console.log("Created Stripe Customer:", customer);
      stripeCustomerId = customer.id;
      // Persist stripeCustomerId to DynamoDB
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

    console.log("Using Stripe Customer ID:", stripeCustomerId);
    // 4. Create a PaymentIntent for a paid certificate
    const paymentIntent = await createPaymentIntent({
      amount: amount, // Amount in cents from frontend
      currency: paymentCurrency,
      customerId: stripeCustomerId,
    });

    return sendResponse(200, "Payment required", {
      free: false,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error in createPaymentLambda:", error.message);
    return sendResponse(500, error.message, null);
  }
};
