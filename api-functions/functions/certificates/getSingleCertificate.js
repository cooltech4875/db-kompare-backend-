import { sendResponse } from "../../helpers/helpers.js";
import { getItem } from "../../helpers/dynamodb.js";
import { TABLE_NAME } from "../../helpers/constants.js";

export const handler = async (event) => {
  try {
    // Extract certificate ID from path parameters
    const { id } = event.pathParameters || {};
    if (!id) {
      return sendResponse(400, "Missing Certificate ID", null);
    }

    // Fetch the certificate by ID
    const certResult = await getItem(TABLE_NAME.CERTIFICATES, { id });
    const certificate = certResult?.Item;
    if (!certificate) {
      return sendResponse(404, "Certificate not found", null);
    }

    // Fetch quiz details using subjectId only if subjectId exists
    let quiz = null;
    if (certificate?.subjectId) {
      const quizResult = await getItem(TABLE_NAME.QUIZZES, { id: certificate?.subjectId });
      quiz = quizResult?.Item;
      if (!quiz) {
        return sendResponse(404, "Associated quiz not found", null);
      }
    }

    // Fetch user details using userId
    const userResult = await getItem(TABLE_NAME.USERS, { id: certificate?.userId });
    const user = userResult?.Item;
    if (!user) {
      return sendResponse(404, "Associated user not found", null);
    }

    // Return combined response
    const responseMessage = certificate?.subjectId 
      ? "Certificate, quiz, and user fetched successfully"
      : "Certificate and user fetched successfully";
    
    return sendResponse(
      200,
      responseMessage,
      { certificate, quiz, user }
    );

  } catch (error) {
    console.error("Error fetching certificate details:", error);
    return sendResponse(500, "Internal server error", error.message);
  }
};
