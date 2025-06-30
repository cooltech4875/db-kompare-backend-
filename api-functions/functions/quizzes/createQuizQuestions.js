import {
  batchWriteItems,
  fetchAllItemByDynamodbIndex,
} from "../../helpers/dynamodb.js";
import { v4 as uuidv4 } from "uuid";
import {
  QUERY_STATUS,
  TABLE_NAME,
  USER_ROLE,
} from "../../helpers/constants.js";
import {
  checkAuthentication,
  getTimestamp,
  sendResponse,
} from "../../helpers/helpers.js";
import { getCategoryIdByName } from "../common/categories.js";

export const handler = async (event) => {
  try {
    await checkAuthentication(event, [USER_ROLE.ADMINS]);

    // 1. Parse and validate input
    const questionArray = JSON.parse(event.body);

    if (!Array.isArray(questionArray) || questionArray.length === 0) {
      return sendResponse(
        400,
        "Request body must be a non-empty array of questions"
      );
    }
    const categ = "graph db modeling";
    // 2. Get initial count of questions (only once)
    const existingQuestionCount = await fetchAllItemByDynamodbIndex({
      TableName: TABLE_NAME.QUIZZES_QUESTIONS,
      IndexName: "byStatus",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeValues: { ":status": QUERY_STATUS.ACTIVE },
      ExpressionAttributeNames: { "#status": "status" },
      CountOnly: true,
    });

    console.log("Existing question count:", existingQuestionCount);

    // 3. Pre-fetch all unique categories needed
    const uniqueCategories = [
      ...new Set(
        questionArray.map((q) => (q.category || categ).trim()).filter(Boolean)
      ),
    ];

    console.log(
      "Uploading new quiz questions with categories:",
      uniqueCategories.join(", ")
    );

    const categoryMap = {};
    await Promise.all(
      uniqueCategories.map(async (category) => {
        categoryMap[category] = await getCategoryIdByName(category);
      })
    );

    // 4. Prepare all items with question numbers
    const itemsToWrite = questionArray.map((raw, idx) => {
      const {
        question,
        options,
        explanation = "",
        image = null,
        difficulty = "HARD",
        category = categ,

        tags = [],
      } = raw ?? {};

      // Validate required fields
      if (typeof question !== "string" || question.trim() === "") {
        throw new Error(`Item ${idx}: "question" must be a non-empty string`);
      }
      if (!Array.isArray(options) || options.length === 0) {
        throw new Error(`Item ${idx}: "options" must be a non-empty array`);
      }

      // Validate options
      const normalizedOptions = options.map((opt, optIdx) => {
        if (
          !opt ||
          typeof opt.text !== "string" ||
          opt.text.trim() === "" ||
          typeof opt.isCorrect !== "boolean"
        ) {
          throw new Error(
            `Item ${idx}, option ${optIdx}: invalid option format`
          );
        }
        return {
          id: uuidv4(),
          text: opt.text.trim(),
          isCorrect: opt.isCorrect,
        };
      });

      const correctCount = normalizedOptions.filter((o) => o.isCorrect).length;
      if (correctCount === 0) {
        throw new Error(`Item ${idx}: at least one option must be correct`);
      }

      return {
        id: uuidv4(),
        createdAt: getTimestamp(),
        question: question.trim(),
        options: normalizedOptions,
        correctCount,
        isMultipleAnswer: correctCount > 1,
        explanation,
        image,
        difficulty,
        // category: categoryMap[categ] || null,
        category: categoryMap[category.trim()] || null,
        tags: Array.isArray(tags) ? tags : [],
        status: QUERY_STATUS.ACTIVE,
        questionNo: existingQuestionCount + idx + 1, // Sequential numbering
      };
    });

    // 5. Batch write in parallel chunks
    const BATCH_SIZE = 25;
    const writePromises = [];

    for (let i = 0; i < itemsToWrite.length; i += BATCH_SIZE) {
      const chunk = itemsToWrite.slice(i, i + BATCH_SIZE);
      writePromises.push(batchWriteItems(TABLE_NAME.QUIZZES_QUESTIONS, chunk));
    }

    await Promise.all(writePromises);

    return sendResponse(
      200,
      "Quiz questions created successfully",
      itemsToWrite
    );
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof SyntaxError) {
      return sendResponse(400, "Malformed JSON in request body");
    }
    return sendResponse(
      error.message?.startsWith("Item") ? 400 : 500,
      error.message || "Internal server error"
    );
  }
};
