// Delete DB Ranking Category Handler
// This endpoint deletes a DB Ranking Category by ID

import DynamoDB from "aws-sdk/clients/dynamodb.js";
const DynamoDBClient = new DynamoDB.DocumentClient();

import { sendResponse, getItem } from "../../helpers/helpers.js";
import { TABLE_NAME } from "../../helpers/constants.js";

export const handler = async (event, context, callback) => {
  try {
    // Extract category ID from request body
    const { id } = JSON.parse(event.body || "{}");

    if (!id) {
      return sendResponse(400, "Missing category ID", null);
    }

    // Verify category exists
    const existing = await getItem(TABLE_NAME.DB_RANKING_CATEGORIES, { id });
    if (!existing || !existing.Item) {
      return sendResponse(404, "DB Ranking Category not found", null);
    }

    // Delete the category from DynamoDB
    const deleteParams = {
      TableName: TABLE_NAME.DB_RANKING_CATEGORIES,
      Key: {
        id: id,
      },
      ReturnValues: "ALL_OLD",
    };

    const deleted = await DynamoDBClient.delete(deleteParams).promise();

    if (!deleted.Attributes) {
      return sendResponse(404, "Category not found or already deleted", null);
    }

    return sendResponse(
      200,
      "DB Ranking Category deleted successfully",
      deleted.Attributes
    );
  } catch (error) {
    console.error("Error deleting DB Ranking Category:", error);
    return sendResponse(500, "Internal Server Error", error.message);
  }
};

