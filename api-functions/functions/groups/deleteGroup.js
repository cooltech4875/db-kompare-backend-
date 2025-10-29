// src/functions/groups/deleteGroup.js

import { checkAuthentication, sendResponse } from "../../helpers/helpers.js";
import { deleteItem, getItem } from "../../helpers/dynamodb.js";
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

    const deleted = await deleteItem(
      TABLE_NAME.GROUPS,
      { id },
      { "#id": "id" },
      "attribute_exists(#id)"
    );

    if (!deleted.Attributes) {
      return sendResponse(404, "Group not found or already deleted", null);
    }

    return sendResponse(200, "Group deleted successfully", deleted.Attributes);
  } catch (error) {
    console.error("Error deleting group:", error);
    return sendResponse(500, "Internal server error", error.message);
  }
};


