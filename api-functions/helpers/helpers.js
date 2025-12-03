import moment from "moment";
import { RESOURCE_TYPE, USER_ROLE } from "./constants.js";
import { jwtDecode } from "jwt-decode";

export const getTableName = (name) => {
  return `${name}`;
};

export const sendResponse = (statusCode, message, data) => {
  return {
    statusCode,
    body: JSON.stringify({
      message,
      data,
    }),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    },
  };
};

export const checkAuthentication = async (
  event,
  allowedRoles = [USER_ROLE.VENDORS]
) => {
  const token = event.headers.Authorization || event.headers.authorization;
  console.log("token", token);
  if (!token) {
    throw new Error("Unauthorized");
  }
  const payload = jwtDecode(token);
  const role = payload["cognito:groups"]?.[0] ?? null;
  console.log("role", role);
  if (allowedRoles.includes(role)) {
    return true;
  } else {
    throw new Error("Unauthorized");
  }
};

export const getTimestamp = () => {
  return new Date().getTime();
};

export const getDayTimestamps = (dateString) => {
  const date = new Date(dateString);

  const startOfDay = Math.floor(
    new Date(date.setUTCHours(0, 0, 0, 0)).getTime() / 1000
  );

  const endOfDay = Math.floor(
    new Date(date.setUTCHours(23, 59, 59, 999)).getTime() / 1000
  );

  return { startOfDay, endOfDay };
};

export const formatDateToCompact = (dateString) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }

  return dateString.replace(/-/g, "");
};

export const generateQueries = (name) => [
  `${name}`,
  `${name} issues`,
  `${name} crash`,
  `${name} slow`,
  `${name} stuck`,
];
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getYesterdayDate = moment()
  .subtract(1, "days")
  .format("YYYY-MM-DD");

export const getTodayDate = moment().format("YYYY-MM-DD");
export const getTwoDaysAgoDate = moment()
  .subtract(2, "days")
  .format("YYYY-MM-DD");

export const getUTCYesterdayDate = () => {
  const currentHour = moment.utc().hour();
  // If UTC time is 12pm or later, subtract 1 day; otherwise, subtract 2 days.
  const daysToSubtract = currentHour >= 12 ? 1 : 2;
  return moment.utc().subtract(daysToSubtract, "days").format("YYYY-MM-DD");
};

export const getUTCTodayDate = moment.utc().format("YYYY-MM-DD");

export const getUTCTwoDaysAgoDate = moment
  .utc()
  .subtract(2, "days")
  .format("YYYY-MM-DD");

export const calculateGitHubPopularity = ({
  totalIssues,
  totalStars,
  totalRepos,
}) => {
  return (totalStars * 0.1 + totalRepos * 0.6 - totalIssues * 0.3) * 100000;
};

export const calculateStackOverflowPopularity = ({
  totalQuestions,
  totalQuestionsAllTime,
  totalViewCount,
}) => {
  return (
    (totalQuestions * 0.7 + totalViewCount * 0.3) * 100000 +
    totalQuestionsAllTime
  );
};

export const calculateGooglePopularity = (data) => {
  const totalResultsSum = data
    .filter((value) => value.totalResults)
    .reduce((sum, value) => sum + value.totalResults, 0);

  const weightedSum = data.reduce((sum, value) => {
    const totalResultsWithoutDate = value.totalResultsWithoutDate || 0;
    const totalResultsWithDate = value.totalResultsWithDate || 0;

    return sum + totalResultsWithoutDate * 0.002 + totalResultsWithDate * 0.448;
  }, 0);

  return weightedSum - totalResultsSum * 0.5;
};

export const calculateBingPopularity = (data) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return 0;
  }

  const firstQueryMatches = data[0]?.totalEstimatedMatches || 0;

  const totalQueriesSum = data.slice(1).reduce((sum, item) => {
    return sum + (item?.totalEstimatedMatches || 0);
  }, 0);

  return firstQueryMatches * 0.5 - totalQueriesSum * 0.5;
};

export const adjustAndRecalculatePopularity = (scores) => {
  const { googleScore, githubScore, bingScore, stackoverflowScore } = scores;

  // Adjust individual scores if negative
  const adjustedScores = {
    googleScore: googleScore < 0 ? 200000 : googleScore,
    githubScore: githubScore < 0 ? 200000 : githubScore,
    bingScore: bingScore < 0 ? 200000 : bingScore,
    stackoverflowScore: stackoverflowScore < 0 ? 200000 : stackoverflowScore,
  };

  // Calculate totalScore
  adjustedScores.totalScore = calculateOverallPopularity(adjustedScores);

  return adjustedScores;
};

export const calculateOverallPopularity = ({
  googleScore,
  githubScore,
  bingScore,
  stackoverflowScore,
}) => {
  return (
    googleScore * 0.2 +
    bingScore * 0.1 +
    githubScore * 0.4 +
    stackoverflowScore * 0.3
  );
};

export const getPopularityByFormula = (resourceType, data) => {
  switch (resourceType) {
    case RESOURCE_TYPE.GITHUB:
      return calculateGitHubPopularity(data);
    case RESOURCE_TYPE.STACKOVERFLOW:
      return calculateStackOverflowPopularity(data);
    case RESOURCE_TYPE.GOOGLE:
      return calculateGooglePopularity(data);
    case RESOURCE_TYPE.BING:
      return calculateBingPopularity(data);
    case RESOURCE_TYPE.ALL:
      return calculateOverallPopularity(data);
    default:
      throw new Error("Invalid resource type");
  }
};
