// src/functions/getGroups.js
import { sendResponse } from "../../helpers/helpers.js";
import {
  fetchAllItemsByScan,
  fetchAllItemByDynamodbIndex,
} from "../../helpers/dynamodb.js";
import { TABLE_NAME } from "../../helpers/constants.js";

/**
 * Lambda handler to fetch all groups.
 *
 * Returns all groups from the database with their:
 * - id: unique identifier
 * - createdAt: creation timestamp
 * - name: group name
 * - quizIds: array of quiz IDs associated with the group
 * - quizCount: number of quizzes in the group
 * - passedQuizzesCount: (if userId provided) number of quizzes user has passed in this group
 */
export const handler = async (event) => {
  try {
    // 1. Get userId from query parameters (optional)
    const { userId } = event.queryStringParameters || {};

    // 2. Fetch all groups
    const groups = await fetchAllItemsByScan({
      TableName: TABLE_NAME.GROUPS,
    });

    // 3. If userId is provided, fetch user's quiz submissions
    let userSubmissions = [];

    if (userId) {
      // Fetch all quiz submissions for this user
      userSubmissions = await fetchAllItemByDynamodbIndex({
        TableName: TABLE_NAME.QUIZZES_SUBMISSIONS,
        IndexName: "byUser",
        KeyConditionExpression: "#userId = :userId",
        ExpressionAttributeNames: { "#userId": "userId" },
        ExpressionAttributeValues: { ":userId": userId },
      });
    }

    // 4. Add quizCount and passedQuizzesCount to each group
    const groupsWithCount = (Array.isArray(groups) ? groups : []).map(
      (group) => {
        const groupQuizIds = Array.isArray(group.quizIds) ? group.quizIds : [];
        const groupResponse = {
          ...group,
          quizCount: groupQuizIds.length,
        };

        // If userId is provided, count passed quizzes and check certificate
        if (userId && groupQuizIds.length > 0) {
          // Filter passed submissions for quizzes in this group
          const passedSubmissions = userSubmissions.filter(
            (submission) =>
              submission.status === "PASSED" &&
              groupQuizIds.includes(submission.quizId)
          );

          // Get unique passed quiz IDs (handling multiple attempts)
          const passedQuizIds = new Set(passedSubmissions.map((s) => s.quizId));

          groupResponse.passedQuizzesCount = passedQuizIds.size;

          // Check if user has taken certificate (check certificateTakenBy array)
          const certificateTakenBy = Array.isArray(group.certificateTakenBy)
            ? group.certificateTakenBy
            : [];
          const certificateUrls = group.certificateUrls || {};
          const certificateSubmissionIds = group.certificateSubmissionIds || {};
          groupResponse.hasCertificate = certificateTakenBy.includes(userId);
          
          // If certificate exists, include the certificate URL and submissionId
          if (groupResponse.hasCertificate && certificateUrls[userId]) {
            groupResponse.certificateUrl = certificateUrls[userId];
          }
          if (groupResponse.hasCertificate && certificateSubmissionIds[userId]) {
            groupResponse.submissionId = certificateSubmissionIds[userId];
          }
        }

        return groupResponse;
      }
    );

    // 5. Return the groups list with quiz counts and passed quizzes count (if userId provided)
    return sendResponse(200, "Groups fetched successfully", groupsWithCount);
  } catch (error) {
    console.error("Error fetching groups:", error);
    // Return a 500 error with a helpful message
    return sendResponse(500, "Error fetching groups", error.message);
  }
};
