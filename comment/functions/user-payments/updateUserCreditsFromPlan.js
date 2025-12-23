import {
  getItem,
  getTimestamp,
  sendResponse,
  updateItemInDynamoDB,
} from "../../helpers/helpers.js";
import { TABLE_NAME } from "../../helpers/constants.js";

/**
 * Lambda: Update User Credits from Plan for platform purchases e:g google play
 * - Fetches plan details
 * - Updates user freeQuizCredits based on plan's certificationsUnlocked
 * - Simple API to add credits after payment success
 */
export const handler = async (event) => {
  try {
    const { userId, planId } = JSON.parse(event.body || "{}");

    if (!userId || !planId) {
      return sendResponse(
        400,
        "Missing required fields: userId and planId",
        null
      );
    }

    // Fetch user and plan
    const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
    const user = userRes.Item;
    if (!user) {
      return sendResponse(404, "User not found", null);
    }

    const planRes = await getItem(TABLE_NAME.CERTIFICATION_PLANS, {
      id: planId,
    });
    const plan = planRes.Item;
    if (!plan) {
      return sendResponse(404, "Plan not found", null);
    }

    const certificationsUnlocked = plan.certificationsUnlocked || 0;

    // Update user credits
    const currentFreeQuizCredits =
      typeof user.freeQuizCredits === "number" ? user.freeQuizCredits : 0;
    const newFreeQuizCredits = currentFreeQuizCredits + certificationsUnlocked;

    await updateItemInDynamoDB({
      table: TABLE_NAME.USERS,
      Key: { id: userId },
      UpdateExpression:
        "SET freeQuizCredits = :newFreeQuizCredits, updatedAt = :u",
      ExpressionAttributeValues: {
        ":newFreeQuizCredits": newFreeQuizCredits,
        ":u": getTimestamp(),
      },
    });

    const message = `Credits updated successfully! Free quiz credits added: ${certificationsUnlocked}. Total free quiz credits: ${newFreeQuizCredits}`;

    return sendResponse(200, message, {
      freeQuizCredits: newFreeQuizCredits,
      creditsAdded: certificationsUnlocked,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return sendResponse(500, error.message || "Internal server error", null);
  }
};
