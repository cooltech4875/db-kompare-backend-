import { TABLE_NAME } from "./constants.js";
import { fetchAllItemsByScan } from "./dynamodb.js";

/**
 * Fetch all dummy users from USER_ACHIEVEMENTS table
 * @returns {Promise<Array>} Array of dummy user items
 */
export const fetchAllDummyUsers = async () => {
  return await fetchAllItemsByScan({
    TableName: TABLE_NAME.USER_ACHIEVEMENTS,
    FilterExpression: "#sortKey = :sortKey",
    ExpressionAttributeNames: {
      "#sortKey": "sortKey",
    },
    ExpressionAttributeValues: {
      ":sortKey": "DUMMY_USER",
    },
  });
};

/**
 * Format dummy users for leaderboard
 * @param {Array} dummyItems - Raw dummy user items from DynamoDB
 * @param {number} count - Optional count limit
 * @returns {Array} Formatted dummy users sorted by XP descending
 */
export const formatDummyUsers = (dummyItems, count = null) => {
  const formatted = dummyItems
    .filter((item) => item.value !== undefined && item.value !== null)
    .map((item) => ({
      userId: item.userId,
      xp: item.value || 0,
      name: item.name || "Anonymous User",
      lastUpdate: item.lastUpdate || null,
    }))
    .sort((a, b) => b.xp - a.xp);

  return count ? formatted.slice(0, count) : formatted;
};

