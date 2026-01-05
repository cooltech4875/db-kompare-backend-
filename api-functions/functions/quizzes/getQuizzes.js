// src/functions/getQuizzes.js
import { sendResponse } from "../../helpers/helpers.js";
import { fetchAllItemByDynamodbIndex, fetchAllItemsByScan } from "../../helpers/dynamodb.js";
import { fetchUserById } from "../common/fetchUserById.js";
import { TABLE_NAME, QUERY_STATUS } from "../../helpers/constants.js";

/**
 * Lambda handler to fetch quizzes and enrich them with participant info.
 *
 * Query parameters:
 * - status (optional): Filters quizzes by status (default: ACTIVE)
 * - userId (optional): Marks which quizzes the user has already taken
 *
 * Each quiz in the response will include:
 * - taken: boolean (has this user taken the quiz?)
 * - defaultParticipants: number (initial random participants set at creation)
 * - recentParticipants: up to 3 most recent real participants (with basic user info)
 * - otherParticipantsCount: count of remaining participants (default + real minus top 3)
 */
export const handler = async (event) => {
  try {
    // 1. Read query parameters, with defaults
    const params = event.queryStringParameters || {};
    const status = params.status || QUERY_STATUS.ACTIVE;
    const userId = params.userId;
    const groupName = params.groupName || null;
    const difficulty = params.difficulty || null; // optional filter

    // 2. Fetch all quizzes matching the status
    let quizzes = await fetchAllItemByDynamodbIndex({
      TableName: TABLE_NAME.QUIZZES,
      IndexName: "byStatus",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status },
    });

    // 2a. Optional difficulty filter
    if (difficulty) {
      quizzes = quizzes.filter((q) => q.difficulty === difficulty);
    }

    // 2b. If groupName provided, filter quizzes by the group's quizIds
    if (groupName) {
      const groups = await fetchAllItemsByScan({ TableName: TABLE_NAME.GROUPS });
      const normalize = (v) => String(v || "").trim().toLowerCase();
      const selectedGroup = groups.find(
        (g) => normalize(g?.name) === normalize(groupName)
      );

      if (!selectedGroup) {
        return sendResponse(200, "No quizzes for this group", []);
      }

      const allowedQuizIds = new Set(selectedGroup.quizIds || []);
      quizzes = quizzes.filter((q) => allowedQuizIds.has(q.id));
    }

    // 3. Initialize each quiz's 'taken' flag and capture default participants
    let quizzesWithTaken = quizzes.map((quiz) => ({
      ...quiz,
      taken: false,
      defaultParticipants: quiz.defaultParticipants || 0, // initial random participants
    }));

    // 4. If a userId is provided, mark quizzes they've taken
    if (userId) {
      // Fetch this user's quiz submissions
      const submissions = await fetchAllItemByDynamodbIndex({
        TableName: TABLE_NAME.QUIZZES_SUBMISSIONS,
        IndexName: "byUser",
        KeyConditionExpression: "#userId = :userId",
        ExpressionAttributeNames: { "#userId": "userId" },
        ExpressionAttributeValues: { ":userId": userId },
      });

      // Build a set of quiz IDs the user has taken
      const takenQuizIds = new Set(submissions.map((s) => s.quizId));

      // Update 'taken' flag accordingly
      quizzesWithTaken = quizzesWithTaken.map((quiz) => ({
        ...quiz,
        taken: takenQuizIds.has(quiz.id),
      }));
    }

    // 5. Enrich quizzes with participant details
    const enrichedQuizzes = await Promise.all(
      quizzesWithTaken.map(async (quiz) => {
        // 5a. Fetch all real submissions for this quiz, newest first
        const subs = await fetchAllItemByDynamodbIndex({
          TableName: TABLE_NAME.QUIZZES_SUBMISSIONS,
          IndexName: "byQuiz",
          KeyConditionExpression: "#quizId = :quizId",
          ExpressionAttributeNames: { "#quizId": "quizId" },
          ExpressionAttributeValues: { ":quizId": quiz.id },
          ScanIndexForward: false, // descending order (latest first)
        });

        // 5b. Get up to 3 most recent real submissions
        const recentSubs = subs.slice(0, 3);


        // 5c. Fetch basic user info for each recent submission
        const recentParticipants = await Promise.all(
          recentSubs.map(async (submission) => {
            const user = await fetchUserById(submission.userId);
            return {
              user:
                user === "Unknown"
                  ? { id: submission.userId, unknown: true }
                  : { id: user.id, name: user.name, email: user.email },
              submittedAt: submission.submittedAt,
            };
          })
        );

        // 5d. Calculate counts including default participants
        const totalReal = subs.length;
        const defaultCount = quiz.defaultParticipants;
        const totalCount = defaultCount + totalReal;
      
        // Participants beyond the top 3
        const otherParticipantsCount = Math.max(
          0,
          totalCount - recentParticipants.length
        );

        return {
          ...quiz,
          recentParticipants,
          otherParticipantsCount,
        };
      })
    );

    // 6. Return the final enriched quiz list
    return sendResponse(200, "Quizzes fetched successfully", enrichedQuizzes);
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    // Return a 500 error with a helpful message
    return sendResponse(500, "Error fetching quizzes", error.message);
  }
};
