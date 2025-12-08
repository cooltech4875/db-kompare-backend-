import { TABLE_NAME } from "../../helpers/constants.js";
import {
  getItem,
  fetchAllItemByDynamodbIndex,
} from "../../helpers/dynamodb.js";
import {
  getUTCTwoDaysAgoDate,
  getUTCYesterdayDate,
  sendResponse,
} from "../../helpers/helpers.js";
import moment from "moment";

export const handler = async (event) => {
  try {
    let startDate = "";
    let endDate = "";
    let aggregationType = "daily"; // default

    // Parse parameters from body or query string.
    if (event.body) {
      const parsedBody = JSON.parse(event.body);
      startDate = parsedBody.startDate;
      endDate = parsedBody.endDate;

      if (parsedBody.aggregationType) {
        aggregationType = parsedBody.aggregationType;
      }
    }

    // Validate date range if provided.
    if ((startDate && !endDate) || (!startDate && endDate)) {
      return sendResponse(
        400,
        "Both startDate and endDate must be provided for date range filtering."
      );
    }
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

    let items = [];
    if (aggregationType === "daily") {
      // --- DAILY PATH: Query raw daily data from Metrices table ---
      let queryParams = {
        TableName: TABLE_NAME.METRICES,
        IndexName: "byStatusAndDate",
        KeyConditionExpression: "#includeMe = :includeMeVal",
        ExpressionAttributeNames: {
          "#includeMe": "includeMe",
        },
        ExpressionAttributeValues: {
          ":includeMeVal": "YES",
        },
      };

      if (startDate && endDate) {
        queryParams.KeyConditionExpression +=
          " AND #date BETWEEN :startDate AND :endDate";
        queryParams.ExpressionAttributeNames["#date"] = "date";
        queryParams.ExpressionAttributeValues[":startDate"] = startDate;
        queryParams.ExpressionAttributeValues[":endDate"] = endDate;
      }

      items = await fetchAllItemByDynamodbIndex(queryParams);
      items = await transformDailyData(items);
      // Apply ranking logic for daily data (if needed)
      items = await applyRankingLogic(items);
    } else if (
      aggregationType === "weekly" ||
      aggregationType === "monthly" ||
      aggregationType === "yearly"
    ) {
      // --- AGGREGATED PATH: Query Aggregated table via the GSI "byAggregationType" ---
      // Build a prefix based on the aggregation type and the startDate.
      let prefix = "";
      const year = moment().format("YYYY");
      if (aggregationType === "weekly") {
        // const year = moment(startDate, "YYYY-MM-DD").format("YYYY");
        prefix = `weekly#${year}`;
      } else if (aggregationType === "monthly") {
        // const yearMonth = moment(startDate, "YYYY-MM-DD").format("YYYY-MM");
        prefix = `monthly#${year}`;
      } else if (aggregationType === "yearly") {
        // const year = moment(startDate, "YYYY-MM-DD").format("YYYY");
        prefix = "yearly#";
      }

      // Query the Aggregated table using the GSI "byAggregationType"
      const queryParams = {
        TableName: TABLE_NAME.DATABASE_AGGREGATED,
        IndexName: "byAggregationType", // GSI with partition key: aggregation_type, sort key: period_key
        KeyConditionExpression:
          "aggregation_type = :agg AND begins_with(period_key, :prefix)",
        ExpressionAttributeValues: {
          ":agg": aggregationType,
          ":prefix": prefix,
        },
      };

      const queryResult = await fetchAllItemByDynamodbIndex(queryParams);
      let aggregatedItems = queryResult || [];
      items = await transformAggregatedData(aggregatedItems);
      // Apply ranking logic for daily data (if needed)
      items = await applyRankingLogic(items);
    } else {
      return sendResponse(
        400,
        "Invalid aggregationType provided. Valid types: daily, weekly, monthly, yearly."
      );
    }

    // Filter out objects with unknown database names
    const filteredData = items.filter(
      (db) => db?.databaseName && db.databaseName !== "Unknown"
    );

    return sendResponse(200, "Fetch metrics successfully", filteredData);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return sendResponse(500, "Failed to fetch metrics", {
      error: error.message,
    });
  }
};

/**
 * transformDailyData: Groups raw daily records by database_id,
 * and fetches database names and ui_display from the Databases table.
 */
const transformDailyData = async (items) => {
  const groupedData = items.reduce((acc, item) => {
    const { database_id: databaseId, date, popularity, ui_popularity } = item;
    if (!acc[databaseId]) {
      acc[databaseId] = {
        databaseId,
        databaseName: "Fetching...", // placeholder
        metrics: [],
      };
    }
    acc[databaseId].metrics.push({ date, ui_popularity });
    return acc;
  }, {});

  const databaseIds = Object.keys(groupedData);
  await Promise.all(
    databaseIds.map(async (databaseId) => {
      const databaseName = await getDatabaseNameById(databaseId);
      groupedData[databaseId].databaseName = databaseName?.name;
      groupedData[databaseId].ui_display = databaseName?.ui_display;
    })
  );

  return Object.values(groupedData);
};

/**
 * transformAggregatedData: Groups aggregated items by database_id,
 * and collects them into an "aggregations" array.
 */
const transformAggregatedData = async (items) => {
  const groupedData = items.reduce((acc, item) => {
    const { database_id: databaseId, period_key, metrics: db_metrics } = item;
    if (!acc[databaseId]) {
      acc[databaseId] = {
        databaseId,
        databaseName: "Fetching...", // placeholder
        metrics: [],
      };
    }
    acc[databaseId].metrics.push({
      date: period_key,
      ui_popularity: db_metrics?.ui_popularity?.average,
    });
    return acc;
  }, {});

  const databaseIds = Object.keys(groupedData);
  await Promise.all(
    databaseIds.map(async (databaseId) => {
      const databaseName = await getDatabaseNameById(databaseId);
      groupedData[databaseId].databaseName = databaseName?.name;
      groupedData[databaseId].ui_display = databaseName?.ui_display;
    })
  );

  return Object.values(groupedData);
};

/**
 * applyRankingLogic: Applies ranking to daily data using ranking info from DATABASE_RANKINGS table.
 */
const applyRankingLogic = async (dailyItems) => {
  const getRankingDataForDate = async (dateStr) => {
    const rankingQueryParams = {
      TableName: TABLE_NAME.DATABASE_RANKINGS,
      IndexName: "byStatusAndDate",
      KeyConditionExpression: "#includeMe = :includeMeVal AND #date = :date",
      ExpressionAttributeNames: {
        "#includeMe": "includeMe",
        "#date": "date",
      },
      ExpressionAttributeValues: {
        ":includeMeVal": "YES",
        ":date": dateStr,
      },
    };
    return await fetchAllItemByDynamodbIndex(rankingQueryParams);
  };

  let rankingResult = await getRankingDataForDate(getUTCYesterdayDate());
  if (!rankingResult || rankingResult.length === 0) {
    rankingResult = await getRankingDataForDate(getUTCTwoDaysAgoDate);
  }

  const rankingMap = {};
  if (rankingResult && rankingResult.length > 0) {
    const rankingData = rankingResult[0];
    if (rankingData.rankings && Array.isArray(rankingData.rankings)) {
      rankingData.rankings.forEach((r) => {
        rankingMap[r.database_id] = r.rank;
      });
    }
  }

  dailyItems.sort((a, b) => {
    const rankA =
      rankingMap[a.databaseId] !== undefined
        ? rankingMap[a.databaseId]
        : Number.MAX_SAFE_INTEGER;
    const rankB =
      rankingMap[b.databaseId] !== undefined
        ? rankingMap[b.databaseId]
        : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });

  return dailyItems;
};

/**
 * getDatabaseNameById: Retrieves the database name and ui_display from the Databases table.
 */
const getDatabaseNameById = async (databaseId) => {
  const key = { id: databaseId };
  try {
    const result = await getItem(TABLE_NAME.DATABASES, key);
    if (result.Item) {
      return result.Item;
    }
    return { name: "Unknown", ui_display: "YES" };
  } catch (error) {
    console.error(`Error fetching database name for ID ${databaseId}:`, error);
    throw error;
  }
};
