import { TABLE_NAME } from "../../helpers/constants.js";
import { fetchAllItemsByScan, getBatchItems } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";

/**
 * Get leaderboard of top users by XP
 * Supports pagination with page parameter (defaults to page 1)
 * Returns top 10 users per page
 */
export const handler = async (event) => {
  try {
    // Extract page number from query parameters (default to 1)
    const { page = "1" } = event.queryStringParameters || {};
    const pageNumber = parseInt(page, 10);

    // Validate page number
    if (isNaN(pageNumber) || pageNumber < 1) {
      return sendResponse(400, "Invalid page number. Must be a positive integer.", null);
    }

    // Calculate offset for pagination
    const limit = 10; // Top 10 per page
    const offset = (pageNumber - 1) * limit;

    // 1. Scan USER_ACHIEVEMENTS table to get all XP counters
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

    // 2. Filter and sort by XP value (descending)
    const xpCounters = allItems
      .filter((item) => item.sortKey === "COUNTER#XP" && item.value !== undefined && item.value !== null)
      .map((item) => ({
        userId: item.userId,
        xp: item.value || 0,
        lastUpdate: item.lastUpdate || null,
      }))
      .sort((a, b) => b.xp - a.xp); // Sort descending by XP

    // 3. Calculate total pages
    const totalUsers = xpCounters.length;
    const totalPages = Math.ceil(totalUsers / limit);

    // 4. Apply pagination
    const paginatedResults = xpCounters.slice(offset, offset + limit);

    // 5. Fetch user details for the paginated results
    const userIds = paginatedResults.map((item) => item.userId);
    const userDetailsMap = await fetchUserDetails(userIds);

    // 6. Combine XP data with user details and add rank
    const leaderboard = paginatedResults.map((item, index) => {
      const userDetails = userDetailsMap[item.userId] || {};
      return {
        rank: offset + index + 1, // Rank starts from offset + 1
        userId: item.userId,
        name: userDetails.name || "Unknown User",
        email: userDetails.email || null,
        xp: item.xp,
        lastUpdate: item.lastUpdate,
      };
    });

    // 7. Return response with pagination metadata
    return sendResponse(200, "Leaderboard fetched successfully", {
      leaderboard,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalUsers,
        limit,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return sendResponse(500, "Failed to fetch leaderboard", error.message || error);
  }
};

/**
 * Fetch user details for given user IDs
 * @param {string[]} userIds - Array of user IDs
 * @returns {Promise<Object>} Map of userId to user details
 */
const fetchUserDetails = async (userIds) => {
  if (!userIds || userIds.length === 0) {
    return {};
  }

  try {
    // Use batch get to fetch multiple users at once
    const keys = userIds.map((id) => ({ id }));
    const batchResult = await getBatchItems(TABLE_NAME.USERS, keys);

    // Create a map of userId to user details
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
    // Return empty map on error to not break the leaderboard
    return {};
  }
};

