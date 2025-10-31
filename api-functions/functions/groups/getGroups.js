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

    // 2. Add quizCount to each group (number of quizzes in the group)
    // Safely handle empty groups array or null/undefined
    const groupsWithCount = (Array.isArray(groups) ? groups : []).map(
      (group) => ({
        ...group,
        quizCount: Array.isArray(group.quizIds) ? group.quizIds.length : 0,
      })
    );

    // 3. Return the groups list with quiz counts
    return sendResponse(200, "Groups fetched successfully", groupsWithCount);
  } catch (error) {
    console.error("Error fetching groups:", error);
    // Return a 500 error with a helpful message
    return sendResponse(500, "Error fetching groups", error.message);
  }
};
