import { TABLE_NAME } from "../../helpers/constants.js";
import { fetchAllItemByDynamodbIndex } from "../../helpers/dynamodb.js";
import {
  getUTCTwoDaysAgoDate,
  getUTCYesterdayDate,
  sendResponse,
} from "../../helpers/helpers.js";
import moment from "moment";
import { fetchDbToolById } from "../common/fetchDbToolById.js";
import { fetchDbToolCategoryDetail } from "../common/fetchDbToolCategoryDetail.js";

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
        TableName: TABLE_NAME.DB_TOOLS_METRICES,
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
      items = await transformData(items);
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
        TableName: TABLE_NAME.DB_TOOLS_AGGREGATED,
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

    // Filter out objects with unknown db tool names
    const filteredData = items.filter(
      (db) => db?.dbToolName && db.dbToolName !== "Unknown"
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
const transformData = async (items) => {
  // Group items by `dbtool_id`
  const groupedData = items.reduce((acc, item) => {
    const {
      dbtool_id: dbToolId,
      date,
      popularity,
      ui_popularity,
      category_id,
    } = item;

    // Ensure the DB Tool entry exists in the accumulator
    if (!acc[dbToolId]) {
      acc[dbToolId] = {
        dbToolId,
        categoryDetail: "Fetching...", // Placeholder for category detail
        metrics: [],
      };
    }

    // Add metrics for the current date
    acc[dbToolId].metrics.push({
      date,
      popularity,
      ui_popularity,
    });

    // Save the category ID for later use
    acc[dbToolId].categoryId = category_id;

    return acc;
  }, {});

  // Fetch category details and DB tool names for each unique dbToolId
  const dbToolIds = Object.keys(groupedData);
  await Promise.all(
    dbToolIds.map(async (dbToolId) => {
      const categoryDetail = await fetchDbToolCategoryDetail(
        groupedData[dbToolId].categoryId
      );
      const dbToolName = await fetchDbToolById(dbToolId);
      groupedData[dbToolId].dbToolName = dbToolName?.tool_name;
      groupedData[dbToolId].categoryDetail = categoryDetail;
      groupedData[dbToolId].ui_display = dbToolName?.ui_display;
    })
  );

  // Convert the grouped object to an array
  return Object.values(groupedData);
};
/**
 * transformAggregatedData: Groups aggregated items by database_id,
 * and collects them into an "aggregations" array.
 */
const transformAggregatedData = async (items) => {
  const groupedData = items.reduce((acc, item) => {
    const {
      dbtool_id: dbToolId,
      period_key,
      metrics: dbtool_metrics,
      category_id,
    } = item;
    // Ensure the DB Tool entry exists in the accumulator
    if (!acc[dbToolId]) {
      acc[dbToolId] = {
        dbToolId,
        metrics: [],
      };
    }

    acc[dbToolId].metrics.push({
      date: period_key,
      ui_popularity: dbtool_metrics?.ui_popularity?.average,
    });

    // Save the category ID for later use
    acc[dbToolId].categoryId = category_id;
    return acc;
  }, {});

  const dbToolIds = Object.keys(groupedData);
  await Promise.all(
    dbToolIds.map(async (dbToolId) => {
      const dbToolName = await fetchDbToolById(dbToolId);
      // const categoryDetail = await fetchDbToolCategoryDetail(
      //   dbToolName?.category_id
      // );
      groupedData[dbToolId].dbToolName = dbToolName?.tool_name;
      // groupedData[dbToolId].categoryDetail = categoryDetail;
      groupedData[dbToolId].ui_display = dbToolName?.ui_display;
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
      TableName: TABLE_NAME.DB_TOOLS_RANKINGS,
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
        rankingMap[r.dbtool_id] = r.rank;
      });
    }
  }

  dailyItems.sort((a, b) => {
    const rankA =
      rankingMap[a.dbToolId] !== undefined
        ? rankingMap[a.dbToolId]
        : Number.MAX_SAFE_INTEGER;
    const rankB =
      rankingMap[b.dbToolId] !== undefined
        ? rankingMap[b.dbToolId]
        : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });

  return dailyItems;
};
