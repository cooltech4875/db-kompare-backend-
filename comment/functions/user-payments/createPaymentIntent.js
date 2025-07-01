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
    const { userId, paymentMethodId } = JSON.parse(event.body);
    if (!userId) {
      return sendResponse(400, "Missing userId or certificateId", null);
    }

    // 1. Fetch user record from DynamoDB
    const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
    const user = userRes.Item;
    if (!user) {
      return sendResponse(404, "User not found", null);
    }

    // 2. Ensure Stripe Customer
    let stripeCustomerId = user.stripeCustomerId;

    // if (!stripeCustomerId) {
    //   // Create Stripe Customer
    //   const customer = await createCustomer({
    //     email: user.email,
    //     name: user.name,
    //     metadata: { userId },
    //   });

    //   console.log("Created Stripe Customer:", customer);
    //   stripeCustomerId = customer.id;
    //   // Persist stripeCustomerId to DynamoDB
    //   await updateItemInDynamoDB({
    //     table: TABLE_NAME.USERS,
    //     Key: { id: userId },
    //     UpdateExpression: "SET stripeCustomerId = :scid, updatedAt = :u",
    //     ExpressionAttributeValues: {
    //       ":scid": stripeCustomerId,
    //       ":u": new Date().toISOString(),
    //     },
    //   });
    // }

    console.log("Using Stripe Customer ID:", stripeCustomerId);
    // 4. Create a PaymentIntent for a paid certificate
    const paymentIntent = await createPaymentIntent({
      amount: 1000, // €10.00 in cents
      currency: "eur",
      // customerId: stripeCustomerId,
      paymentMethodId: paymentMethodId,
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
