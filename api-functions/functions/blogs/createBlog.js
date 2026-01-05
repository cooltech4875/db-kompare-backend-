import {
  createItemInDynamoDB,
  fetchAllItemByDynamodbIndex,
  getNextBlogId,
} from "../../helpers/dynamodb.js";
import { TABLE_NAME } from "../../helpers/constants.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    const { createdBy, title, description, databases, status, id } = JSON.parse(
      event.body || "{}"
    );
    if (
      !id ||
      !createdBy ||
      !title ||
      !description ||
      !Array.isArray(databases) ||
      !status
    ) {
      return sendResponse(400, "Missing or invalid fields", false);
    }

    const trimmedTitle = String(title).trim();
    if (!trimmedTitle) {
      return sendResponse(400, "Missing or invalid fields", false);
    }

    // Validate uniqueness of blog title (exact match) via byTitle index
    const existingBlogs = await fetchAllItemByDynamodbIndex({
      TableName: TABLE_NAME.BLOGS,
      IndexName: "byTitle",
      KeyConditionExpression: "#title = :title",
      ExpressionAttributeNames: { "#title": "title" },
      ExpressionAttributeValues: { ":title": trimmedTitle },
    });

    if (Array.isArray(existingBlogs) && existingBlogs.length) {
      return sendResponse(400, "Blog title must be unique", false);
    }

    // Generate the next blog ID automatically
    const blogId = await getNextBlogId(TABLE_NAME.BLOG_COUNTER);

    const blogItem = {
      id,
      blogId: blogId,
      createdBy,
      createdAt: getTimestamp(),
      title: trimmedTitle,
      description,
      databases,
      status,
      isPublished: "YES",
    };

    await createItemInDynamoDB(
      blogItem,
      TABLE_NAME.BLOGS,
      { "#id": "id" },
      "attribute_not_exists(#id)",
      false
    );

    return sendResponse(200, "Blog Created Successfully", blogItem);
  } catch (error) {
    return sendResponse(500, "Error creating blog", error.message);
  }
};
