import { TABLE_NAME } from "../../helpers/constants.js";
import {
  fetchAllItemByDynamodbIndex,
  getItem,
} from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";

export const handler = async (event) => {
  // Extract the start and end dates from the event (or use default values)
  let startDate = "";
  let endDate = "";

  // Log the incoming event for debugging purposes
  console.log("Received event:", JSON.stringify(event, null, 2));
  // Parse the request body
  if (event.body) {
    const parsedBody = JSON.parse(event.body);
    startDate = parsedBody.startDate;
    endDate = parsedBody.endDate;
  } else if (event.queryStringParameters) {
    startDate = event.queryStringParameters.startDate;
    endDate = event.queryStringParameters.endDate;
  }

  // Validate date range if provided
  if (!startDate || !endDate) {
    return sendResponse(
      400,
      "Both startDate and endDate must be provided for date range filtering."
    );
  }

  // If dates are provided, ensure they are in the correct format (YYYY-MM-DD)
  if (startDate && endDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return sendResponse(
        400,
        "startDate and endDate must be in YYYY-MM-DD format."
      );
    }

    if (startDate > endDate) {
      return sendResponse(400, "startDate cannot be later than endDate.");
    }
  }

  const queryParams = {
    TableName: TABLE_NAME.DATABASE_RANKINGS, // Use environment variable for table name
    IndexName: "byStatusAndDate", // GSI index name
    KeyConditionExpression: "#includeMe = :includeMeVal",
    ExpressionAttributeNames: {
      "#includeMe": "includeMe",
    },
    ExpressionAttributeValues: {
      ":includeMeVal": "YES",
    },
  };

  // If date range is provided, add it to the KeyConditionExpression
  if (startDate && endDate) {
    queryParams.KeyConditionExpression +=
      " AND #date BETWEEN :startDate AND :endDate";
    queryParams.ExpressionAttributeNames["#date"] = "date";
    queryParams.ExpressionAttributeValues[":startDate"] = startDate;
    queryParams.ExpressionAttributeValues[":endDate"] = endDate;
  }

  try {
    // Call the helper function to fetch all items based on the query parameters
    const allItems = await fetchAllItemByDynamodbIndex(queryParams);

    // If no items were returned
    if (allItems.length === 0) {
      return sendResponse(
        400,
        "No rankings found for the specified date range"
      );
    }

    // transforming data
    const transformedData = await calculateScoreAndRankChanges(
      allItems,
      startDate,
      endDate
    );

    // Return the items fetched from DynamoDB
    return sendResponse(200, "Ranks fetches Successfully", transformedData);
  } catch (error) {
    // Handle any errors
    console.error("Error fetching items:", error);
    return sendResponse(
      500,
      "Failed to fetch items from DynamoDB",
      error.message
    );
  }
};

// Get database name
const getDatabaseDetailsById = async (databaseId) => {
  // Validate databaseId before making the query
  if (!databaseId || typeof databaseId !== "string") {
    console.warn(`Invalid databaseId provided to getDatabaseDetailsById: ${databaseId}`);
    return null;
  }

  const key = {
    id: databaseId,
  };
  try {
    const result = await getItem(TABLE_NAME.DATABASES, key);
    if (result.Item) {
      return result.Item;
    }
    // Item not found (might be deleted) - return null
    console.warn(`Database not found (possibly deleted) for ID: ${databaseId}`);
    return null;
  } catch (error) {
    console.error(`Error fetching database for ID ${databaseId}:`, error);
    // Return null instead of throwing to prevent breaking the entire process
    return null;
  }
};

const calculateScoreAndRankChanges = async (
  rankingsData,
  startDate,
  endDate
) => {
  try {
    // Parse the start and end dates
    const [start, end] = [new Date(startDate), new Date(endDate)];

    // Step 1: Organize rankings data by database ID and filter by date range
    const databaseMap = getDatabaseMap(rankingsData, start, end);

    // Step 2: Process each database's data
    const result = await Promise.all(
      Object.keys(databaseMap).map(async (databaseId) => {
        try {
          const dbData = databaseMap[databaseId];

          // Step 2.1: Sort data by date and get most recent data for the endDate
          const sortedData = sortDataByDate(dbData);
          const mostRecentData = getMostRecentData(sortedData, endDate);

          if (!mostRecentData) {
            return null;
          }

          // Step 2.2: Fetch database details
          const databaseDetail = await getDatabaseDetailsById(databaseId);
          if (!databaseDetail) {
            return null;
          }

          // Step 2.3: Calculate score and rank changes
          const { scoreChanges, rankChanges } = calculateChanges(
            sortedData,
            mostRecentData
          );

          // Return the processed data for the database
          return {
            database_id: databaseId,
            name: databaseDetail.name,
            database_model: databaseDetail.primary_database_model,
            secondary_database_model: databaseDetail.secondary_database_models,
            scoreChanges,
            rankChanges,
          };
        } catch (error) {
          console.error(`Error processing databaseId ${databaseId}:`, error.message);
          return null;
        }
      })
    );

    // Filter out any null values (databases that were skipped)
    return result.filter(Boolean);
  } catch (error) {
    console.error("Error in calculateScoreAndRankChanges:", error);
    throw error; // Propagate error to the caller
  }
};

// Helper function to map and filter the rankings data by date range
const getDatabaseMap = (rankingsData, start, end) => {
  const databaseMap = {};

  rankingsData.forEach((item) => {
    const { date, rankings } = item;

    // Only process dates within the specified range
    rankings.forEach((db) => {
      if (!databaseMap[db.database_id]) {
        databaseMap[db.database_id] = [];
      }
      databaseMap[db.database_id].push({
        date,
        totalScore: db.ui_popularity.totalScore,
        rank: db.rank,
        db_name: db.db_name,
      });
    });
  });

  return databaseMap;
};

// Helper function to sort the data by date in ascending order
const sortDataByDate = (data) => {
  return data.sort((a, b) => new Date(a.date) - new Date(b.date));
};

// Helper function to get the most recent data for the specified endDate
const getMostRecentData = (data, endDate) => {
  // Convert the endDate to a Date object
  const end = new Date(endDate);

  // Sort data by date in descending order (newest first)
  const sortedData = data.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Find the first entry where the date is on or before the endDate
  return sortedData.find((item) => new Date(item.date) <= end);
};

// Helper function to calculate score and rank changes
const calculateChanges = (data, mostRecentData) => {
  const scoreChanges = [];
  const rankChanges = [];

  // Push the most recent score and rank to the respective arrays
  scoreChanges.push({
    date: mostRecentData.date,
    totalScore: mostRecentData.totalScore,
  });
  rankChanges.push({
    date: mostRecentData.date,
    rank: mostRecentData.rank,
  });

  // Calculate the score differences and rank changes for each day (excluding the most recent date)
  data.forEach((item) => {
    if (item.date !== mostRecentData.date) {
      const scoreDifference = mostRecentData.totalScore - item.totalScore;
      scoreChanges.push({
        date: item.date,
        totalScore: scoreDifference,
      });

      const rankChange = item.rank - mostRecentData.rank;
      const rankStatus =
        rankChange > 0 ? "INCREASED" : rankChange < 0 ? "DECREASED" : "SAME";
      rankChanges.push({
        date: item.date,
        status: rankStatus,
        rank: item.rank,
      });
    }
  });

  return { scoreChanges, rankChanges };
};
