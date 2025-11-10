import { TABLE_NAME } from "../../helpers/constants.js";
import { fetchAllItemsByScan, getBatchItems } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";

// Names used to generate dummy users if none exist in storage
const DEFAULT_DUMMY_NAMES = [
  "Alex Johnson",
  "Sarah Chen",
  "Michael Brown",
  "Emily Davis",
  "David Wilson",
  "Jessica Martinez",
  "Christopher Lee",
  "Amanda Taylor",
  "James Anderson",
  "Lisa Garcia",
  "Robert Smith",
  "Maria Rodriguez",
  "Daniel White",
  "Jennifer Lopez",
  "William Thompson",
  "Ashley Moore",
  "Matthew Harris",
  "Nicole Jackson",
  "Ryan Clark",
  "Stephanie Lewis",
  "Kevin Walker",
  "Michelle Hall",
  "Jason Young",
  "Rachel King",
  "Brandon Wright",
];

// Deterministic weekly shuffle of names (no DB needed)
const getWeeklyNames = (names, date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d - yearStart) / 86400000) + 1;
  const week = Math.ceil(days / 7);
  const key = `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  let seed = 0;
  for (let i = 0; i < key.length; i++) {
    seed = (seed << 5) - seed + key.charCodeAt(i);
    seed |= 0;
  }
  seed >>>= 0;
  const rand = (() => {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const copy = [...names];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

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

    // 3. Take top real users up to the limit
    const topRealUsers = realXpCounters.slice(0, limit);

    // 4. If fewer than limit, generate the remaining dummy users (in-memory only)
    const remainingSlots = limit - topRealUsers.length;
    const dummyUsers = remainingSlots > 0 ? await fetchDummyUsers(remainingSlots) : [];

    // 5. Final list = real users first, then dummy users (no re-sort so real users stay on top)
    const topUsers = [...topRealUsers, ...dummyUsers];

    // 6. Fetch user details only for real users (dummy users already have all data in item)
    const realUserIds = topUsers
      .filter((item) => !item.userId.startsWith("DUMMY_"))
      .map((item) => item.userId);
    const userDetailsMap = await fetchUserDetails(realUserIds);

    // 7. Combine XP data with user details and add rank
    const leaderboard = topUsers.map((item, index) => {
      const userDetails = userDetailsMap[item.userId] || {};
      return {
        rank: index + 1,
        userId: item.userId.startsWith("DUMMY_") ? null : item.userId,
        name: userDetails.name || item.name || "Unknown User",
        email: userDetails.email || null,
        xp: item.xp,
        lastUpdate: item.lastUpdate,
      };
    });

    // 8. Return response
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
    const nowDate = new Date();
    const now = nowDate.toISOString();
    // Weekly deterministic rotation of dummy identities
    const weeklyNames = getWeeklyNames(DEFAULT_DUMMY_NAMES, nowDate);
    const selectedNames = weeklyNames.slice(0, count);
    return selectedNames.map((name, index) => {
      const randomXP = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
      const userId = `DUMMY_${String(index + 1).padStart(3, "0")}`;
      return {
        userId,
        xp: randomXP,
        name,
        lastUpdate: now,
      };
    });
  } catch (error) {
    console.error("Error fetching dummy users:", error);
    return [];
  }
};

