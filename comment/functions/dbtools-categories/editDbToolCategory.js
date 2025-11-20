// Edit/Update DB Tool Category Handler
// This endpoint updates a DB Tool Category by ID

import { sendResponse, updateItemInDynamoDB, getItem, getTimestamp } from "../../helpers/helpers.js";
import { TABLE_NAME } from "../../helpers/constants.js";

export const handler = async (event) => {
  try {
    // 1. Extract category ID from path parameters
    const { id } = event.pathParameters || {};
    if (!id) {
      return sendResponse(400, "Missing category ID", null);
    }

    // 2. Parse request body
    const body = JSON.parse(event.body || "{}");
    const { name, description, status } = body;

    // 3. Validate that at least one field is provided for update
    if (!name && !description && !status) {
      return sendResponse(
        400,
        "At least one field (name, description, or status) is required for update",
        null
      );
    }

    // 4. Verify category exists
    const existing = await getItem(TABLE_NAME.DB_TOOL_CATEGORIES, { id });
    if (!existing || !existing.Item) {
      return sendResponse(404, "Category not found", null);
    }

    // 5. Build update expression dynamically
    const updateFields = [];
    const attributeValues = {};
    const attributeNames = {};

    if (name) {
      updateFields.push("#name = :name");
      attributeValues[":name"] = name.trim();
      attributeNames["#name"] = "name";
    }

    if (description) {
      updateFields.push("#description = :description");
      attributeValues[":description"] = description.trim();
      attributeNames["#description"] = "description";
    }

    if (status) {
      updateFields.push("#status = :status");
      attributeValues[":status"] = status;
      attributeNames["#status"] = "status";
    }

    // Always update UpdatedAt timestamp
    updateFields.push("#updatedAt = :updatedAt");
    attributeValues[":updatedAt"] = getTimestamp();
    attributeNames["#updatedAt"] = "UpdatedAt";

    // 6. Perform the update
    const updated = await updateItemInDynamoDB({
      table: TABLE_NAME.DB_TOOL_CATEGORIES,
      Key: { id },
      UpdateExpression: `SET ${updateFields.join(", ")}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
      ReturnValues: "ALL_NEW",
    });

    // 7. Return updated item
    return sendResponse(
      200,
      "DB Tool Category updated successfully",
      updated.Attributes
    );
  } catch (error) {
    console.error("Error updating DB Tool Category:", error);
    return sendResponse(500, "Internal server error", error.message);
  }
};

