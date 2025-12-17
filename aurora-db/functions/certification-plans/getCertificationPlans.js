import { TABLE_NAME, CERTIFICATION_PLAN_STATUS } from "../../helpers/constants.js";
import { fetchAllItemsByScan } from "../../helpers/dynamodb.js";
import { sendResponse, getTableName } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const status = params.status;

    if (status && status !== CERTIFICATION_PLAN_STATUS.ACTIVE && status !== CERTIFICATION_PLAN_STATUS.INACTIVE) {
      return sendResponse(400, `Invalid status. Must be "${CERTIFICATION_PLAN_STATUS.ACTIVE}" or "${CERTIFICATION_PLAN_STATUS.INACTIVE}"`, null);
    }

    const tableName = getTableName(TABLE_NAME.CERTIFICATION_PLANS);
    const scanParams = { TableName: tableName };

    if (status) {
      scanParams.FilterExpression = "#status = :status";
      scanParams.ExpressionAttributeNames = { "#status": "status" };
      scanParams.ExpressionAttributeValues = { ":status": status };
    }

    const plans = await fetchAllItemsByScan(scanParams);
    const sortedPlans = plans.sort((a, b) => (a.price || 0) - (b.price || 0));

    return sendResponse(200, "Certification plans fetched successfully", sortedPlans);
  } catch (error) {
    console.error("Error fetching certification plans:", error);
    return sendResponse(500, "Error fetching certification plans", error.message || null);
  }
};

