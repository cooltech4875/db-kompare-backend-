import { TABLE_NAME } from "../../helpers/constants.js";
import { fetchAllItemsByScan, getBatchItems, fetchItemsByIds } from "../../helpers/dynamodb.js";
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
    const lowestRealXp = topRealUsers.length > 0 ? topRealUsers[topRealUsers.length - 1].xp : null;
    const dummyUsers =
      remainingSlots > 0
        ? await fetchDummyUsers(remainingSlots, lowestRealXp != null ? Math.max(0, lowestRealXp - 1) : null)
        : [];

    // 5. Final list sorted by XP descending so ranks reflect XP order
    const topUsers = [...topRealUsers, ...dummyUsers].sort((a, b) => b.xp - a.xp);

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
    const userMap = {};
    // Attempt batch get using 'id' as the primary key
    let usersArray = await fetchItemsByIds(TABLE_NAME.USERS, userIds, "id");
    // If nothing returned, attempt with 'userId' as primary key (legacy possibility)
    if (!usersArray || usersArray.length === 0) {
      usersArray = await fetchItemsByIds(TABLE_NAME.USERS, userIds, "userId");
    }
    (usersArray || []).forEach((user) => {
      const key = user.id || user.userId;
      if (!key) {
        return;
      }
      userMap[key] = {
        name: user.name || "Unknown User",
        email: user.email || null,
        picture: user.picture || null,
      };
    });

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
const fetchDummyUsers = async (count, maxXpCap = null) => {
  try {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    // Weekly deterministic rotation of dummy identities
    const weeklyNames = getWeeklyNames(DEFAULT_DUMMY_NAMES, nowDate);
    const selectedNames = weeklyNames.slice(0, count);
    return selectedNames.map((name, index) => {
      // Choose XP range:
      // - If we have a cap (lowest real XP - 1), use [minBound, cap] where minBound is at most cap
      // - Otherwise default to [50, 500]
      let minBound = 50;
      let maxBound = 500;
      if (typeof maxXpCap === "number" && maxXpCap >= 0) {
        maxBound = Math.max(0, Math.min(500, maxXpCap));
        // Ensure minBound does not exceed maxBound
        if (minBound > maxBound) {
          // pick a reasonable sub-range under the cap
          minBound = Math.max(0, Math.floor(maxBound * 0.5));
        }
      }
      const randomXP = Math.floor(Math.random() * (maxBound - minBound + 1)) + minBound;
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


