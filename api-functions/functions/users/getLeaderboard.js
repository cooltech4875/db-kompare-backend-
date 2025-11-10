import { TABLE_NAME } from "../../helpers/constants.js";
import { fetchAllItemsByScan, getBatchItems } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import { fetchAllDummyUsers, formatDummyUsers } from "../../helpers/leaderboard.js";

/**
 * Get leaderboard of top users by XP
 * Always returns top 10 users
 * Fills remaining slots with dummy users if real users are less than 10
 */
export const handler = async (event) => {
  try {
    const limit = 10; // Always return top 10 users

    // 1. Scan USER_ACHIEVEMENTS table to get all real XP counters
    const allItems = await fetchAllItemsByScan({
      TableName: TABLE_NAME.USER_ACHIEVEMENTS,
      FilterExpression: "#sortKey = :sortKey",
      ExpressionAttributeNames: {
        "#sortKey": "sortKey",
      },
      ExpressionAttributeValues: {
        ":sortKey": "COUNTER#XP",
      },
    });

    // 2. Filter real users (exclude dummy users) and sort by XP value (descending)
    const realXpCounters = allItems
      .filter((item) => 
        item.sortKey === "COUNTER#XP" && 
        item.value !== undefined && 
        item.value !== null &&
        !item.userId.startsWith("DUMMY_") // Exclude dummy users
      )
      .map((item) => ({
        userId: item.userId,
        xp: item.value || 0,
        lastUpdate: item.lastUpdate || null,
      }))
      .sort((a, b) => b.xp - a.xp); // Sort descending by XP

    // 3. If we need more users to fill top 10, get dummy users
    let xpCounters = [...realXpCounters];
    if (realXpCounters.length < limit) {
      const dummyUsersNeeded = limit - realXpCounters.length;
      const dummyUsers = await fetchDummyUsers(dummyUsersNeeded);
      xpCounters = [...realXpCounters, ...dummyUsers];
      // Re-sort after adding dummy users
      xpCounters.sort((a, b) => b.xp - a.xp);
    }

    // 4. Get top 10 users
    const topUsers = xpCounters.slice(0, limit);

    // 5. Fetch user details only for real users (dummy users already have all data in item)
    const realUserIds = topUsers
      .filter((item) => !item.userId.startsWith("DUMMY_"))
      .map((item) => item.userId);
    const userDetailsMap = await fetchUserDetails(realUserIds);

    // 6. Combine XP data with user details and add rank
    const leaderboard = topUsers.map((item, index) => {
      const isDummy = item.userId.startsWith("DUMMY_");
      const userDetails = userDetailsMap[item.userId] || {};
      
      return {
        rank: index + 1,
        userId: item.userId,
        name: isDummy ? item.name : (userDetails.name || "Unknown User"),
        email: isDummy ? null : (userDetails.email || null),
        xp: item.xp,
        lastUpdate: item.lastUpdate,
      };
    });

    // 7. Return response
    return sendResponse(200, "Leaderboard fetched successfully", {
      leaderboard,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return sendResponse(500, "Failed to fetch leaderboard", error.message || error);
  }
};

/**
 * Fetch user details for real users only
 * @param {string[]} userIds - Array of real user IDs (no dummy users)
 * @returns {Promise<Object>} Map of userId to user details
 */
const fetchUserDetails = async (userIds) => {
  if (!userIds || userIds.length === 0) {
    return {};
  }

  try {
    const keys = userIds.map((id) => ({ id }));
    const batchResult = await getBatchItems(TABLE_NAME.USERS, keys);

    const userMap = {};
    if (batchResult.Responses && batchResult.Responses[TABLE_NAME.USERS]) {
      batchResult.Responses[TABLE_NAME.USERS].forEach((user) => {
        userMap[user.id] = {
          name: user.name || "Unknown User",
          email: user.email || null,
          picture: user.picture || null,
        };
      });
    }

    return userMap;
  } catch (error) {
    console.error("Error fetching user details:", error);
    return {};
  }
};

/**
 * Fetch dummy users for leaderboard
 * @param {number} count - Number of dummy users needed
 * @returns {Promise<Array>} Array of dummy user objects with userId, xp, name, and lastUpdate
 */
const fetchDummyUsers = async (count) => {
  try {
    const dummyItems = await fetchAllDummyUsers();
    return formatDummyUsers(dummyItems, count);
  } catch (error) {
    console.error("Error fetching dummy users:", error);
    return [];
  }
};

