import { TABLE_NAME } from "../../helpers/constants.js";
import { getBatchItems } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import { fetchDbToolCategoryDetail } from "../common/fetchDbToolCategoryDetail.js";
import { populateDbToolFields } from "../../services/openaiService.js";

const getFieldsToPopulate = () => {
  const allExpectedFields = [
    "tool_name",
    "tool_description",
    "dbkompare_view",
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
    "category_id",
    "category_name",
    "category_description",
    "updatedAt",
    "createdAt",
    "status",
  ];

  // Send all defined fields (except excluded ones) to OpenAI
  return allExpectedFields.filter((field) => !fieldsToExclude.includes(field));
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

        // If isPopulate is true, fetch fields from OpenAI
        if (isPopulate) {
          const fieldsToPopulate = getFieldsToPopulate();

          if (fieldsToPopulate.length > 0) {
            const openAIData = await populateDbToolFields(
              tool,
              fieldsToPopulate
            );
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
