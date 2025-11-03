import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import ShortUniqueId from "short-unique-id";
import { getItem, fetchAllItemByDynamodbIndex, updateItemInDynamoDB } from "../../helpers/dynamodb.js";
import { fetchBufferFromS3, uploadBufferToS3 } from "../../helpers/s3.js";
import {
  TABLE_NAME,
  QUERY_STATUS,
} from "../../helpers/constants.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";
import moment from "moment";

const uid = new ShortUniqueId({ length: 12 });

export const handler = async (event) => {
  try {
    // Parse and validate input
    const { groupId, userId } = event.queryStringParameters || {};
    
    if (!groupId || !userId) {
      return sendResponse(
        400,
        "Missing required parameters: groupId and userId",
        null
      );
    }

    // Fetch group and user
    const [groupResult, userResult] = await Promise.all([
      getItem(TABLE_NAME.GROUPS, { id: groupId }),
      getItem(TABLE_NAME.USERS, { id: userId }),
    ]);

    if (!groupResult?.Item) {
      return sendResponse(404, "Group not found", null);
    }

    if (!userResult?.Item) {
      return sendResponse(404, "User not found", null);
    }

    const group = groupResult.Item;
    const user = userResult.Item;

    // Check if group has quizzes
    const groupQuizIds = group.quizIds || [];
    if (groupQuizIds.length === 0) {
      return sendResponse(400, "Group has no quizzes", null);
    }

    // Fetch all quiz submissions for this user
    const submissions = await fetchAllItemByDynamodbIndex({
      TableName: TABLE_NAME.QUIZZES_SUBMISSIONS,
      IndexName: "byUser",
      KeyConditionExpression: "#userId = :userId",
      ExpressionAttributeNames: { "#userId": "userId" },
      ExpressionAttributeValues: { ":userId": userId },
    });

    // Filter to only passed submissions for quizzes in this group
    const passedGroupSubmissions = submissions.filter(
      (submission) =>
        submission.status === "PASSED" &&
        groupQuizIds.includes(submission.quizId)
    );

    // Get unique passed quiz IDs
    const passedQuizIds = [
      ...new Set(passedGroupSubmissions.map((s) => s.quizId)),
    ];

    // Check if user has passed all quizzes in the group
    if (passedQuizIds.length < groupQuizIds.length) {
      const missingCount = groupQuizIds.length - passedQuizIds.length;
      return sendResponse(
        403,
        `You must pass all quizzes in this group. ${missingCount} quiz(es) remaining.`,
        {
          totalQuizzes: groupQuizIds.length,
          passedQuizzes: passedQuizIds.length,
          remainingQuizzes: missingCount,
        }
      );
    }

    // Check if certificate already exists for this user and group
    const existingCertificates = await fetchAllItemByDynamodbIndex({
      TableName: TABLE_NAME.CERTIFICATES,
      IndexName: "byUser",
      KeyConditionExpression: "#userId = :userId",
      ExpressionAttributeNames: { "#userId": "userId" },
      ExpressionAttributeValues: { ":userId": userId },
    });

    const existingGroupCertificate = existingCertificates.find(
      (cert) => cert.subjectId === groupId && cert.status === QUERY_STATUS.ACTIVE
    );

    // Check if user is already in certificateTakenBy array (for existing certificates)
    const certificateTakenBy = group.certificateTakenBy || [];
    if (!certificateTakenBy.includes(userId) && existingGroupCertificate) {
      // Update group to add userId if certificate exists but not in array
      await updateItemInDynamoDB({
        table: TABLE_NAME.GROUPS,
        Key: { id: groupId },
        UpdateExpression: "SET certificateTakenBy = list_append(if_not_exists(certificateTakenBy, :empty_list), :userId_list)",
        ExpressionAttributeValues: {
          ":empty_list": [],
          ":userId_list": [userId],
        },
        ReturnValues: "NONE",
      });
    }

    if (existingGroupCertificate) {
      // Return existing certificate
      const certificateUrl = `s3://${process.env.BUCKET_NAME}/CERTIFICATES/${existingGroupCertificate.id}-${userId}-${existingGroupCertificate.submissionId || 'group'}.pdf`;
      
      return sendResponse(200, "Group certificate retrieved successfully", {
        certificateId: existingGroupCertificate.id,
        certificateUrl,
        groupName: group.name,
        issuedDate: existingGroupCertificate.issueDate,
        alreadyExists: true,
      });
    }

    // Generate new certificate
    const certificateId = uid.rnd().toUpperCase();
    const formattedDateTime = moment()
      .utc()
      .format("Do MMMM YYYY HH:mm:ss [UTC]"); 

    // Calculate average percentage score from all passed submissions
    const averagePercentage = Math.round(
      passedGroupSubmissions.reduce(
        (sum, submission) => sum + (submission.percentageScore || 0),
        0
      ) / passedGroupSubmissions.length
    );

    // if user has less than 25 credits, set eligibibleForCredits to FALSE
    // if user has more than 25 credits, set eligibibleForCredits to TRUE because user has to pay 10 euro to get the certificate
    const isEligibleForCredits =
      user?.certificateCredits > 25 ? "TRUE" : "FALSE";

    // Generate certificate with custom completion text
    const certificateUrl = await generateCertificate({
      bucket: process.env.BUCKET_NAME,
      templateKey: "COMMON/Certificate.pdf",
      outputKey: `CERTIFICATES/${certificateId}-${userId}-group.pdf`,
      fields: {
        name: user?.name || "User",
        dateTime: formattedDateTime,
        groupName: group?.name || "Group",
        averagePercentage,
        certificateId,
        completionText: `For successfully completing all quizzes in the ${group.name} group on ${formattedDateTime}.`,
      },
    });

    const metaData = {
      averageScore: averagePercentage,
      groupName: group?.name,
      totalQuizzes: groupQuizIds.length,
      passedQuizzes: passedQuizIds.length,
    };

    // Create certificate record
    const certificateItem = {
      id: certificateId,
      subjectId: groupId, // Group ID instead of quiz ID
      userId,
      submissionId: null, // No single submission for group certificate
      issueDate: getTimestamp(),
      status: QUERY_STATUS.ACTIVE,
      metaData,
      eligibibleForCredits: isEligibleForCredits,
    };

    // Save certificate to database
    const { createItemInDynamoDB } = await import("../../helpers/dynamodb.js");
    await createItemInDynamoDB(
      certificateItem,
      TABLE_NAME.CERTIFICATES,
      { "#id": "id" },
      "attribute_not_exists(#id)",
      false
    );

    // Update group to add userId to certificateTakenBy array
    const existingCertificateTakenBy = group.certificateTakenBy || [];
    if (!existingCertificateTakenBy.includes(userId)) {
      await updateItemInDynamoDB({
        table: TABLE_NAME.GROUPS,
        Key: { id: groupId },
        UpdateExpression: "SET certificateTakenBy = list_append(if_not_exists(certificateTakenBy, :empty_list), :userId_list)",
        ExpressionAttributeValues: {
          ":empty_list": [],
          ":userId_list": [userId],
        },
        ReturnValues: "NONE",
      });
    }

    return sendResponse(200, "Group certificate generated successfully", {
      certificateId,
      certificateUrl,
      groupName: group.name,
      averagePercentage,
      issuedDate: certificateItem.issueDate,
      eligibibleForCredits: isEligibleForCredits,
    });
  } catch (error) {
    console.error("Error generating group certificate:", error);
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return sendResponse(statusCode, error.message, null);
  }
};

// ======================
// Helper Functions
// ======================

const getAutoFontSize = (
  font,
  text,
  wrapWidth,
  { defaultSize = 60, minSize = 14 } = {}
) => {
  // width of the text at size = 1
  const unitWidth = font.widthOfTextAtSize(text, 1);
  // ideal size so that unitWidth * size ≤ wrapWidth
  const idealSize = Math.floor(wrapWidth / unitWidth);
  // clamp between minSize and defaultSize
  return Math.max(minSize, Math.min(defaultSize, idealSize));
};

const generateCertificate = async ({
  bucket,
  templateKey,
  outputKey,
  fields,
}) => {
  const templateBytes = await fetchBufferFromS3(bucket, templateKey);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPage(0);
  const { width, height } = page.getSize();
  // embed a real font so we can measure text width
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const marginX = 220;
  const wrapWidth = width - marginX * 2;
  const nameColor = rgb(33 / 255, 49 / 255, 151 / 255);
  const linkColor = rgb(89 / 255, 148 / 255, 238 / 255);
  // Compute a size that exactly fits the name into wrapWidth
  const nameSize = getAutoFontSize(font, fields.name, wrapWidth, {
    defaultSize: 48,
    minSize: 16,
  });
  // Draw user name
  page.drawText(fields.name, {
    x: 80,
    y: height - 450,
    size: nameSize,
    color: nameColor,
    maxWidth: wrapWidth,
    lineHeight: 32,
  });

  // Draw certificate ID
  page.drawText(fields.certificateId, {
    x: 970,
    y: height - 74,
    size: 16,
    color: nameColor,
  });

  // Draw verification URL
  page.drawText(`https://dbkompare.com/verify/${fields.certificateId}`, {
    x: 465,
    y: height - 684,
    size: 12,
    color: linkColor,
  });

  // Draw completion text - using custom completionText if provided, otherwise fallback
  const completionText =
    fields.completionText ||
    `For successfully completing ${fields.groupName || fields.quizName} with score of ${fields.averagePercentage || fields.percentage}% on ${fields.dateTime}.`;
  
  page.drawText(completionText, {
    x: 80,
    y: height - 520,
    size: 18,
    color: rgb(0, 0, 0),
    maxWidth: wrapWidth,
    lineHeight: 32,
  });

  const filledBytes = await pdfDoc.save();
  await uploadBufferToS3(
    bucket,
    outputKey,
    filledBytes,
    "private",
    "application/pdf"
  );

  return `s3://${bucket}/${outputKey}`;
};

