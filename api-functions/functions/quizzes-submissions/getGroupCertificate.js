import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import ShortUniqueId from "short-unique-id";
import { getItem, fetchAllItemByDynamodbIndex, updateItemInDynamoDB, createItemInDynamoDB } from "../../helpers/dynamodb.js";
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
    const { groupId, userId } = event.queryStringParameters || {};
    
    if (!groupId || !userId) {
      return sendResponse(400, "Missing required parameters: groupId and userId", null);
    }

    const [group, user] = await validateAndFetch(groupId, userId);
    const { passedQuizIds, passedSubmissions } = await validateUserEligibility(userId, group.quizIds);
    
    const { certificateId, certificateUrl, averagePercentage } = await createAndSaveCertificate(
      group,
      user,
      passedQuizIds,
      passedSubmissions
    );

    await updateGroupCertificateInfo(groupId, userId, certificateUrl, group);

    return sendResponse(200, "Group certificate generated successfully", {
      certificateId,
      certificateUrl,
      groupName: group.name,
      averagePercentage,
      issuedDate: getTimestamp(),
      eligibibleForCredits: user?.certificateCredits > 25 ? "TRUE" : "FALSE",
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

const validateAndFetch = async (groupId, userId) => {
  const [groupResult, userResult] = await Promise.all([
    getItem(TABLE_NAME.GROUPS, { id: groupId }),
    getItem(TABLE_NAME.USERS, { id: userId }),
  ]);

  if (!groupResult?.Item) throw new Error("Group not found");
  if (!userResult?.Item) throw new Error("User not found");
  if (!groupResult.Item.quizIds?.length) throw new Error("Group has no quizzes");

  return [groupResult.Item, userResult.Item];
};

const validateUserEligibility = async (userId, groupQuizIds) => {
  const submissions = await fetchAllItemByDynamodbIndex({
    TableName: TABLE_NAME.QUIZZES_SUBMISSIONS,
    IndexName: "byUser",
    KeyConditionExpression: "#userId = :userId",
    ExpressionAttributeNames: { "#userId": "userId" },
    ExpressionAttributeValues: { ":userId": userId },
  });

  const passedSubmissions = submissions.filter(
    (s) => s.status === "PASSED" && groupQuizIds.includes(s.quizId)
  );

  const passedQuizIds = [...new Set(passedSubmissions.map((s) => s.quizId))];

  if (passedQuizIds.length < groupQuizIds.length) {
    throw new Error(
      `You must pass all quizzes in this group. ${groupQuizIds.length - passedQuizIds.length} quiz(es) remaining.`
    );
  }

  return { passedQuizIds, passedSubmissions };
};

const createAndSaveCertificate = async (group, user, passedQuizIds, passedSubmissions) => {
  const certificateId = uid.rnd().toUpperCase();
  const formattedDateTime = moment().utc().format("Do MMMM YYYY HH:mm:ss [UTC]");

  const averagePercentage = Math.round(
    passedSubmissions.reduce((sum, s) => sum + (s.percentageScore || 0), 0) /
      passedSubmissions.length
  );

  const certificateUrl = await generateCertificate({
    bucket: process.env.BUCKET_NAME,
    templateKey: "COMMON/Certificate.pdf",
    outputKey: `CERTIFICATES/${certificateId}-${user.id}-group.pdf`,
    fields: {
      name: user?.name || "User",
      dateTime: formattedDateTime,
      groupName: group?.name || "Group",
      averagePercentage,
      certificateId,
      completionText: `For successfully completing all quizzes in the ${group.name} group on ${formattedDateTime}.`,
    },
  });

  await createItemInDynamoDB(
    {
      id: certificateId,
      subjectId: group.id,
      userId: user.id,
      submissionId: null,
      issueDate: getTimestamp(),
      status: QUERY_STATUS.ACTIVE,
      metaData: {
        averageScore: averagePercentage,
        groupName: group?.name,
        totalQuizzes: group.quizIds.length,
        passedQuizzes: passedQuizIds.length,
      },
      eligibibleForCredits: user?.certificateCredits > 25 ? "TRUE" : "FALSE",
    },
    TABLE_NAME.CERTIFICATES,
    { "#id": "id" },
    "attribute_not_exists(#id)",
    false
  );

  return { certificateId, certificateUrl, averagePercentage };
};

const updateGroupCertificateInfo = async (groupId, userId, certificateUrl, group) => {
  const updateExpressions = [];
  const expressionAttributeNames = { "#userId": userId };
  const expressionAttributeValues = { ":certificateUrl": certificateUrl };

  // Always add userId to array if not present
  if (!group.certificateTakenBy?.includes(userId)) {
    updateExpressions.push("certificateTakenBy = list_append(if_not_exists(certificateTakenBy, :empty_list), :userId_list)");
    expressionAttributeValues[":empty_list"] = [];
    expressionAttributeValues[":userId_list"] = [userId];
  }

  // Always update certificate URL for this user (overwrite if exists)
  updateExpressions.push("certificateUrls.#userId = :certificateUrl");

  await updateItemInDynamoDB({
    table: TABLE_NAME.GROUPS,
    Key: { id: groupId },
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "NONE",
  });
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

