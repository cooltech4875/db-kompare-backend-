// Add DB Ranking Category Handler
// This endpoint creates a new DB Ranking Category

import { createItemInDynamoDB } from "../../helpers/helpers.js";
import { v4 as uuidv4 } from "uuid";
import { DB_TOOL_STATUS, TABLE_NAME } from "../../helpers/constants.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    // Parse the input JSON from the request body
    const body = JSON.parse(event.body || "{}");
    const { name, description } = body;

    // Validate required fields - only name is required
    if (!name) {
      return sendResponse(
        400,
        "Missing required field: name is required",
        null
      );
    }

    // Generate unique ID and timestamps
    const id = uuidv4();
    const createdAt = getTimestamp();
    const updatedAt = createdAt;

    // Prepare category item
    const categoryItem = {
      id,
      name: name.trim(),
      description: description?.trim() || "",
      CreatedAt: createdAt,
      UpdatedAt: updatedAt,
      status: DB_TOOL_STATUS.ACTIVE,
    };

    // Create the category in DynamoDB
    await createItemInDynamoDB(
      categoryItem,
      TABLE_NAME.DB_RANKING_CATEGORIES,
      { "#id": "id" },
      "attribute_not_exists(#id)"
    );

    return sendResponse(
      200,
      "DB Ranking Category added successfully",
      categoryItem
    );
  } catch (error) {
    console.error("Error adding DB Ranking Category:", error);
    return sendResponse(500, "Internal Server Error", error.message);
  }
};

