import {
  getYesterdayDate,
  sendResponse,
  calculateGitHubPopularity,
} from "../../helpers/helpers.js";
import { TABLE_NAME, DATABASE_STATUS } from "../../helpers/constants.js";
import {
  getItemByQuery,
  fetchAllItemByDynamodbIndex,
  batchWriteItems,
} from "../../helpers/dynamodb.js";
import { v4 as uuidv4 } from "uuid";

export const handler = async (event) => {
  try {
    console.log("Fetching all active databases...");

    // Fetch all active databases
    const all_databases = await fetchAllDatabases();

    // Filter out objects that explicitly contain "ui_display": "NO"
    const databases = all_databases.filter((db) => db.ui_display !== "NO");

    if (!databases || databases.length === 0) {
      console.log("No active databases found.");
      return sendResponse(404, "No active databases found.", null);
    }

    // Fetch metrics data for the previous day (yesterday)
    const yesterday = getYesterdayDate; // Ensure this returns the correct date string (e.g., '2024-11-23')

    // Process each database in parallel using Promise.all
    const databasesWithRankings = await Promise.all(
      databases.map(async (db) => {
        const { id: databaseId, name } = db;

        // Check if metrics exist for this database and date
        const metricsData = await getItemByQuery({
          table: TABLE_NAME.METRICES,
          KeyConditionExpression:
            "#database_id = :database_id and #date = :date",
          ExpressionAttributeNames: {
            "#database_id": "database_id",
            "#date": "date",
          },
          ExpressionAttributeValues: {
            ":database_id": databaseId,
            ":date": yesterday,
          },
        });

        if (!metricsData || metricsData.Items.length === 0) {
          console.log(`No metrics found for database_id: ${databaseId}`);
          return null;
        }

        const metric = metricsData.Items[0];

        // Extract ui_popularity.totalScore
        const uiPopularity = metric?.ui_popularity;

        // Skip if ui_popularity is missing or doesn't have totalScore
        if (!uiPopularity || !uiPopularity.totalScore) {
          console.log(`No ui_popularity or totalScore found for database_id: ${databaseId}, name: ${name}`);
          return null;
        }

        // Return the object containing database details and its popularity score
        return {
          databaseId,
          name,
          uiPopularity,
        };
      })
    );

    // Filter out any null results (i.e., databases with no metrics or no ui_popularity)
    const validDatabases = databasesWithRankings.filter(
      (db) => db && db.uiPopularity && db.uiPopularity.totalScore !== undefined
    );

    if (validDatabases.length === 0) {
      console.log("No valid databases with ui_popularity found for ranking.");
      return sendResponse(404, "No valid databases found for ranking.", null);
    }

    // Sort the databases by ui_popularity.totalScore in descending order
    const sortedDatabases = validDatabases.sort(
      (a, b) => (b.uiPopularity?.totalScore || 0) - (a.uiPopularity?.totalScore || 0)
    );

    // Create the rankings array for the day
    const rankings = sortedDatabases.map((db, index) => ({
      database_id: db.databaseId,
      db_name: db.name,
      rank: index + 1, // Rank starts from 1
      ui_popularity: db.uiPopularity,
    }));

    // Prepare the item to be written to DynamoDB
    const item = {
      id: uuidv4(),
      date: yesterday,
      includeMe: "YES", // You can change this as needed
      rankings: rankings,
    };
    // Save the rankings in the DatabaseRankings table
    await batchWriteItems(TABLE_NAME.DATABASE_RANKINGS, [item]);
    console.log(`Successfully updated daily rankings for ${yesterday}`);

    // Finally, sending the response
    return sendResponse(200, "Rankings updated successfully", true);
  } catch (error) {
    console.error("Error updating rankings:", error);
    return sendResponse(500, "Failed to update rankings", error.message);
  }
};

// Fetch all active and inactive databases
const fetchAllDatabases = async () => {
  const [activeDatabases, inactiveDatabases] = await Promise.all([
    fetchDatabasesByStatus(DATABASE_STATUS.ACTIVE),
    fetchDatabasesByStatus(DATABASE_STATUS.INACTIVE),
  ]);

  return [...(activeDatabases || []), ...(inactiveDatabases || [])].sort(
    (a, b) =>
      a.status === DATABASE_STATUS.ACTIVE &&
      b.status === DATABASE_STATUS.INACTIVE
        ? -1
        : 1
  );
};

// Fetch databases based on their status
const fetchDatabasesByStatus = async (status) => {
  return fetchAllItemByDynamodbIndex({
    TableName: TABLE_NAME.DATABASES,
    IndexName: "byStatus",
    KeyConditionExpression: "#status = :statusVal",
    ExpressionAttributeValues: { ":statusVal": status },
    ExpressionAttributeNames: { "#status": "status" },
  });
};
