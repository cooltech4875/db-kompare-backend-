import { TABLE_NAME, QUIZ_SUBMISSION_STATUS } from "../../helpers/constants.js";
import { fetchAllItemsByScan } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import moment from "moment";

export const handler = async (event) => {
  try {
    let startDate = "";
    let endDate = "";

    if (event.body) {
      try {
        const parsedBody = JSON.parse(event.body);
        startDate = parsedBody.startDate || "";
        endDate = parsedBody.endDate || "";
      } catch (parseError) {
        return sendResponse(400, "Invalid JSON in request body.");
      }
    }

    // Fallback to query parameters if not in body
    if ((!startDate || !endDate) && event.queryStringParameters) {
      startDate = event.queryStringParameters.startDate || startDate;
      endDate = event.queryStringParameters.endDate || endDate;
    }

    // Validate that both dates are provided
    if (!startDate || !endDate) {
      return sendResponse(
        400,
        'Both startDate and endDate must be provided in the request body. Expected format: { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }'
      );
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return sendResponse(
        400,
        "startDate and endDate must be in YYYY-MM-DD format."
      );
    }

    // Validate date range (startDate should not be after endDate)
    if (startDate > endDate) {
      return sendResponse(400, "startDate cannot be later than endDate.");
    }

    // Convert dates to timestamps (start of day and end of day)
    // This ensures we capture all submissions within the date range
    // createdAt is stored as a timestamp (milliseconds since epoch)
    const startTimestamp = moment(startDate, "YYYY-MM-DD")
      .startOf("day")
      .valueOf();
    const endTimestamp = moment(endDate, "YYYY-MM-DD").endOf("day").valueOf();

    // Scan quiz submissions table with date filter
    // Using scan with FilterExpression since there's no GSI on createdAt
    const allSubmissions = await fetchAllItemsByScan({
      TableName: TABLE_NAME.QUIZZES_SUBMISSIONS,
      FilterExpression: "#createdAt BETWEEN :startTimestamp AND :endTimestamp",
      ExpressionAttributeNames: {
        "#createdAt": "createdAt",
      },
      ExpressionAttributeValues: {
        ":startTimestamp": startTimestamp,
        ":endTimestamp": endTimestamp,
      },
    });

    // Initialize all dates in the range with 0 values
    const statsByDate = new Map();
    const startMoment = moment(startDate, "YYYY-MM-DD").startOf("day");
    const endMoment = moment(endDate, "YYYY-MM-DD").startOf("day");
    
    // Add all dates in the range to the map with 0 values
    let currentDate = moment(startMoment);
    while (currentDate.isSameOrBefore(endMoment)) {
      const dateTimestamp = currentDate.valueOf();
      statsByDate.set(dateTimestamp, {
        date: dateTimestamp,
        totalAttempts: 0,
        totalPassed: 0,
        totalFailed: 0,
      });
      currentDate.add(1, "day");
    }

    // Update stats for dates that have submissions
    allSubmissions.forEach((submission) => {
      const submissionDate = moment(submission.createdAt).startOf("day");
      const dateTimestamp = submissionDate.valueOf();

      if (statsByDate.has(dateTimestamp)) {
        const dateStat = statsByDate.get(dateTimestamp);
        dateStat.totalAttempts += 1;

        if (submission.status === QUIZ_SUBMISSION_STATUS.PASSED) {
          dateStat.totalPassed += 1;
        } else if (submission.status === QUIZ_SUBMISSION_STATUS.FAILED) {
          dateStat.totalFailed += 1;
        }
      }
    });

    const quizAnalytics = Array.from(statsByDate.values()).sort(
      (a, b) => b.date - a.date
    );

    return sendResponse(200, "Quiz analytics fetched successfully", {
      quizAnalytics,
    });
  } catch (error) {
    console.error("Error fetching quiz analytics:", error);
    return sendResponse(500, "Internal server error", error.message || error);
  }
};
