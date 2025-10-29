// src/functions/groups/createGroup.js

import { createItemInDynamoDB } from "../../helpers/dynamodb.js";
import { v4 as uuidv4 } from "uuid";
import { TABLE_NAME, USER_ROLE } from "../../helpers/constants.js";
import {
  checkAuthentication,
  getTimestamp,
  sendResponse,
} from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    await checkAuthentication(event, [USER_ROLE.ADMINS]);

    const { name, quizIds = [] } = JSON.parse(event.body || "{}");

    if (!name) {
      return sendResponse(400, 'Missing "name"', null);
    }

    if (!Array.isArray(quizIds)) {
      return sendResponse(400, '"quizIds" must be an array', null);
    }

    const groupItem = {
      id: uuidv4(),
      createdAt: getTimestamp(),
      name: name.trim(),
      quizIds: Array.isArray(quizIds) ? quizIds : [],
    };

    await createItemInDynamoDB(
      groupItem,
      TABLE_NAME.GROUPS,
      { "#id": "id" },
      "attribute_not_exists(#id)",
      false
    );

    return sendResponse(200, "Group created successfully", groupItem);
  } catch (error) {
    console.error("Error creating group:", error);
    return sendResponse(500, "Error creating group", error.message || error);
  }
};
