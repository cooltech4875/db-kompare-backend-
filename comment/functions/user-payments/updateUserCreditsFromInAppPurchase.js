import {
  getItem,
  getTimestamp,
  sendResponse,
  updateItemInDynamoDB,
} from "../../helpers/helpers.js";
import { TABLE_NAME } from "../../helpers/constants.js";

/**
 * Lambda: Update User Credits from In-App Purchase (e.g. Google Play / Apple)
 * - Fetches plan details
 * - Updates user freeQuizCredits based on plan's certificationsUnlocked
 * - Stores transactionId in user's `transactionIds` array
 * - Ignores duplicate transactionId (pre-check + conditional update)
 */
export const handler = async (event) => {
  let userId;
  let planId;
  let transactionId;

  try {
    ({ userId, planId, transactionId } = JSON.parse(event.body || "{}"));
    console.log("[IAP] request received", {
      userId,
      planId,
      transactionId,
      rawBody: event.body,
    });

    if (!userId || !planId || !transactionId) {
      return sendResponse(
        400,
        "Missing required fields: userId, planId and transactionId",
        null
      );
    }

    // Fetch user and plan
    const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
    const user = userRes.Item;
    if (!user) {
      return sendResponse(404, "User not found", null);
    }

    console.log("[IAP] user fetched", {
      userId,
      user,
    });

    const transactionIds = Array.isArray(user.transactionIds)
      ? user.transactionIds
      : [];

    console.log("[IAP] user transactionIds snapshot", {
      userId,
      transactionId,
      transactionIdsCount: transactionIds.length,
      transactionIds,
    });

    // Duplicate transaction check (early return)
    if (transactionIds.includes(transactionId)) {
      const currentCredits =
        typeof user.freeQuizCredits === "number" ? user.freeQuizCredits : 0;

      console.log("[IAP] duplicate transaction ignored", {
        userId,
        planId,
        transactionId,
        freeQuizCredits: currentCredits,
      });

      return sendResponse(200, "Duplicate transactionId ignored", {
        freeQuizCredits: currentCredits,
        creditsAdded: 0,
        transactionId,
      });
    }

    const planRes = await getItem(TABLE_NAME.CERTIFICATION_PLANS, {
      id: planId,
    });
    const plan = planRes.Item;
    if (!plan) {
      return sendResponse(404, "Plan not found", null);
    }

    console.log("[IAP] plan fetched", {
      planId,
      plan,
    });

    const certificationsUnlocked = plan.certificationsUnlocked || 0;

    // Update user credits (same flow as updateUserCreditsFromPlan)
    const currentFreeQuizCredits =
      typeof user.freeQuizCredits === "number" ? user.freeQuizCredits : 0;
    const newFreeQuizCredits =
      currentFreeQuizCredits + certificationsUnlocked;

    console.log("[IAP] credits calculation", {
      userId,
      planId,
      transactionId,
      currentFreeQuizCredits,
      certificationsUnlocked,
      newFreeQuizCredits,
    });

    const updateRes = await updateItemInDynamoDB({
      table: TABLE_NAME.USERS,
      Key: { id: userId },
      UpdateExpression:
        "SET freeQuizCredits = :newFreeQuizCredits, transactionIds = list_append(if_not_exists(transactionIds, :emptyList), :newTxnList), updatedAt = :u",
      ConditionExpression:
        "attribute_not_exists(transactionIds) OR NOT contains(transactionIds, :transactionId)",
      ExpressionAttributeValues: {
        ":newFreeQuizCredits": newFreeQuizCredits,
        ":emptyList": [],
        ":newTxnList": [transactionId],
        ":transactionId": transactionId,
        ":u": getTimestamp(),
      },
    });

    console.log("[IAP] dynamodb update response", {
      userId,
      planId,
      transactionId,
      updateRes,
    });

    const updatedUser = updateRes.Attributes || {};
    const updatedCredits =
      typeof updatedUser.freeQuizCredits === "number"
        ? updatedUser.freeQuizCredits
        : 0;

    const message = `Credits updated successfully! Free quiz credits added: ${certificationsUnlocked}. Total free quiz credits: ${updatedCredits}`;

    console.log("[IAP] credits updated successfully", {
      userId,
      planId,
      transactionId,
      creditsAdded: certificationsUnlocked,
      freeQuizCredits: updatedCredits,
    });

    return sendResponse(200, message, {
      freeQuizCredits: updatedCredits,
      creditsAdded: certificationsUnlocked,
      transactionId,
    });
  } catch (error) {
    if (error && error.code === "ConditionalCheckFailedException") {
      // Idempotency for frequent/concurrent frontend calls: transaction already processed
      const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
      const user = userRes.Item || {};
      const currentCredits =
        typeof user.freeQuizCredits === "number" ? user.freeQuizCredits : 0;

      console.log("[IAP] duplicate transaction ignored (conditional concurrency)", {
        userId,
        planId,
        transactionId,
        freeQuizCredits: currentCredits,
        user,
      });

      return sendResponse(200, "Duplicate transactionId ignored", {
        freeQuizCredits: currentCredits,
        creditsAdded: 0,
        transactionId,
      });
    }

    console.error("Error:", error.message);
    return sendResponse(500, error.message || "Internal server error", null);
  }
};
