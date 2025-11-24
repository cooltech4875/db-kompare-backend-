// Delete DB Tool Handler
// This endpoint deletes a DB Tool by ID

import DynamoDB from "aws-sdk/clients/dynamodb.js";
const DynamoDBClient = new DynamoDB.DocumentClient();

import { sendResponse, getItem } from "../../helpers/helpers.js";
import { TABLE_NAME } from "../../helpers/constants.js";

export const handler = async (event, context, callback) => {
  try {
    // Extract tool ID from request body
    const { id } = JSON.parse(event.body || "{}");

    if (!id) {
      return sendResponse(400, "Missing tool ID", null);
    }

    // Verify tool exists
    const existing = await getItem(TABLE_NAME.DB_TOOLS, { id });
    if (!existing || !existing.Item) {
      return sendResponse(404, "DB Tool not found", null);
    }

    // Delete the tool from DynamoDB
    const deleteParams = {
      TableName: TABLE_NAME.DB_TOOLS,
      Key: {
        id: id,
      },
      ReturnValues: "ALL_OLD",
    };

    const deleted = await DynamoDBClient.delete(deleteParams).promise();

    if (!deleted.Attributes) {
      return sendResponse(404, "DB Tool not found or already deleted", null);
    }

    return sendResponse(200, "DB Tool deleted successfully", deleted.Attributes);
  } catch (error) {
    console.error("Error deleting DB Tool:", error);
    return sendResponse(500, "Internal Server Error", error.message);
  }
};

