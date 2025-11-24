// Update DB Tool Handler
// This endpoint updates a DB Tool by ID

import { sendResponse, updateItemInDynamoDB, getItem, getTimestamp } from "../../helpers/helpers.js";
import { TABLE_NAME, DB_TOOL_STATUS } from "../../helpers/constants.js";

export const handler = async (event) => {
  try {
    // Extract tool ID from path parameters
    const { id } = event.pathParameters || {};
    if (!id) {
      return sendResponse(400, "Missing tool ID", null);
    }

    // Parse request body
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

    // Verify tool exists
    const existing = await getItem(TABLE_NAME.DB_TOOLS, { id });
    if (!existing || !existing.Item) {
      return sendResponse(404, "DB Tool not found", null);
    }

    // Build update expression dynamically
    const updateFields = [];
    const attributeValues = {};
    const attributeNames = {};

    if (category_id !== undefined) {
      updateFields.push("#category_id = :category_id");
      attributeValues[":category_id"] = category_id;
      attributeNames["#category_id"] = "category_id";
    }

    if (tool_name !== undefined) {
      updateFields.push("#tool_name = :tool_name");
      attributeValues[":tool_name"] = tool_name.trim();
      attributeNames["#tool_name"] = "tool_name";
    }

    if (tool_description !== undefined) {
      updateFields.push("#tool_description = :tool_description");
      attributeValues[":tool_description"] = tool_description?.trim() || "";
      attributeNames["#tool_description"] = "tool_description";
    }

    if (home_page_url !== undefined) {
      updateFields.push("#home_page_url = :home_page_url");
      attributeValues[":home_page_url"] = home_page_url || "";
      attributeNames["#home_page_url"] = "home_page_url";
    }

    if (access_control !== undefined) {
      updateFields.push("#access_control = :access_control");
      attributeValues[":access_control"] = access_control || "";
      attributeNames["#access_control"] = "access_control";
    }

    if (version_control !== undefined) {
      updateFields.push("#version_control = :version_control");
      attributeValues[":version_control"] = version_control || "";
      attributeNames["#version_control"] = "version_control";
    }

    if (support_for_workflow !== undefined) {
      updateFields.push("#support_for_workflow = :support_for_workflow");
      attributeValues[":support_for_workflow"] = support_for_workflow || "";
      attributeNames["#support_for_workflow"] = "support_for_workflow";
    }

    if (web_access !== undefined) {
      updateFields.push("#web_access = :web_access");
      attributeValues[":web_access"] = web_access || "";
      attributeNames["#web_access"] = "web_access";
    }

    if (deployment_options_on_prem_or_saas !== undefined) {
      updateFields.push("#deployment_options_on_prem_or_saas = :deployment_options_on_prem_or_saas");
      attributeValues[":deployment_options_on_prem_or_saas"] =
        deployment_options_on_prem_or_saas || "";
      attributeNames["#deployment_options_on_prem_or_saas"] =
        "deployment_options_on_prem_or_saas";
    }

    if (free_community_edition !== undefined) {
      updateFields.push("#free_community_edition = :free_community_edition");
      attributeValues[":free_community_edition"] = free_community_edition || "";
      attributeNames["#free_community_edition"] = "free_community_edition";
    }

    if (authentication_protocol_supported !== undefined) {
      updateFields.push(
        "#authentication_protocol_supported = :authentication_protocol_supported"
      );
      attributeValues[":authentication_protocol_supported"] =
        authentication_protocol_supported || "";
      attributeNames["#authentication_protocol_supported"] =
        "authentication_protocol_supported";
    }

    if (api_integration_with_upstream_downstream_systems !== undefined) {
      updateFields.push(
        "#api_integration_with_upstream_downstream_systems = :api_integration_with_upstream_downstream_systems"
      );
      attributeValues[":api_integration_with_upstream_downstream_systems"] =
        api_integration_with_upstream_downstream_systems || "";
      attributeNames["#api_integration_with_upstream_downstream_systems"] =
        "api_integration_with_upstream_downstream_systems";
    }

    if (user_created_tags_comments !== undefined) {
      updateFields.push("#user_created_tags_comments = :user_created_tags_comments");
      attributeValues[":user_created_tags_comments"] = user_created_tags_comments || "";
      attributeNames["#user_created_tags_comments"] = "user_created_tags_comments";
    }

    if (customization_possible !== undefined) {
      updateFields.push("#customization_possible = :customization_possible");
      attributeValues[":customization_possible"] = customization_possible || "";
      attributeNames["#customization_possible"] = "customization_possible";
    }

    if (modern_ways_of_deployment !== undefined) {
      updateFields.push("#modern_ways_of_deployment = :modern_ways_of_deployment");
      attributeValues[":modern_ways_of_deployment"] = modern_ways_of_deployment || "";
      attributeNames["#modern_ways_of_deployment"] = "modern_ways_of_deployment";
    }

    if (support_import_export_formats !== undefined) {
      updateFields.push(
        "#support_import_export_formats = :support_import_export_formats"
      );
      attributeValues[":support_import_export_formats"] = support_import_export_formats || "";
      attributeNames["#support_import_export_formats"] = "support_import_export_formats";
    }

    if (useful_links !== undefined) {
      updateFields.push("#useful_links = :useful_links");
      attributeValues[":useful_links"] = useful_links || "";
      attributeNames["#useful_links"] = "useful_links";
    }

    if (price !== undefined) {
      updateFields.push("#price = :price");
      attributeValues[":price"] = price || "";
      attributeNames["#price"] = "price";
    }

    if (dbkompare_view !== undefined) {
      updateFields.push("#dbkompare_view = :dbkompare_view");
      attributeValues[":dbkompare_view"] = dbkompare_view || "";
      attributeNames["#dbkompare_view"] = "dbkompare_view";
    }

    if (ai_capabilities !== undefined) {
      updateFields.push("#ai_capabilities = :ai_capabilities");
      attributeValues[":ai_capabilities"] = ai_capabilities || "";
      attributeNames["#ai_capabilities"] = "ai_capabilities";
    }

    if (core_features !== undefined) {
      updateFields.push("#core_features = :core_features");
      attributeValues[":core_features"] = Array.isArray(core_features) ? core_features : [];
      attributeNames["#core_features"] = "core_features";
    }

    if (status !== undefined) {
      if (!Object.values(DB_TOOL_STATUS).includes(status)) {
        return sendResponse(400, "Invalid status value", null);
      }
      updateFields.push("#status = :status");
      attributeValues[":status"] = status;
      attributeNames["#status"] = "status";
    }

    // Validate that at least one field is provided for update
    if (updateFields.length === 0) {
      return sendResponse(400, "At least one field is required for update", null);
    }

    // Always update updatedAt timestamp
    updateFields.push("#updatedAt = :updatedAt");
    attributeValues[":updatedAt"] = getTimestamp();
    attributeNames["#updatedAt"] = "updatedAt";

    // Perform the update
    const updated = await updateItemInDynamoDB({
      table: TABLE_NAME.DB_TOOLS,
      Key: { id },
      UpdateExpression: `SET ${updateFields.join(", ")}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
      ReturnValues: "ALL_NEW",
    });

    // Return updated item
    return sendResponse(200, "DB Tool updated successfully", updated.Attributes);
  } catch (error) {
    console.error("Error updating DB Tool:", error);
    return sendResponse(500, "Internal server error", error.message);
  }
};

