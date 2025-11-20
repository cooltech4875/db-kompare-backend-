import { fetchAllItemByDynamodbIndex } from "../../helpers/dynamodb.js";
import { DB_TOOL_STATUS, TABLE_NAME } from "../../helpers/constants.js";
import { sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    const status = event.queryStringParameters?.status || DB_TOOL_STATUS.ACTIVE;

    const params = {
      TableName: TABLE_NAME.DB_RANKING_CATEGORIES,
      IndexName: "byStatus",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeValues: {
        ":status": status,
      },
      ExpressionAttributeNames: {
        "#status": "status",
      },
    };

    // Use the fetchAllItemByDynamodbIndex helper
    const result = await fetchAllItemByDynamodbIndex(params);

    return sendResponse(200, "Successfully fetched DB ranking categories", result);
  } catch (error) {
    return sendResponse(500, "Internal Server Error", error.message);
  }
};

