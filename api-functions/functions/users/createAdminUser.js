import { v4 as uuidv4 } from "uuid";
import DynamoDB from "aws-sdk/clients/dynamodb.js";
const DynamoDBClient = new DynamoDB.DocumentClient();

import { sendResponse } from "../../helpers/helpers.js";
import { TABLE_NAME, USER_ROLE, USER_STATUS } from "../../helpers/constants.js";
import {
  addUserToGroup,
  createCognitoUser,
  setTempPasswordForCognitoUser,
} from "../../helpers/auth.js";
import { createItemInDynamoDB } from "../../helpers/dynamodb.js";

export const handler = async (event, context, callback) => {
  let params = JSON.parse(event.body);
  const { COGNITO_USER_POOL_ID } = process.env;

  try {
    const { username, email, password } = params;

    // Validate input
    if (!username || !email || !password || !COGNITO_USER_POOL_ID) {
      return sendResponse(400, "Missing required parameters", false);
    }

    // Prepare UserAttributes for Cognito
    const userAttributes = [
      {
        Name: "email",
        Value: email,
      },
      {
        Name: "name",
        Value: username,
      },
      {
        Name: "email_verified",
        Value: "true",
      },
      {
        Name: "custom:role",
        Value: USER_ROLE.ADMIN,
      },
      {
        Name: "custom:userId",
        Value: uuidv4(),
      },
    ];

    // Create user in Cognito
    const cognitoResponse = await createCognitoUser(
      email,
      userAttributes,
      COGNITO_USER_POOL_ID,
      "SUPPRESS", // Do not send invitation email
      null
    );

    // Set the user password to permanent
    await setTempPasswordForCognitoUser(
      email,
      password,
      true, // Permanent
      COGNITO_USER_POOL_ID
    );

    // Add user to ADMIN group
    await addUserToGroup(email, "Admins", COGNITO_USER_POOL_ID);

    const userItem = {
      id: cognitoResponse.User.Attributes.find(
        (attr) => attr.Name === "custom:userId"
      ).Value,
      cognitoId: cognitoResponse.User.Username,
      email,
      name: username,
      role: USER_ROLE.ADMIN,
      certificateCredits: 0,
      freeQuizCredits: 2,
      unlockedQuizIds: [],
      hasClaimedFreePlan: false,
      status: USER_STATUS.ACTIVE,
    };

    await createItemInDynamoDB(
      userItem,
      TABLE_NAME.USERS,
      { "#id": "id" },
      "attribute_not_exists(#id)",
      false
    );

    return sendResponse(200, "Admin Created Successfully", true);
  } catch (error) {
    return sendResponse(500, "Internal Server Error", error.message);
  }
};
