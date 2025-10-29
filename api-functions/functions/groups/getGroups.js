// src/functions/getGroups.js
import { sendResponse } from "../../helpers/helpers.js";
import { fetchAllItemsByScan } from "../../helpers/dynamodb.js";
import { TABLE_NAME } from "../../helpers/constants.js";

/**
 * Lambda handler to fetch all groups.
 *
 * Returns all groups from the database with their:
 * - id: unique identifier
 * - createdAt: creation timestamp
 * - name: group name
 * - quizIds: array of quiz IDs associated with the group
 */
export const handler = async (event) => {
  try {
    // 1. Fetch all groups
    const groups = await fetchAllItemsByScan({
      TableName: TABLE_NAME.GROUPS,
    });

    // 2. Return the groups list
    return sendResponse(200, "Groups fetched successfully", groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    // Return a 500 error with a helpful message
    return sendResponse(500, "Error fetching groups", error.message);
  }
};
