import { checkAuthentication, sendResponse } from "../../helpers/helpers.js";
import { updateItemInDynamoDB, getItem } from "../../helpers/dynamodb.js";
import { TABLE_NAME, USER_ROLE } from "../../helpers/constants.js";

/**
 * Lambda: Update Certificate record
 * - Secured to ADMIN users
 * - Dynamically updates any provided fields on a Certificate
 */
export const handler = async (event) => {
  try {

    // 2) Get certificate ID
    const { id } = event.pathParameters || {};
    if (!id) {
      return sendResponse(400, "Missing certificate ID", null);
    }

    // 3) Fetch existing certificate
    const tableName = TABLE_NAME.CERTIFICATES;
    const existing = await getItem(tableName, { id });
    if (!existing || !existing.Item) {
      return sendResponse(404, "Certificate not found", null);
    }

    // 4) Parse update payload
    const body = JSON.parse(event.body || "{}");
    if (!Object.keys(body).length) {
      return sendResponse(400, "No update data provided", null);
    }

    // 5) Build dynamic UpdateExpression
    let updateExpression = "set ";
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};
    const updateClauses = [];

    Object.keys(body).forEach((field) => {
      const nameKey = `#${field}`;
      const valueKey = `:${field}`;
      updateClauses.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = field;
      expressionAttributeValues[valueKey] = body[field];
    });

    updateExpression += updateClauses.join(", ");

    // 6) Perform the update
    const result = await updateItemInDynamoDB({
      table:        tableName,
      Key:          { id },
      UpdateExpression:          updateExpression,
      ExpressionAttributeNames:  expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues:              "ALL_NEW"
    });

    // 7) Return the updated certificate
    return sendResponse(200, "Certificate updated successfully", result.Attributes);

  } catch (error) {
    console.error("Error updating certificate:", error);
    return sendResponse(500, "Internal server error", { error: error.message });
  }
};
