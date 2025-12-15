import { TABLE_NAME } from "../../helpers/constants.js";
import { getItem } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    // 1) Extract and validate the user ID from query parameters
    const { id } = event.queryStringParameters || {};
    if (!id) {
      return sendResponse(400, "User id is required", null);
    }

    // 2) Fetch the user record from the USERS table
    const userKey = { id };
    const userData = await getItem(TABLE_NAME.USERS, userKey);
    if (!userData.Item) {
      return sendResponse(404, `User with id ${id} not found.`, null);
    }

    // 3) Fetch the user's achievement counters (streak, XP, gems)
    const [streakRes, xpRes, gemsRes] = await Promise.all([
      getItem(
        TABLE_NAME.USER_ACHIEVEMENTS,
        { userId: id, sortKey: "COUNTER#STREAK" }
      ),
      getItem(
        TABLE_NAME.USER_ACHIEVEMENTS,
        { userId: id, sortKey: "COUNTER#XP" }
      ),
      getItem(
        TABLE_NAME.USER_ACHIEVEMENTS,
        { userId: id, sortKey: "COUNTER#GEMS" }
      ),
    ]);

    // 4) Default to zero if the counter item doesn't exist yet
    const metrics = {
      streak: streakRes.Item?.value || 0,
      xp:     xpRes.Item?.value     || 0,
      gems:   gemsRes.Item?.value   || 0,
    };

    const userDetails={
      ...userData.Item,
      freeQuizCredits:
        typeof userData.Item.freeQuizCredits === "number"
          ? userData.Item.freeQuizCredits
          : 2,
      unlockedQuizIds: Array.isArray(userData.Item.unlockedQuizIds)
        ? userData.Item.unlockedQuizIds
        : [],
      metrics: {
        streak: metrics.streak,
        xp: metrics.xp,
        gems: metrics.gems
      }
    }
    // 5) Return user details along with their achievement metrics
    return sendResponse(
      200,
      "User details with achievement metrics",
    userDetails
    );

  } catch (error) {
    console.error("Error fetching user and metrics:", error);
    return sendResponse(
      500,
      "Failed to fetch user details",
      error.message || error
    );
  }
};
