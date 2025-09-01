import DynamoDB from "aws-sdk/clients/dynamodb.js";
import { getTableName } from "./helpers.js";

const DynamoDBClient = new DynamoDB.DocumentClient();

export const createItemInDynamoDB = (
  itemAttributes,
  table,
  expressionAttributes,
  conditionExpression
) => {
  const tableParams = {
    Item: itemAttributes,
    TableName: getTableName(table),
    ExpressionAttributeNames: expressionAttributes,
    ConditionExpression: conditionExpression,
  };

  return DynamoDBClient.put(tableParams).promise();
};

export const createItemOrUpdate = (itemAttributes, table) => {
  const tableParams = {
    Item: itemAttributes,
    TableName: getTableName(table),
  };

  return DynamoDBClient.put(tableParams).promise();
};

export const getItemByQuery = ({
  table,
  KeyConditionExpression,
  ExpressionAttributeNames,
  ExpressionAttributeValues,
  IndexName,
  Limit,
  ExclusiveStartKey,
  ScanIndexForward,
  FilterExpression,
}) => {
  const params = {
    TableName: getTableName(table),
    KeyConditionExpression,
    ExpressionAttributeValues,
  };

  if (ExpressionAttributeNames) {
    params.ExpressionAttributeNames = ExpressionAttributeNames;
  }
  if (IndexName) {
    params.IndexName = IndexName;
  }
  if (Limit) {
    params.Limit = Limit;
  }
  if (ExclusiveStartKey) {
    params.ExclusiveStartKey = ExclusiveStartKey;
  }
  if (ScanIndexForward) {
    params.ScanIndexForward = ScanIndexForward;
  }
  if (FilterExpression) {
    params.FilterExpression = FilterExpression;
  }

  return DynamoDBClient.query(params).promise();
};

export const getItemByIndex = (
  table,
  IndexName,
  KeyConditionExpression,
  ExpressionAttributeNames,
  ExpressionAttributeValues
) => {
  const params = {
    TableName: getTableName(table),
    IndexName,
    KeyConditionExpression,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
  };

  return DynamoDBClient.query(params).promise();
};

export const getItem = (table, Key) => {
  const params = {
    TableName: table,
    Key,
  };
  return DynamoDBClient.get(params).promise();
};

export const writeBatchItems = (table, items) => {
  const params = {
    RequestItems: {
      [getTableName(table)]: items,
    },
  };

  return DynamoDBClient.batchWrite(params).promise();
};

export const batchWriteItems = (tableName, items) => {
  const batches = [];
  const BATCH_SIZE = 25;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const params = {
      RequestItems: {
        [tableName]: batch.map((item) => ({
          PutRequest: { Item: item },
        })),
      },
    };

    return DynamoDBClient.batchWrite(params).promise();
  }
};

export const writeBatchItemsInMultipleTables = (params) => {
  return DynamoDBClient.batchWrite(params).promise();
};

export const getBatchItems = (table, Keys) => {
  const params = {
    RequestItems: {
      [getTableName(table)]: { Keys },
    },
  };

  return DynamoDBClient.batchGet(params).promise();
};

export const scan = (params) => {
  params.TableName = getTableName(params.TableName);
  return DynamoDBClient.scan(params).promise();
};

export const describeTable = (params) => {
  params.TableName = getTableName(params.TableName);
  return DynamoDBClient.describeTable(params).promise();
};

export const deleteItem = (table, Key) => {
  const params = {
    TableName: getTableName(table),
    Key,
    ReturnValues: "ALL_OLD",
  };

  return DynamoDBClient.delete(params).promise();
};

export const updateItemInDynamoDB = ({
  table,
  Key,
  UpdateExpression,
  ExpressionAttributeValues,
  ReturnValues,
  ExpressionAttributeNames,
  ConditionExpression,
}) => {
  const params = {
    TableName: getTableName(table),
    Key,
    UpdateExpression,
    ExpressionAttributeValues,
    ReturnValues: ReturnValues || "ALL_NEW",
  };

  if (ExpressionAttributeNames) {
    params.ExpressionAttributeNames = ExpressionAttributeNames;
  }
  if (ConditionExpression) {
    params.ConditionExpression = ConditionExpression;
  }

  return DynamoDBClient.update(params).promise();
};

export const transactWriteInDynamoDB = (items) => {
  return DynamoDBClient.transactWrite(items).promise();
};

export const fetchAllItemByDynamodbIndex = async ({
  TableName,
  IndexName,
  KeyConditionExpression,
  ExpressionAttributeValues,
  FilterExpression = null,
  ExpressionAttributeNames = null,
  Limit = null,
  CountOnly = false, // Add a new parameter to specify if we want only the count
}) => {
  let lastEvaluatedKey;
  let totalCount = 0;
  const allItems = [];

  try {
    do {
      const params = {
        TableName,
        IndexName,
        KeyConditionExpression,
        ExpressionAttributeValues,
        ExclusiveStartKey: lastEvaluatedKey,
        ScanIndexForward: true,
      };

      if (FilterExpression) {
        params.FilterExpression = FilterExpression;
      }

      if (ExpressionAttributeNames) {
        params.ExpressionAttributeNames = ExpressionAttributeNames;
      }

      if (Limit) {
        params.Limit = Limit;
      }

      if (CountOnly) {
        params.Select = "COUNT"; // Only fetch the count if CountOnly is true
      }

      const response = await DynamoDBClient.query(params).promise();

      if (CountOnly) {
        // Increment the total count from each page
        totalCount += response.Count;
      } else {
        // Accumulate all the items
        allItems.push(...response.Items);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.error("Failed to fetch items:", error);
    throw new Error("Error fetching items from DynamoDB");
  }

  return CountOnly ? totalCount : allItems; // Return totalCount or allItems based on CountOnly
};

export const fetchItemsByIds = async (table, ids, keyName) => {
  const keys = ids.map((id) => ({ [keyName]: id })); // Map IDs to expected key structure
  const params = {
    RequestItems: {
      [table]: {
        Keys: keys,
      },
    },
  };
  try {
    const result = await DynamoDBClient.batchGet(params).promise();
    return result.Responses[table] || [];
  } catch (error) {
    console.error("Error fetching items by IDs:", error);
    return [];
  }
};

export const getNextBlogId = async (table) => {
  const params = {
    TableName: getTableName(table),
    Key: { id: "BLOG_COUNTER" },
    UpdateExpression: "SET #count = if_not_exists(#count, :start) + :incr",
    ExpressionAttributeNames: {
      "#count": "count"
    },
    ExpressionAttributeValues: {
      ":incr": 1,
      ":start": 0
    },
    ReturnValues: "UPDATED_NEW"
  };

  try {
    const result = await DynamoDBClient.update(params).promise();
    const count = result.Attributes.count;
    return `#${count.toString().padStart(2, '0')}`;
  } catch (error) {
    console.error("Error getting next blog ID:", error);
    throw new Error("Failed to generate blog ID");
  }
};

export const getCurrentBlogCounter = async (table) => {
  const params = {
    TableName: getTableName(table),
    Key: { id: "BLOG_COUNTER" }
  };

  try {
    const result = await DynamoDBClient.get(params).promise();
    if (result.Item && result.Item.count) {
      return result.Item.count;
    }
    return 0;
  } catch (error) {
    console.error("Error getting current blog counter:", error);
    return 0;
  }
};
