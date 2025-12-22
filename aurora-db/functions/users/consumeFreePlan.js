import { TABLE_NAME } from "../../helpers/constants.js";
import { getItem, updateItemInDynamoDB } from "../../helpers/dynamodb.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, planId } = body;

    if (!userId) {
      return sendResponse(400, "userId is required", null);
    }

    if (!planId) {
      return sendResponse(400, "planId is required", null);
    }

    const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
    const user = userRes?.Item;
    if (!user) {
      return sendResponse(404, "User not found", null);
    }

    if (user.hasClaimedFreePlan === true) {
      return sendResponse(
        400,
        "Free plan has already been claimed. You can only claim it once.",
        {
          hasClaimedFreePlan: true,
          freeQuizCredits: typeof user.freeQuizCredits === "number" ? user.freeQuizCredits : 2,
        }
      );
    }

    const planRes = await getItem(TABLE_NAME.CERTIFICATION_PLANS, { id: planId });
    const plan = planRes?.Item;
    if (!plan) {
      return sendResponse(404, "Plan not found", null);
    }

    if (plan.price !== 0) {
      return sendResponse(400, "This is not a free plan. Only free plans can be claimed through this endpoint.", null);
    }

    const certificationsUnlocked = plan.certificationsUnlocked || 0;
    if (certificationsUnlocked <= 0) {
      return sendResponse(400, "Plan does not have any certifications unlocked", null);
    }

    const currentFreeQuizCredits =
      typeof user.freeQuizCredits === "number" ? user.freeQuizCredits : 2;
    const newFreeQuizCredits = currentFreeQuizCredits + certificationsUnlocked;

    const result = await updateItemInDynamoDB({
      table: TABLE_NAME.USERS,
      Key: { id: userId },
      UpdateExpression:
        "SET freeQuizCredits = :newFreeQuizCredits, hasClaimedFreePlan = :hasClaimedFreePlan, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":newFreeQuizCredits": newFreeQuizCredits,
        ":hasClaimedFreePlan": true,
        ":updatedAt": getTimestamp(),
      },
      ConditionExpression: "attribute_exists(id)",
    });

    return sendResponse(200, "Free plan claimed successfully", {
      freeQuizCredits: result.Attributes?.freeQuizCredits ?? newFreeQuizCredits,
      certificationsUnlocked: certificationsUnlocked,
      hasClaimedFreePlan: true,
      plan: {
        id: plan.id,
        name: plan.name,
        certificationsUnlocked: plan.certificationsUnlocked,
      },
      updatedAt: result.Attributes?.updatedAt,
    });
  } catch (error) {
    console.error("Error consuming free plan:", error);
    return sendResponse(
      500,
      "Error consuming free plan",
      error.message || error
    );
  }
};

