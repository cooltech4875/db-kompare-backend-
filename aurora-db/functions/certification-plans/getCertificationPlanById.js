import { TABLE_NAME } from "../../helpers/constants.js";
import { getItem } from "../../helpers/dynamodb.js";
import { sendResponse, getTableName } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    // Extract plan ID from path parameters
    const { id } = event.pathParameters || {};
    if (!id) {
      return sendResponse(400, "Missing Certification Plan ID", null);
    }

    const tableName = getTableName(TABLE_NAME.CERTIFICATION_PLANS);

    // Fetch the certification plan by ID
    const planResult = await getItem(tableName, { id });
    const plan = planResult?.Item;

    if (!plan) {
      return sendResponse(404, "Certification plan not found", null);
    }

    return sendResponse(200, "Certification plan fetched successfully", plan);
  } catch (error) {
    console.error("Error fetching certification plan:", error);
    return sendResponse(500, "Error fetching certification plan", error.message || null);
  }
};

