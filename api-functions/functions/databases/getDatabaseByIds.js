import { TABLE_NAME } from "../../helpers/constants.js";
import { getBatchItems } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import { populateDatabaseFields } from "../../services/openaiService.js";

const getFieldsToPopulate = () => {
  const allExpectedFields = [
    "ai_compatibility",
    "apis_and_other_access_methods",
    "cloud_based_only",
    "concurrency",
    "consistency_concepts",
    "current_release",
    "data_scheme",
    "dbaas_offerings",
    "description",
    "developer",
    "durability",
    "foreign_keys",
    "implementation_language",
    "initial_release",
    "in_memory_capabilities",
    "license",
    "mapreduce",
    "partitioning_methods",
    "pricing",
    "db_kompare_view",
    "replication_methods",
    "secondary_indexes",
    "server_operating_systems",
    "server_side_scripts",
    "sql",
    "stack_overflow_tag",
    "supported_programming_languages",
    "technical_documentation",
    "transaction_concepts",
    "triggers",
    "typing",
    "user_concepts",
    "website",
    "xml_support"
  ];

  const fieldsToExclude = [
    "id",
    "db_compare_ranking",
    "primary_database_model",
    "secondary_database_models",
    "name",
    "updatedAt",
    "createdAt",
    "status"
  ];

  // Send all defined fields (except excluded ones) to OpenAI
  return allExpectedFields.filter((field) => !fieldsToExclude.includes(field));
};

export const handler = async (event) => {
  try {
    const { ids, isPopulate } = JSON.parse(event.body);

    // Validate IDs
    if (!ids || !Array.isArray(ids)) {
      return sendResponse(400, "An array of database IDs is required", null);
    }

    // Create Keys for batchGet
    const Keys = ids.map((id) => ({ id }));
    const data = await getBatchItems(TABLE_NAME.DATABASES, Keys);

    const databases = data.Responses[TABLE_NAME.DATABASES];

    // Check if any databases are found
    if (!databases || databases.length === 0) {
      return sendResponse(404, "No databases found for the provided IDs", null);
    }

    // If populate is false, return immediately
    if (!isPopulate) {
      return sendResponse(200, "Databases details", databases);
    }

    const transformData = await Promise.all(
      databases.map(async (item) => {
        const fieldsToPopulate = getFieldsToPopulate();
        
        if (fieldsToPopulate.length > 0) {
          const openAIData = await populateDatabaseFields(item, fieldsToPopulate);
          const mergedDatabase = { ...item, ...openAIData };
          return mergedDatabase;
        } else {
          return item;
        }
      })
    );

    // Return success response with database details
    return sendResponse(200, "Databases details", transformData);
  } catch (error) {
    console.error("Error fetching databases details:", error);
    return sendResponse(
      500,
      "Failed to fetch databases details",
      error.message
    );
  }
};
