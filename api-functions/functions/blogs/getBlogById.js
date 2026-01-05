import { fetchAllItemByDynamodbIndex, getItem } from "../../helpers/dynamodb.js";
import { TABLE_NAME } from "../../helpers/constants.js";
import { sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    const { id } = event.pathParameters || {};
    const { userId } = event.queryStringParameters || {};

    if (!id) {
      return sendResponse(400, "Missing blog ID", false);
    }

    // 1) First try to fetch by primary key (id) - backward compatible
    let blogItem = await getItem(TABLE_NAME.BLOGS, { id });

    // 2) If not found by id, treat the same path param as blog title and query the byTitle index
    if (!blogItem || !blogItem.Item) {
      const matches = await fetchAllItemByDynamodbIndex({
        TableName: TABLE_NAME.BLOGS,
        IndexName: "byTitle",
        KeyConditionExpression: "#title = :title",
        ExpressionAttributeNames: { "#title": "title" },
        ExpressionAttributeValues: { ":title": id },
      });

      if (Array.isArray(matches) && matches.length) {
        blogItem = { Item: matches[0] };
      }
    }

    if (!blogItem || !blogItem.Item) {
      return sendResponse(404, "Blog not found", false);
    }

    const blogDetails = { ...blogItem.Item };
    const resolvedBlogId = blogDetails?.id;
    console.log("🚀 ~ resolvedBlogId:", resolvedBlogId);

    // Fetch user details for createdBy
    if (blogDetails.createdBy) {
      blogDetails.createdBy = await getUserById(blogDetails.createdBy);
    }

    // Check if the blog is saved in the user's SavedBlogs
    if (userId) {
      const isSaved = await checkIfBlogIsSaved(userId, resolvedBlogId);
      blogDetails.isSaved = isSaved;
    } else {
      blogDetails.isSaved = false; // Default to false if userId is not provided
    }

    return sendResponse(200, "Blog retrieved successfully", blogDetails);
  } catch (error) {
    console.error("Error retrieving blog:", error);
    return sendResponse(500, "Error retrieving blog:", {
      error: error.message,
    });
  }
};

// Get user details by ID
const getUserById = async (userId) => {
  const key = {
    id: userId,
  };
  try {
    const result = await getItem(TABLE_NAME.USERS, key);
    if (result.Item) {
      return result.Item;
    }

    console.log("🚀 ~ result.Item:", result.Item);

    return "ANONYMOUS"; // Fallback if the database name is not found
  } catch (error) {
    console.error(`Error fetching database name for ID ${userId}:`, error);
    throw error;
  }
};

// Check if a blog is saved by the user
const checkIfBlogIsSaved = async (userId, blogId) => {
  try {
    const key = {
      userId,
      blogId,
    };
    const savedBlogItem = await getItem(TABLE_NAME.SAVED_BLOGS, key);

    return !!(savedBlogItem && savedBlogItem.Item); // Returns true if the item exists
  } catch (error) {
    console.error(
      `Error checking if blog ${blogId} is saved by user ${userId}:`,
      error
    );
    return false; // Default to false on error
  }
};
