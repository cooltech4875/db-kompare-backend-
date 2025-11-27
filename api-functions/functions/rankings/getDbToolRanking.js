import { TABLE_NAME } from "../../helpers/constants.js";
import {
  fetchAllItemByDynamodbIndex,
  getItem,
} from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import { fetchDbToolById } from "../common/fetchDbToolById.js";
import { fetchDbToolCategoryDetail } from "../common/fetchDbToolCategoryDetail.js";

export const handler = async (event) => {
  let startDate = "";
  let endDate = "";

  console.log("Received event:", JSON.stringify(event, null, 2));
  if (event.body) {
    const parsedBody = JSON.parse(event.body);
    startDate = parsedBody.startDate;
    endDate = parsedBody.endDate;
  } else if (event.queryStringParameters) {
    startDate = event.queryStringParameters.startDate;
    endDate = event.queryStringParameters.endDate;
  }

  if (!startDate || !endDate) {
    return sendResponse(
      400,
      "Both startDate and endDate must be provided for date range filtering."
    );
  }

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

  const queryParams = {
    TableName: TABLE_NAME.DB_TOOLS_RANKINGS,
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

  try {
    const allItems = await fetchAllItemByDynamodbIndex(queryParams);

    if (allItems.length === 0) {
      return sendResponse(
        400,
        "No rankings found for the specified date range"
      );
    }

    const transformedData = await calculateScoreAndRankChanges(
      allItems,
      startDate,
      endDate
    );

    return sendResponse(200, "Ranks fetched Successfully", transformedData);
  } catch (error) {
    console.error("Error fetching items:", error);
    return sendResponse(
      500,
      "Failed to fetch items from DynamoDB",
      error.message
    );
  }
};

const calculateScoreAndRankChanges = async (
  rankingsData,
  startDate,
  endDate
) => {
  try {
    const [start, end] = [new Date(startDate), new Date(endDate)];

    const dbToolMap = getDbToolMap(rankingsData, start, end);

    const result = await Promise.all(
      Object.keys(dbToolMap).map(async (dbtoolId) => {
        try {
          const toolData = dbToolMap[dbtoolId];
          const sortedData = sortDataByDate(toolData);
          const mostRecentData = getMostRecentData(sortedData, endDate);

          if (!mostRecentData) {
            return null;
          }

          const dbToolDetail = await fetchDbToolById(dbtoolId);
          if (!dbToolDetail) {
            return null;
          }

          const categoryDetail = dbToolDetail.category_id
            ? await fetchDbToolCategoryDetail(dbToolDetail.category_id)
            : null;

          const { scoreChanges, rankChanges } = calculateChanges(
            sortedData,
            mostRecentData
          );

          return {
            dbtool_id: dbtoolId,
            name: dbToolDetail.tool_name,
            category: categoryDetail?.name || "Unknown",
            category_id: dbToolDetail.category_id || null,
            scoreChanges,
            rankChanges,
          };
        } catch (error) {
          console.error(`Error processing dbtoolId ${dbtoolId}:`, error.message);
          return null;
        }
      })
    );

    return result.filter(Boolean);
  } catch (error) {
    console.error("Error in calculateScoreAndRankChanges:", error);
    throw error;
  }
};

const getDbToolMap = (rankingsData, start, end) => {
  const dbToolMap = {};

  rankingsData.forEach((item) => {
    const { date, rankings } = item;

    rankings.forEach((tool) => {
      if (!dbToolMap[tool.dbtool_id]) {
        dbToolMap[tool.dbtool_id] = [];
      }
      dbToolMap[tool.dbtool_id].push({
        date,
        totalScore: tool.ui_popularity.totalScore,
        rank: tool.rank,
        tool_name: tool.tool_name,
      });
    });
  });

  return dbToolMap;
};

const sortDataByDate = (data) => {
  return data.sort((a, b) => new Date(a.date) - new Date(b.date));
};

const getMostRecentData = (data, endDate) => {
  const end = new Date(endDate);

  const sortedData = data.sort((a, b) => new Date(b.date) - new Date(a.date));

  return sortedData.find((item) => new Date(item.date) <= end);
};

const calculateChanges = (data, mostRecentData) => {
  const scoreChanges = [];
  const rankChanges = [];

  scoreChanges.push({
    date: mostRecentData.date,
    totalScore: mostRecentData.totalScore,
  });
  rankChanges.push({
    date: mostRecentData.date,
    rank: mostRecentData.rank,
  });

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
