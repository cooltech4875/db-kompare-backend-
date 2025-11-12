import { awardXP as awardXPHelper } from "../../helpers/awardXP.js";
import { sendResponse } from "../../helpers/helpers.js";

/**
 * Handler to award XP to a user via API endpoint
 * Expected body: { userId: string, xpAmount: number, reason?: string }
 */
export const handler = async (event) => {
  try {
    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { userId, xpAmount, reason } = body;

    // Validate required parameters
    if (!userId || typeof xpAmount !== "number" || xpAmount <= 0) {
      return sendResponse(
        400,
        "Invalid parameters: userId and positive xpAmount are required",
        null
      );
    }

    // Award XP
    await awardXPHelper(userId, xpAmount, reason || null);

    return sendResponse(200, "XP awarded successfully", {
      userId,
      xpAmount,
      reason: reason || null,
    });
  } catch (error) {
    console.error("Error in awardXP handler:", error);
    return sendResponse(
      500,
      "Failed to award XP",
      error.message || error
    );
  }
};

