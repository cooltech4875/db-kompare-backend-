import { TABLE_NAME, CERTIFICATION_PLAN_STATUS } from "../../helpers/constants.js";
import { batchWriteItems } from "../../helpers/dynamodb.js";
import { getTimestamp, sendResponse, getTableName } from "../../helpers/helpers.js";
import { v4 as uuidv4 } from "uuid";

const plans = [
  {
    name: "Promotional Pack",
    badge: "Limited Time Offer",
    description: "For database professionals",
    price: 0,
    certificationsUnlocked: 1,
    features: [
      "Unlock 1 certification",
      "Access to certification quizzes",
      "Take quizzes at your own pace",
      "Earn certificates upon completion",
      "Download PDF certificates",
      "Track your progress",
    ],
    status: "ACTIVE",
  },
  {
    name: "Starter Pack",
    badge: "New User Special",
    description: "Perfect for beginners",
    price: 59.9,
    certificationsUnlocked: 2,
    features: [
      "Unlock 2 certifications",
      "Access to certification quizzes",
      "Take quizzes at your own pace",
      "Earn certificates upon completion",
      "Download PDF certificates",
      "Track your progress",
    ],
    status: "ACTIVE",
  },
  {
    name: "Professional Pack",
    badge: "Most Popular",
    description: "Best for serious learners",
    price: 79.9,
    certificationsUnlocked: 3,
    features: [
      "Unlock 3 certifications",
      "Access to certification quizzes",
      "Take quizzes at your own pace",
      "Earn certificates upon completion",
      "Download PDF certificates",
      "Track your progress",
    ],
    status: "ACTIVE",
  },
  {
    name: "Expert Pack",
    badge: "Best Value",
    description: "For database professionals",
    price: 89.9,
    certificationsUnlocked: 5,
    features: [
      "Unlock 5 certifications",
      "Access to certification quizzes",
      "Take quizzes at your own pace",
      "Earn certificates upon completion",
      "Download PDF certificates",
      "Track your progress",
    ],
    status: "ACTIVE",
  },
  {
    name: "Master Pack",
    badge: "Complete Package",
    description: "COMPLETE MASTERY PACKAGE",
    price: 99.9,
    certificationsUnlocked: 10,
    features: [
      "Unlock 10 certifications",
      "Access to certification quizzes",
      "Take quizzes at your own pace",
      "Earn certificates upon completion",
      "Download PDF certificates",
      "Track your progress",
    ],
    status: "ACTIVE",
  },
];

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { plans: customPlans = null, overwrite = false } = body;

    // Use custom plans from request body, or default plans from data file
    const plansToSave = customPlans || plans;

    if (!Array.isArray(plansToSave) || plansToSave.length === 0) {
      return sendResponse(400, "Plans array is required and must not be empty", null);
    }

    const itemsToWrite = plansToSave.map((plan, idx) => {
      const {
        name,
        badge = "",
        description = "",
        price = 0,
        certificationsUnlocked = 0,
        features = [],
        status = CERTIFICATION_PLAN_STATUS.ACTIVE,
      } = plan;

      // Validate required fields
      if (typeof name !== "string" || name.trim() === "") {
        throw new Error(`Plan ${idx}: "name" must be a non-empty string`);
      }

      if (typeof price !== "number" || price < 0) {
        throw new Error(`Plan ${idx}: "price" must be a non-negative number`);
      }

      if (typeof certificationsUnlocked !== "number" || certificationsUnlocked < 0) {
        throw new Error(
          `Plan ${idx}: "certificationsUnlocked" must be a non-negative number`
        );
      }

      if (!Array.isArray(features)) {
        throw new Error(`Plan ${idx}: "features" must be an array`);
      }

      // Validate status
      if (
        status !== CERTIFICATION_PLAN_STATUS.ACTIVE &&
        status !== CERTIFICATION_PLAN_STATUS.INACTIVE
      ) {
        throw new Error(
          `Plan ${idx}: "status" must be either "ACTIVE" or "INACTIVE"`
        );
      }

      // Construct the DynamoDB item
      const planItem = {
        id: uuidv4(),
        name: name.trim(),
        badge: badge.trim(),
        description: description.trim(),
        price: Number(price),
        certificationsUnlocked: Number(certificationsUnlocked),
        features: features.map((f) => String(f).trim()),
        status: status.toUpperCase(),
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      };

      return planItem;
    });

    // If overwrite is true, we might want to delete existing plans first
    // For now, we'll just add/update them (DynamoDB put will overwrite if id exists)
    // You can extend this to delete all existing plans if overwrite is true

    // Batch write all items (handles up to 25 per request automatically)
    const tableName = getTableName(TABLE_NAME.CERTIFICATION_PLANS);
    await batchWriteItems(tableName, itemsToWrite);

    return sendResponse(
      200,
      "Certification plans created successfully",
      itemsToWrite
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendResponse(400, "Malformed JSON in request body", null);
    }
    if (error.message?.startsWith("Plan")) {
      return sendResponse(400, error.message, null);
    }
    console.error("Error creating certification plans:", error);
    return sendResponse(
      500,
      "Error creating certification plans",
      error.message || null
    );
  }
};

