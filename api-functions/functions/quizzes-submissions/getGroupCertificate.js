import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import ShortUniqueId from "short-unique-id";
import { v4 as uuidv4 } from "uuid";
import {
  getItem,
  fetchAllItemByDynamodbIndex,
  updateItemInDynamoDB,
  createItemInDynamoDB,
} from "../../helpers/dynamodb.js";
import { fetchBufferFromS3, uploadBufferToS3 } from "../../helpers/s3.js";
import { TABLE_NAME, QUERY_STATUS } from "../../helpers/constants.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";
import moment from "moment";
import { awardXP } from "../../helpers/awardXP.js";

const uid = new ShortUniqueId({ length: 12 });

export const handler = async (event) => {
  try {
    const { groupId, userId } = event.queryStringParameters || {};

    if (!groupId || !userId) {
      return sendResponse(
        400,
        "Missing required parameters: groupId and userId",
        null
      );
    }

    const [group, user] = await validateAndFetch(groupId, userId);
    const { passedQuizIds, passedSubmissions } = await validateUserEligibility(
      userId,
      group.quizIds
    );

    const { certificateId, certificateUrl, averagePercentage, submissionId } =
      await createAndSaveCertificate(
        group,
        user,
        passedQuizIds,
        passedSubmissions
      );

    await updateGroupCertificateInfo(
      groupId,
      userId,
      certificateUrl,
      submissionId,
      group
    );

    // Award 100 XP for successful group certificate completion
    await awardXP(userId, 100, "Group certificate completion");

    return sendResponse(200, "Group certificate generated successfully", {
      id: certificateId,
      certificateId,
      certificateUrl,
      submissionId,
      userId,
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
  if (!groupResult.Item.quizIds?.length)
    throw new Error("Group has no quizzes");

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
      `You must pass all quizzes in this group. ${
        groupQuizIds.length - passedQuizIds.length
      } quiz(es) remaining.`
    );
  }

  return { passedQuizIds, passedSubmissions };
};

const createAndSaveCertificate = async (
  group,
  user,
  passedQuizIds,
  passedSubmissions
) => {
  const certificateId = uid.rnd().toUpperCase();
  const submissionId = uuidv4(); // Generate unique submissionId for group certificate
  const formattedDateTime = moment()
    .utc()
    .format("Do MMMM YYYY HH:mm:ss [UTC]");

  const averagePercentage = Math.round(
    passedSubmissions.reduce((sum, s) => sum + (s.percentageScore || 0), 0) /
      passedSubmissions.length
  );

  const certificateUrl = await generateCertificate({
    bucket: process.env.BUCKET_NAME,
    templateKey: "COMMON/Certificate.pdf",
    outputKey: `CERTIFICATES/${certificateId}-${user.id}-${submissionId}.pdf`,
    fields: {
      name: user?.name || "User",
      dateTime: formattedDateTime,
      groupName: group?.name || "Group",
      averagePercentage,
      certificateId,
      completionText: `For successfully completing all quizzes in the ${group.name} (group certificate) on ${formattedDateTime}.`,
    },
  });

  const certificateItem = {
    id: certificateId,
    userId: user.id,
    submissionId,
    issueDate: getTimestamp(),
    status: QUERY_STATUS.ACTIVE,
    metaData: {
      averageScore: averagePercentage,
      groupName: group?.name,
      totalQuizzes: group.quizIds.length,
      passedQuizzes: passedQuizIds.length,
    },
    eligibibleForCredits: user?.certificateCredits > 25 ? "TRUE" : "FALSE",
  };

  // Only add subjectId if it exists (for quiz certificates, not group certificates)
  // Don't add subjectId for group certificates to avoid index issues

  await createItemInDynamoDB(
    certificateItem,
    TABLE_NAME.CERTIFICATES,
    { "#id": "id" },
    "attribute_not_exists(#id)",
    false
  );

  return { certificateId, certificateUrl, averagePercentage, submissionId };
};

const updateGroupCertificateInfo = async (
  groupId,
  userId,
  certificateUrl,
  submissionId,
  group
) => {
  // Update certificate URL for this user - merge with existing certificateUrls
  const existingUrls = group.certificateUrls || {};
  const updatedUrls = {
    ...existingUrls,
    [userId]: certificateUrl,
  };

  // Update certificate submission IDs - merge with existing
  const existingSubmissionIds = group.certificateSubmissionIds || {};
  const updatedSubmissionIds = {
    ...existingSubmissionIds,
    [userId]: submissionId,
  };

  // Update certificateTakenBy array - add userId if not present
  const existingTakenBy = group.certificateTakenBy || [];
  const updatedTakenBy = existingTakenBy.includes(userId)
    ? existingTakenBy
    : [...existingTakenBy, userId];

  await updateItemInDynamoDB({
    table: TABLE_NAME.GROUPS,
    Key: { id: groupId },
    UpdateExpression:
      "SET certificateUrls = :certificateUrls, certificateSubmissionIds = :certificateSubmissionIds, certificateTakenBy = :certificateTakenBy",
    ExpressionAttributeValues: {
      ":certificateUrls": updatedUrls,
      ":certificateSubmissionIds": updatedSubmissionIds,
      ":certificateTakenBy": updatedTakenBy,
    },
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

/**
 * Convert hex color code to RGB values for pdf-lib
 * @param {string} hex - Hex color code (e.g., "#FF0000" or "FF0000")
 * @returns {Object} RGB object with r, g, b values (0-1 range)
 */
const hexToRgb = (hex) => {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return { r, g, b };
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

  // Draw completion text - highlight groupName in red for group certificates
  if (fields.groupName && fields.completionText) {
    // For group certificates: "For successfully completing [groupName in red] on [dateTime]"
    const textBefore = "For successfully completing all quizzes in the ";
    const groupName = fields.groupName;
    const textAfter = ` (group certificate) on ${fields.dateTime}`;

    const fontSize = 18;
    let currentX = 80;
    const y = height - 520;

    // Draw "For successfully completing "
    page.drawText(textBefore, {
      x: currentX,
      y: y,
      size: fontSize,
      color: rgb(0, 0, 0),
    });
    currentX += font.widthOfTextAtSize(textBefore, fontSize);

    const groupNameHex = "dc2626";
    const { r, g, b } = hexToRgb(groupNameHex);
    page.drawText(groupName, {
      x: currentX,
      y: y,
      size: fontSize,
      color: rgb(r, g, b),
    });
    currentX += font.widthOfTextAtSize(groupName, fontSize);

    // Draw " on [dateTime]"
    page.drawText(textAfter, {
      x: currentX,
      y: y,
      size: fontSize,
      color: rgb(0, 0, 0),
    });
  }

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
