// src/functions/updateGroup.js
import { checkAuthentication, sendResponse } from "../../helpers/helpers.js";
import { updateItemInDynamoDB, getItem } from "../../helpers/dynamodb.js";
import { TABLE_NAME, USER_ROLE } from "../../helpers/constants.js";

export const handler = async (event) => {
  try {
    await checkAuthentication(event, [USER_ROLE.ADMINS]);

    const { id } = event.pathParameters || {};
    if (!id) {
      return sendResponse(400, "Missing group ID", null);
    }

    const existing = await getItem(TABLE_NAME.GROUPS, { id });
    if (!existing || !existing.Item) {
      return sendResponse(404, "Group not found", null);
    }

    const { name, quizIds } = JSON.parse(event.body || "{}");

    if (name === undefined && quizIds === undefined) {
      return sendResponse(400, "No update data provided. Expected 'name' and/or 'quizIds'", null);
    }

    if (quizIds !== undefined && !Array.isArray(quizIds)) {
      return sendResponse(400, '"quizIds" must be an array', null);
    }

    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    const updateClauses = [];

    if (name !== undefined && name !== null) {
      expressionAttributeNames["#name"] = "name";
      expressionAttributeValues[":name"] = name.trim();
      updateClauses.push("#name = :name");
    }

    if (quizIds !== undefined) {
      expressionAttributeNames["#quizIds"] = "quizIds";
      expressionAttributeValues[":quizIds"] = quizIds;
      updateClauses.push("#quizIds = :quizIds");
    }

    const updated = await updateItemInDynamoDB({
      table: TABLE_NAME.GROUPS,
      Key: { id },
      UpdateExpression: `set ${updateClauses.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    });

    return sendResponse(200, "Group updated successfully", updated.Attributes);
  } catch (error) {
    console.error("Error updating group:", error);
    return sendResponse(500, "Internal server error", error.message);
  }
};


