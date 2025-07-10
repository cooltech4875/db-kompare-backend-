import { TABLE_NAME } from "../../helpers/constants.js";
import { getItem } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import { fetchQuizWithQuestions } from "../common/quizzes.js";

export const handler = async (event) => {
  // Extract quiz ID from path parameters
  const { id } = event.pathParameters || {};
  console.log("id", id);
  try {
    // Get submission record
    const submissionData = await getItem(TABLE_NAME.QUIZZES_SUBMISSIONS, {
      id,
    });
    const submission = submissionData.Item;
    console.log("submission", submission);

    if (!submission) {
      return sendResponse(404, "Submission not found", null);
    }

    // Get the original quiz
    const quiz = await fetchQuizWithQuestions(submission.quizId);
    console.log("quiz", quiz);

    if (!quiz) {
      return sendResponse(404, "Quiz not found", null);
    }

    let certificate = null;

    if (submission?.certificateId) {
      const certificateData = await getItem(TABLE_NAME.CERTIFICATES, {
        id: submission.certificateId,
      });
      certificate = certificateData.Item;
    }

    console.log("certificate", certificate);

    return sendResponse(200, "Submission fetched successfully", {
      ...submission,
      quizDetails: {
        name: quiz.name,
        category: quiz.category,
        difficulty: quiz.difficulty,
        questions: quiz.questions,
      },
      eligibibleForCredits: certificate?.eligibibleForCredits || "FALSE",
    });
    
  } catch (error) {
    console.error("Error fetching submission:", error);
    return sendResponse(500, "Internal server error", error.message || error);
  }
};
