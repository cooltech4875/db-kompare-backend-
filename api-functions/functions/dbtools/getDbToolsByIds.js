import { TABLE_NAME } from "../../helpers/constants.js";
import { getBatchItems, updateItemInDynamoDB } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import { fetchDbToolCategoryDetail } from "../common/fetchDbToolCategoryDetail.js";
import { fillMissingFields } from "../../services/openaiService.js";

const isFieldEmpty = (value) => {
  // Check for null, undefined, empty string, or falsy values
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  // For arrays, check if empty
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  // For objects, check if empty
  if (typeof value === "object" && Object.keys(value).length === 0) {
    return true;
  }
  return false;
};

const getMissingFields = (tool) => {
  const allExpectedFields = [
    "tool_name",
    "tool_description",
    "access_control",
    "ai_capabilities",
    "api_integration_with_upstream_downstream_systems",
    "authentication_protocol_supported",
    "core_features",
    "customization_possible",
    "deployment_options_on_prem_or_saas",
    "free_community_edition",
    "home_page_url",
    "modern_ways_of_deployment",
    "price",
    "support_for_workflow",
    "support_import_export_formats",
    "useful_links",
    "user_created_tags_comments",
    "version_control",
    "web_access",
  ];

  const fieldsToExclude = [
    "id",
    "dbkompare_view",
    "category_id",
    "category_name",
    "category_description",
    "updatedAt",
    "createdAt",
    "status" 
  ];

  const missingFields = [];

  // Check all expected fields
  allExpectedFields.forEach((field) => {
    // If field is missing from tool object OR it exists but is empty
    if (!tool.hasOwnProperty(field) || isFieldEmpty(tool[field])) {
       missingFields.push(field);
    }
  });
  
  // Also check any other existing keys in tool that might be empty but not in our expected list
  Object.keys(tool).forEach((field) => {
    if (
      !allExpectedFields.includes(field) && 
      !fieldsToExclude.includes(field) && 
      isFieldEmpty(tool[field])
    ) {
      if (!missingFields.includes(field)) {
        missingFields.push(field);
      }
    }
  });

  return missingFields;
};

export const handler = async (event) => {
  try {
    const { ids, isPopulate } = JSON.parse(event.body);

    if (!ids || !Array.isArray(ids)) {
      return sendResponse(400, "An array of DB Tool IDs is required", null);
    }

    const Keys = ids.map((id) => ({ id }));
    const data = await getBatchItems(TABLE_NAME.DB_TOOLS, Keys);
    const db_tools = data.Responses[TABLE_NAME.DB_TOOLS];

    if (!db_tools || db_tools.length === 0) {
      return sendResponse(404, "No db tool found for the provided IDs", null);
    }

    const transformData = await Promise.all(
      db_tools.map(async (item, index) => {
        const categoryDetails = await fetchDbToolCategoryDetail(
          item?.category_id
        );
        const tool = {
          ...item,
          category_name: categoryDetails?.name || "",
          category_description: categoryDetails?.description || "",
        };

        // If isPopulate is true, fetch missing fields from OpenAI
        if (isPopulate) {
          const missingFields = getMissingFields(tool);
          
          if (missingFields.length > 0) {
            const openAIData = await fillMissingFields(tool, missingFields);
            
            // If we got data from OpenAI, update the database
            if (Object.keys(openAIData).length > 0) {
              try {
                const updateExpressionParts = [];
                const expressionAttributeNames = {};
                const expressionAttributeValues = {};

                Object.entries(openAIData).forEach(([key, value], idx) => {
                  const attrName = `#attr${idx}`;
                  const attrValue = `:val${idx}`;
                  updateExpressionParts.push(`${attrName} = ${attrValue}`);
                  expressionAttributeNames[attrName] = key;
                  expressionAttributeValues[attrValue] = value;
                });

                // Also update updatedAt
                updateExpressionParts.push("#updatedAt = :updatedAt");
                expressionAttributeNames["#updatedAt"] = "updatedAt";
                expressionAttributeValues[":updatedAt"] = Date.now();

                await updateItemInDynamoDB({
                  table: TABLE_NAME.DB_TOOLS,
                  Key: { id: item.id },
                  UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
                  ExpressionAttributeNames: expressionAttributeNames,
                  ExpressionAttributeValues: expressionAttributeValues,
                });
                
                console.log(`[getDbToolsByIds] Updated tool ${item.id} (${item.tool_name}) with OpenAI data`);
                console.log(`[getDbToolsByIds] Updated fields: ${Object.keys(openAIData).join(", ")}`);
              } catch (updateError) {
                console.error(`[getDbToolsByIds] Error updating tool ${item.id} (${item.tool_name}):`, updateError);        
              }
            }

            const mergedTool = { ...tool, ...openAIData };
            return mergedTool;
          } else {
            return tool;
          }
        }

        // Otherwise, return previous code (without OpenAI)
        return tool;
      })
    );
    
    return sendResponse(200, "db tools details", transformData);
  } catch (error) {
    console.error("[getDbToolsByIds] Error fetching db tools details:", error);
    return sendResponse(500, "Failed to fetch db tools details", error.message);
  }
};
