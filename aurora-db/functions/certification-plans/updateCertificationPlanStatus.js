import { TABLE_NAME, CERTIFICATION_PLAN_STATUS } from "../../helpers/constants.js";
import { getItem, updateItemInDynamoDB } from "../../helpers/dynamodb.js";
import { getTimestamp, sendResponse, getTableName } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { planId, status } = body;

    // Validate required fields
    if (!planId) {
      return sendResponse(400, "planId is required", null);
    }

    if (!status) {
      return sendResponse(400, "status is required", null);
    }

    // Validate status value
    if (
      status !== CERTIFICATION_PLAN_STATUS.ACTIVE &&
      status !== CERTIFICATION_PLAN_STATUS.INACTIVE
    ) {
      return sendResponse(
        400,
        `Invalid status. Must be either "${CERTIFICATION_PLAN_STATUS.ACTIVE}" or "${CERTIFICATION_PLAN_STATUS.INACTIVE}"`,
        null
      );
    }

    const tableName = getTableName(TABLE_NAME.CERTIFICATION_PLANS);

    // Check if plan exists
    const planRes = await getItem(tableName, { id: planId });
    if (!planRes?.Item) {
      return sendResponse(404, "Certification plan not found", null);
    }

    // Update the status
    const result = await updateItemInDynamoDB({
      table: tableName,
      Key: { id: planId },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": status.toUpperCase(),
        ":updatedAt": getTimestamp(),
      },
      ConditionExpression: "attribute_exists(id)",
    });

    return sendResponse(200, "Certification plan status updated successfully", {
      id: planId,
      status: result.Attributes?.status || status.toUpperCase(),
      updatedAt: result.Attributes?.updatedAt,
    });
  } catch (error) {
    console.error("Error updating certification plan status:", error);
    return sendResponse(
      500,
      "Error updating certification plan status",
      error.message || null
    );
  }
};

