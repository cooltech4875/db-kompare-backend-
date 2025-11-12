/**
 * Helper function to award XP to a user
 * This function creates an event log and updates the XP counter in DynamoDB
 * following the same pattern as processAchievement
 */

import { TABLE_NAME } from "./constants.js";
import { createItemInDynamoDB, updateItemInDynamoDB } from "./dynamodb.js";
import { getTimestamp } from "./helpers.js";

/**
 * Awards XP to a user and logs the event
 * @param {string} userId - The user ID
 * @param {number} xpAmount - The amount of XP to award
 * @param {string} reason - Optional reason for the XP award
 * @returns {Promise<void>}
 */
export const awardXP = async (userId, xpAmount, reason = null) => {
  try {
    if (!userId || typeof xpAmount !== "number" || xpAmount <= 0) {
      throw new Error("Invalid parameters: userId and positive xpAmount required");
    }

    // Generate timestamp
    const tsMs = getTimestamp();
    const ts = new Date(tsMs).toISOString();

    // Create event log
    const eventItem = {
      userId,
      sortKey: `EVENT#XP#${ts}`,
      type: "XP",
      ts,
      delta: xpAmount,
      ...(reason ? { reason } : {}),
    };

    await createItemInDynamoDB(
      eventItem,
      TABLE_NAME.USER_ACHIEVEMENTS,
      null,
      null
    );

    // Update XP counter atomically
    const counterKey = { userId, sortKey: "COUNTER#XP" };
    await updateItemInDynamoDB({
      table: TABLE_NAME.USER_ACHIEVEMENTS,
      Key: counterKey,
      UpdateExpression: "ADD #v :delta SET lastUpdate = :now",
      ExpressionAttributeNames: { "#v": "value" },
      ExpressionAttributeValues: { ":delta": xpAmount, ":now": ts },
    });
  } catch (error) {
    console.error("Error awarding XP:", error);
    // Don't throw - we don't want XP award failures to break the main flow
    // Just log the error
  }
};

