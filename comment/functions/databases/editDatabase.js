// Edit/Update Database Handler
// This endpoint updates a Database by ID

import { sendResponse, updateItemInDynamoDB, getItem, getTimestamp } from "../../helpers/helpers.js";
import { TABLE_NAME, DATABASE_STATUS } from "../../helpers/constants.js";

export const handler = async (event) => {
  try {
    // Extract database ID from path parameters
    const { id } = event.pathParameters || {};
    if (!id) {
      return sendResponse(400, "Missing database ID", null);
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");

    // Verify database exists
    const existing = await getItem(TABLE_NAME.DATABASES, { id });
    if (!existing || !existing.Item) {
      return sendResponse(404, "Database not found", null);
    }

    // Build update expression dynamically
    const updateFields = [];
    const attributeValues = {};
    const attributeNames = {};

    // Get all fields from body except id (which shouldn't be updated)
    const fieldsToUpdate = Object.keys(body).filter(key => key !== "id");

    // Validate that at least one field is provided for update
    if (fieldsToUpdate.length === 0) {
      return sendResponse(400, "At least one field is required for update", null);
    }

    // Process each field dynamically
    for (const field of fieldsToUpdate) {
      const value = body[field];
      
      // Skip undefined values
      if (value === undefined) {
        continue;
      }

      // Handle status validation
      if (field === "status") {
        if (!Object.values(DATABASE_STATUS).includes(value)) {
          return sendResponse(400, "Invalid status value", null);
        }
      }

      // Build the update expression for this field
      const fieldName = `#${field}`;
      const valueName = `:${field}`;
      
      updateFields.push(`${fieldName} = ${valueName}`);
      attributeValues[valueName] = typeof value === "string" ? value.trim() : value;
      attributeNames[fieldName] = field;
    }

    // Validate that we have at least one valid field to update
    if (updateFields.length === 0) {
      return sendResponse(400, "No valid fields provided for update", null);
    }

    // Always update updatedAt timestamp
    updateFields.push("#updatedAt = :updatedAt");
    attributeValues[":updatedAt"] = getTimestamp();
    attributeNames["#updatedAt"] = "updatedAt";

    // Perform the update
    const updated = await updateItemInDynamoDB({
      table: TABLE_NAME.DATABASES,
      Key: { id },
      UpdateExpression: `SET ${updateFields.join(", ")}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
      ReturnValues: "ALL_NEW",
    });

    // Return updated item
    return sendResponse(200, "Database updated successfully", updated.Attributes);
  } catch (error) {
    console.error("Error updating Database:", error);
    return sendResponse(500, "Internal server error", error.message);
  }
};

