// Add DB Tool Handler
// This endpoint creates a new DB Tool

import { createItemInDynamoDB } from "../../helpers/helpers.js";
import { v4 as uuidv4 } from "uuid";
import { DB_TOOL_STATUS, TABLE_NAME } from "../../helpers/constants.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  try {
    // Parse the input JSON from the request body
    const body = JSON.parse(event.body || "{}");
    const {
      category_id,
      tool_name,
      tool_description,
      home_page_url,
      access_control,
      version_control,
      support_for_workflow,
      web_access,
      deployment_options_on_prem_or_saas,
      free_community_edition,
      authentication_protocol_supported,
      api_integration_with_upstream_downstream_systems,
      user_created_tags_comments,
      customization_possible,
      modern_ways_of_deployment,
      support_import_export_formats,
      useful_links,
      price,
      dbkompare_view,
      ai_capabilities,
      core_features,
      status,
    } = body;

    // Validate required fields
    if (!tool_name) {
      return sendResponse(400, "Missing required field: tool_name is required", null);
    }

    // Generate unique ID and timestamps
    const id = uuidv4();
    const createdAt = getTimestamp();
    const updatedAt = createdAt;

    // Prepare DB tool item
    const dbToolItem = {
      id,
      category_id: category_id || null,
      tool_name: tool_name.trim(),
      tool_description: tool_description?.trim() || "",
      home_page_url: home_page_url || "",
      access_control: access_control || "",
      version_control: version_control || "",
      support_for_workflow: support_for_workflow || "",
      web_access: web_access || "",
      deployment_options_on_prem_or_saas: deployment_options_on_prem_or_saas || "",
      free_community_edition: free_community_edition || "",
      authentication_protocol_supported: authentication_protocol_supported || "",
      api_integration_with_upstream_downstream_systems:
        api_integration_with_upstream_downstream_systems || "",
      user_created_tags_comments: user_created_tags_comments || "",
      customization_possible: customization_possible || "",
      modern_ways_of_deployment: modern_ways_of_deployment || "",
      support_import_export_formats: support_import_export_formats || "",
      useful_links: useful_links || "",
      price: price || "",
      dbkompare_view: dbkompare_view || "",
      ai_capabilities: ai_capabilities || "",
      core_features: Array.isArray(core_features) ? core_features : [],
      createdAt: createdAt,
      updatedAt: updatedAt,
      status: status || DB_TOOL_STATUS.ACTIVE,
    };

    // Create the DB tool in DynamoDB
    await createItemInDynamoDB(
      dbToolItem,
      TABLE_NAME.DB_TOOLS,
      { "#id": "id" },
      "attribute_not_exists(#id)"
    );

    return sendResponse(200, "DB Tool added successfully", dbToolItem);
  } catch (error) {
    console.error("Error adding DB Tool:", error);
    return sendResponse(500, "Internal Server Error", error.message);
  }
};

