import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { v4 as uuidv4 } from "uuid";
import ShortUniqueId from "short-unique-id";
import { getItem, createItemInDynamoDB } from "../../helpers/dynamodb.js";
import { fetchBufferFromS3, uploadBufferToS3 } from "../../helpers/s3.js";
import {
  TABLE_NAME,
  QUIZ_SUBMISSION_STATUS,
  QUERY_STATUS,
} from "../../helpers/constants.js";
import { getTimestamp, sendResponse } from "../../helpers/helpers.js";
import moment from "moment";
import { fetchQuizWithQuestions } from "../common/quizzes.js";

const uid = new ShortUniqueId({ length: 12 });

export const handler = async (event) => {
  try {
    // Parse and validate input
    const { quizId, userId, answers } = JSON.parse(event.body || "{}");
    validateInput(quizId, userId, answers);

    // Fetch required data in parallel
    const [quiz, user] = await Promise.all([
      fetchQuizWithQuestions(quizId),
      fetchUser(userId),
    ]);

    // Calculate score and determine pass/fail
    const submissionId = uuidv4();
    const { correctCount, totalScore } = calculateQuizScore(
      quiz.questions,
      answers
    );
    const percentageScore = (correctCount / quiz.questions.length) * 100;
    const passed = percentageScore >= quiz.passingPerc;

    const certificateId = passed ? uid.rnd().toUpperCase() : null;

    // Create submission record (includes certificateId if passed)
    await createQuizSubmission(
      quiz,
      userId,
      answers,
      submissionId,
      passed,
      certificateId,
      percentageScore
    );

    // Handle certificate generation if passed
    let certificateUrl = null;

    if (passed && user?.credits > 25) {
      const formattedDateTime = moment()
        .utc()
        .format("Do MMMM YYYY HH:mm:ss [UTC]");

      certificateUrl = await generateCertificate({
        bucket: process.env.BUCKET_NAME,
        templateKey: "COMMON/Certificate.pdf",
        outputKey: `CERTIFICATES/${certificateId}-${userId}-${submissionId}.pdf`,
        fields: {
          name: user?.name || "User",
          dateTime: formattedDateTime,
          quizName: quiz?.name || "Quiz",
          percentage: Math.round(percentageScore),
          certificateId,
        },
      });

      const metaData = {
        score: percentageScore,
        quizName: quiz?.name,
      };

      await createCertificateRecord(
        certificateId,
        quizId,
        userId,
        submissionId,
        metaData
      );
    }

    // Return response
    return sendResponse(200, "Quiz submitted successfully", {
      submissionId,
      correctCount,
      totalQuestions: quiz?.questions?.length,
      percentageScore: Math.round(percentageScore),
      passed,
      passingPercentage: quiz?.passingPerc,
      certificateUrl,
      certificateId,
    });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return sendResponse(statusCode, error.message, null);
  }
};

// ======================
// Helper Functions
// ======================

const validateInput = (quizId, userId, answers) => {
  if (!quizId || !userId || !answers) {
    throw new Error("Missing required fields: quizId, userId, answers");
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error("Answers must be a non-empty array");
  }
};

const fetchUser = async (userId) => {
  const userResult = await getItem(TABLE_NAME.USERS, { id: userId });
  if (!userResult?.Item) throw new Error("User not found");
  return userResult.Item;
};

const calculateQuizScore = (questions, userAnswers) => {
  let correctCount = 0;
  let totalScore = 0;

  questions.forEach((question) => {
    const userAnswer = userAnswers.find((a) => a.questionId === question.id);
    if (!userAnswer) return;

    const correctOptions = question.options
      .filter((opt) => opt.isCorrect)
      .map((opt) => opt.id);

    if (question.isMultipleAnswer) {
      const allCorrect = correctOptions.every((optId) =>
        userAnswer.selectedOptionIds.includes(optId)
      );
      const noExtra = userAnswer.selectedOptionIds.every((optId) =>
        correctOptions.includes(optId)
      );
      if (allCorrect && noExtra) {
        correctCount++;
        totalScore += question.points || 1;
      }
    } else if (
      userAnswer.selectedOptionIds.length === 1 &&
      correctOptions.includes(userAnswer.selectedOptionIds[0])
    ) {
      correctCount++;
      totalScore += question.points || 1;
    }
  });

  return { correctCount, totalScore };
};

const createQuizSubmission = async (
  quiz,
  userId,
  answers,
  submissionId,
  passed,
  certificateId = null
) => {
  const { correctCount, totalScore } = calculateQuizScore(
    quiz.questions,
    answers
  );
  const percentageScore = (correctCount / quiz.questions.length) * 100;

  const submissionItem = {
    id: submissionId,
    quizId: quiz.id,
    userId,
    createdAt: getTimestamp(),
    answers,
    correctCount,
    totalQuestions: quiz.questions.length,
    totalScore,
    percentageScore,
    passingPercentage: quiz.passingPerc,
    status: passed
      ? QUIZ_SUBMISSION_STATUS.PASSED
      : QUIZ_SUBMISSION_STATUS.FAILED,
    ...(passed && { certificateId }), // Only include certificateId if passed
    quizDetails: {
      name: quiz.name,
      category: quiz.category,
      difficulty: quiz.difficulty,
    },
  };

  await createItemInDynamoDB(
    submissionItem,
    TABLE_NAME.QUIZZES_SUBMISSIONS,
    { "#id": "id" },
    "attribute_not_exists(#id)"
  );

  return { submissionItem, correctCount, totalScore, percentageScore };
};

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

  // Draw completion text
  page.drawText(
    `For successfully completing ${fields.quizName} with score of ${fields.percentage}% on ${fields.dateTime}.`,
    {
      x: 80,
      y: height - 520,
      size: 18,
      color: rgb(0, 0, 0),
      maxWidth: wrapWidth,
      lineHeight: 32,
    }
  );

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

const createCertificateRecord = async (
  certificateId,
  quizId,
  userId,
  submissionId,
  metaData = {}
) => {
  const certificateItem = {
    id: certificateId,
    subjectId: quizId,
    userId,
    submissionId,
    issueDate: getTimestamp(),
    status: QUERY_STATUS.ACTIVE,
    metaData,
  };

  await createItemInDynamoDB(
    certificateItem,
    TABLE_NAME.CERTIFICATES,
    { "#id": "id" },
    "attribute_not_exists(#id)"
  );
};
