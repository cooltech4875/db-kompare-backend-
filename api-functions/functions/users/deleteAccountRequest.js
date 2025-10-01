import AWS from "aws-sdk";
import { sendResponse } from "../../helpers/helpers.js";
import { fetchAllItemByDynamodbIndex } from "../../helpers/dynamodb.js";
import { TABLE_NAME } from "../../helpers/constants.js";

const ses = new AWS.SES({ region: process.env.AWS_REGION || "eu-west-1" });

export const handler = async (event) => {
  try {
    const { email, reason, additionalInfo, requestType } = JSON.parse(event.body);

    // Validate required fields
    if (!email || !reason || !requestType) {
      return sendResponse(400, "Missing required fields: email, reason, and requestType are required");
    }

    // Validate request type
    if (requestType !== "account_deletion") {
      return sendResponse(400, "Invalid request type. Must be 'account_deletion'");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendResponse(400, "Invalid email format");
    }

    // Check if account exists by email (GSI: byEmail)
    const userCount = await fetchAllItemByDynamodbIndex({
      TableName: TABLE_NAME.USERS,
      IndexName: "byEmail",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": email,
      },
      CountOnly: true,
    });
    if (userCount === 0) {
      return sendResponse(404, "Account not found");
    }

    // Send confirmation email to user
    const userEmailParams = {
      Source: process.env.SOURCE_EMAIL,
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: "Account Deletion Request Received - DB Kompare",
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: `Dear User,\n\nWe have received your account deletion request. Your request will be processed within the next 24 to 48 hours.\n\nRequest Details:\n- Email: ${email}\n- Reason: ${reason}\n- Additional Info: ${additionalInfo || "None provided"}\n- Request Type: ${requestType}\n\nIf you have any questions or need to modify your request, please contact us at info@dbkompare.com.\n\nBest regards,\nDB Kompare Team`,
            Charset: "UTF-8",
          },
          Html: {
            Data: `
              <html>
                <body>
                  <h2>Account Deletion Request Received</h2>
                  <p>Dear User,</p>
                  <p>We have received your account deletion request. Your request will be processed within the next 24 to 48 hours.</p>
                  
                  <h3>Request Details:</h3>
                  <ul>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Reason:</strong> ${reason}</li>
                    <li><strong>Additional Info:</strong> ${additionalInfo || "None provided"}</li>
                    <li><strong>Request Type:</strong> ${requestType}</li>
                  </ul>
                  
                  <p>If you have any questions or need to modify your request, please contact us at <a href="mailto:info@dbkompare.com">info@dbkompare.com</a>.</p>
                  
                  <p>Best regards,<br>DB Kompare Team</p>
                </body>
              </html>
            `,
            Charset: "UTF-8",
          },
        },
      },
    };

    // Send notification email to admin
    const adminEmailParams = {
      Source: process.env.SOURCE_EMAIL,
      Destination: {
        ToAddresses: [process.env.ADMIN_EMAIL],
      },
      Message: {
        Subject: {
          Data: `Account Deletion Request - ${email}`,
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: `A new account deletion request has been received:\n\nUser Details:\n- Email: ${email}\n- Reason: ${reason}\n- Additional Info: ${additionalInfo || "None provided"}\n- Request Type: ${requestType}\n\nPlease process this request within 24-48 hours.\n\nBest regards,\nDB Kompare System`,
            Charset: "UTF-8",
          },
          Html: {
            Data: `
              <html>
                <body>
                  <h2>Account Deletion Request Received</h2>
                  <p>A new account deletion request has been received:</p>
                  
                  <h3>User Details:</h3>
                  <ul>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Reason:</strong> ${reason}</li>
                    <li><strong>Additional Info:</strong> ${additionalInfo || "None provided"}</li>
                    <li><strong>Request Type:</strong> ${requestType}</li>
                  </ul>
                  
                  <p><strong>Action Required:</strong> Please process this request within 24-48 hours.</p>
                  
                  <p>Best regards,<br>DB Kompare System</p>
                </body>
              </html>
            `,
            Charset: "UTF-8",
          },
        },
      },
    };

    // Send both emails
    const [userEmailResult, adminEmailResult] = await Promise.all([
      ses.sendEmail(userEmailParams).promise(),
      ses.sendEmail(adminEmailParams).promise(),
    ]);

    console.log("User email sent:", userEmailResult.MessageId);
    console.log("Admin email sent:", adminEmailResult.MessageId);

    return sendResponse(200, "Account deletion request submitted successfully. You will receive a confirmation email shortly.", {
      userEmailMessageId: userEmailResult.MessageId,
      adminEmailMessageId: adminEmailResult.MessageId,
    });

  } catch (error) {
    console.error("Error processing account deletion request:", error);
    
    // Handle specific AWS SES errors
    if (error.code === 'MessageRejected') {
      return sendResponse(400, "Email service configuration error. Please contact support.");
    } else if (error.code === 'AccessDenied') {
      return sendResponse(500, "Service temporarily unavailable. Please try again later.");
    } else if (error.name === 'ValidationError') {
      return sendResponse(400, error.message);
    }
    
    return sendResponse(500, "Internal server error. Please try again later.");
  }
};
