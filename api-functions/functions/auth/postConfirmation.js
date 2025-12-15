import { v4 as uuidv4 } from "uuid";
import AWS from "aws-sdk"; // Import AWS SDK for sending email via SES

import {
  addUserToGroup,
  adminUpdateUserAttributes,
} from "../../helpers/auth.js";
import { createItemInDynamoDB } from "../../helpers/dynamodb.js";
import { TABLE_NAME, USER_ROLE, USER_STATUS } from "../../helpers/constants.js";

// Load environment variables
const { COGNITO_USER_POOL_ID } = process.env;

// Initialize AWS SES client in the specified region
const ses = new AWS.SES({ apiVersion: "2010-12-01" });

export const handler = async (event, context, callback) => {
  console.log("Received event:", JSON.stringify(event));

  // Generate a unique ID for the new user
  const uniqueId = uuidv4();

  // Ensure the Lambda is triggered only for confirmed sign-ups
  if (event.triggerSource !== "PostConfirmation_ConfirmSignUp") {
    return callback(null, event);
  }

  // Handle social sign-in users (e.g., Google)
  let social_identity = event.request.userAttributes.identities;
  if (social_identity) {
    social_identity = JSON.parse(social_identity);
    social_identity = social_identity[0]; // Extract the first social identity (Google, Facebook, etc.)
  }

  // Extract user attributes from the event
  const userAttributes = event.request.userAttributes;
  const userId = uniqueId;
  let role = userAttributes["custom:role"] || USER_ROLE.VENDOR; // Default role to VENDOR if not provided
  const { email, name, sub } = userAttributes; // Extract email, name, and sub (Cognito ID)
  const loggedAt = new Date().toISOString(); // Store the timestamp of user confirmation

  // Prepare custom attributes to update in Cognito
  const attributesToUpdate = [
    { Name: "custom:userId", Value: userId },
    { Name: "custom:role", Value: role },
  ];

  // If the user signed up using Google, automatically verify the email and set role
  if (social_identity && social_identity.providerName === "Google") {
    console.log("Google user detected, setting role to VENDOR.");
    role = USER_ROLE.VENDOR;
    attributesToUpdate.push({ Name: "email_verified", Value: "true" }); // Mark email as verified for social login
  }

  try {
    // Prepare the user data payload for DynamoDB
    const payload = {
      id: userId,
      cognitoId: sub, // Store Cognito user ID
      email,
      name,
      role,
      certificateCredits: 0,
      freeQuizCredits: 2,
      unlockedQuizIds: [],
      status: USER_STATUS.ACTIVE, // Set the user's status to ACTIVE
      loggedAt, // Store timestamp
    };

    // Save the user data in DynamoDB
    await createItemInDynamoDB(
      payload,
      TABLE_NAME.USERS, // DynamoDB Table Name
      { "#id": "id" }, // Expression attribute names for primary key
      "attribute_not_exists(#id)" // Prevent overwriting existing records
    );

    // Determine which Cognito group to assign based on user role
    const groupName = role === USER_ROLE.ADMIN ? "Admins" : "Vendors";
    console.log(`Adding user to Cognito group: ${groupName}`);

    // Add the user to the appropriate Cognito user group
    await addUserToGroup(sub, groupName, COGNITO_USER_POOL_ID);

    // Update user attributes in Cognito (userId and role)
    await adminUpdateUserAttributes(
      sub,
      attributesToUpdate,
      COGNITO_USER_POOL_ID
    );

    console.log(
      `User with ID ${userId} successfully added to DynamoDB and Cognito group ${groupName}`
    );

    // Send an email notification to the admin about the new user
    await sendAdminNotification(email, name, role);

    // Successfully processed the sign-up event
    return callback(null, event);
  } catch (error) {
    console.error("Error during post-confirmation process:", error);
    return callback(error.message, event); // Return error to Cognito
  }
};

const sendAdminNotification = async (userEmail, userName, userRole) => {
  // Prepare email parameters for AWS SES
  const emailParams = {
    Source: process.env.ADMIN_EMAIL, // Sender email (must be verified in SES)
    Destination: {
      ToAddresses: [process.env.ADMIN_EMAIL], // Admin email to receive the notification
    },
    Message: {
      Subject: {
        Data: `New User Registered: ${userName}`, // Email subject
      },
      Body: {
        Html: {
          Data: `<p>A new user has registered:</p>
                 <ul>
                   <li><strong>Name:</strong> ${userName}</li>
                   <li><strong>Email:</strong> ${userEmail}</li>
                   <li><strong>Role:</strong> ${userRole}</li>
                 </ul>
                 <p>Please review the user details in the AWS Console.</p>`,
        },
      },
    },
  };

  try {
    // Send the email notification using SES
    await ses.sendEmail(emailParams).promise();
    console.log(`Admin notified about new user: ${userEmail}`);
  } catch (err) {
    console.error("Failed to send admin notification email:", err);
  }
};
