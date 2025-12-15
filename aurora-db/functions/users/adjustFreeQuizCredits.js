import { TABLE_NAME } from "../../helpers/constants.js";
import { getItem, updateItemInDynamoDB } from "../../helpers/dynamodb.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, delta = 0, quizId = null } = body;

    if (!userId) {
      return sendResponse(400, "userId is required", null);
    }

    const deltaValue = Number(delta);
    if (Number.isNaN(deltaValue)) {
      return sendResponse(400, "delta must be a number", null);
    }

    // Ensure user exists
    const userRes = await getItem(TABLE_NAME.USERS, { id: userId });
    const user = userRes?.Item;
    if (!user) {
      return sendResponse(404, "User not found", null);
    }

    const currentCredits =
      typeof user.freeQuizCredits === "number" ? user.freeQuizCredits : 2;
    const newCredits = currentCredits + deltaValue;

    if (newCredits < 0) {
      return sendResponse(
        400,
        "Insufficient free quiz credits to apply this change",
        null
      );
    }

    if (deltaValue < 0 && !quizId) {
      return sendResponse(
        400,
        "quizId is required when consuming a free quiz credit",
        null
      );
    }

    let UpdateExpression = "SET freeQuizCredits = :newCredits, updatedAt = :updatedAt";
    const ExpressionAttributeValues = {
      ":newCredits": newCredits,
      ":updatedAt": getTimestamp(),
      ":emptyList": [],
    };

    if (deltaValue < 0 && quizId) {
      UpdateExpression +=
        ", unlockedQuizIds = list_append(if_not_exists(unlockedQuizIds, :emptyList), :quizIdList)";
      ExpressionAttributeValues[":quizIdList"] = [quizId];
    } else {
      // Only initialize unlockedQuizIds if not appending to it
      UpdateExpression += ", unlockedQuizIds = if_not_exists(unlockedQuizIds, :emptyList)";
    }

    const result = await updateItemInDynamoDB({
      table: TABLE_NAME.USERS,
      Key: { id: userId },
      UpdateExpression,
      ExpressionAttributeValues,
      ConditionExpression: "attribute_exists(id)",
    });

    return sendResponse(200, "Free quiz credits updated", {
      freeQuizCredits: result.Attributes?.freeQuizCredits ?? newCredits,
      unlockedQuizIds: result.Attributes?.unlockedQuizIds || [],
      updatedAt: result.Attributes?.updatedAt,
    });
  } catch (error) {
    console.error("Error adjusting free quiz credits:", error);
    return sendResponse(
      500,
      "Error adjusting free quiz credits",
      error.message || error
    );
  }
};
