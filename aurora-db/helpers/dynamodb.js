import {
  DynamoDBClient,
  DescribeTableCommand, // For describeTable only
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { getTableName } from "./helpers.js";

// 1) Create the low-level client:
const ddbClient = new DynamoDBClient({ region: "eu-west-1" });

// 2) Wrap it with DynamoDBDocument for high-level operations:
const docClient = DynamoDBDocument.from(ddbClient);

/**
 * Create a new item in DynamoDB.
 */
export const createItemInDynamoDB = async (
  itemAttributes,
  table,
  expressionAttributes,
  conditionExpression
) => {
  const params = {
    TableName: getTableName(table),
    Item: itemAttributes,
  };

  if (expressionAttributes) {
    params.ExpressionAttributeNames = expressionAttributes;
  }
  if (conditionExpression) {
    params.ConditionExpression = conditionExpression;
  }

  return await docClient.put(params);
};

/**
 * Create or update an item in DynamoDB.
 */
export const createItemOrUpdate = async (itemAttributes, table) => {
  const params = {
    TableName: getTableName(table),
    Item: itemAttributes,
  };
  return await docClient.put(params);
};

/**
 * Query items from DynamoDB using various conditions.
 */
export const getItemByQuery = async ({
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
  if (ScanIndexForward !== undefined) {
    params.ScanIndexForward = ScanIndexForward;
  }
  if (FilterExpression) {
    params.FilterExpression = FilterExpression;
  }

  return await docClient.query(params);
};

/**
 * Query by a specific index.
 */
export const getItemByIndex = async (
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

  return await docClient.query(params);
};

/**
 * Get a single item by primary key.
 */
export const getItem = async (table, Key) => {
  const params = {
    TableName: getTableName(table),
    Key,
  };
  return await docClient.get(params);
};

/**
 * Write multiple items (batch) in a single table.
 */
export const writeBatchItems = async (table, items) => {
  const params = {
    RequestItems: {
      [getTableName(table)]: items, // items must be an array of PutRequest / DeleteRequest objects
    },
  };
  return await docClient.batchWrite(params);
};

/**
 * Batch write items with an internal loop to handle >25 items.
 */
export const batchWriteItems = async (tableName, items) => {
  const batches = [];
  const BATCH_SIZE = 25;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  // Process each batch sequentially
  for (const batch of batches) {
    const params = {
      RequestItems: {
        [tableName]: batch.map((item) => ({
          PutRequest: { Item: item },
        })),
      },
    };

    await docClient.batchWrite(params);
  }
};

/**
 * Write batch items spanning multiple tables.
 */
export const writeBatchItemsInMultipleTables = async (params) => {
  // params = { RequestItems: { TableName1: [...], TableName2: [...] }}
  return await docClient.batchWrite(params);
};

/**
 * Batch get items from a table given multiple keys.
 */
export const getBatchItems = async (table, Keys) => {
  const params = {
    RequestItems: {
      [getTableName(table)]: { Keys },
    },
  };

  return await docClient.batchGet(params);
};

/**
 * Perform a table scan.
 */
export const scan = async (params) => {
  params.TableName = getTableName(params.TableName);
  return await docClient.scan(params);
};

/**
 * Describe a DynamoDB table.
 * (Must use the low-level client + command, as docClient doesn't expose describeTable.)
 */
export const describeTable = async (params) => {
  params.TableName = getTableName(params.TableName);
  const command = new DescribeTableCommand(params);
  return await ddbClient.send(command);
};

/**
 * Delete an item by primary key.
 */
export const deleteItem = async (table, Key) => {
  const params = {
    TableName: getTableName(table),
    Key,
    ReturnValues: "ALL_OLD",
  };

  return await docClient.delete(params);
};

/**
 * Update an item in DynamoDB.
 */
export const updateItemInDynamoDB = async ({
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

  return await docClient.update(params);
};

/**
 * Perform a DynamoDB TransactWrite operation.
 * params = { TransactItems: [ ... ] }
 */
export const transactWriteInDynamoDB = async (params) => {
  return await docClient.transactWrite(params);
};

/**
 * Fetch all items by a particular DynamoDB index, paging through until all items are collected.
 */
export const fetchAllItemByDynamodbIndex = async ({
  TableName,
  IndexName,
  KeyConditionExpression,
  ExpressionAttributeValues,
  FilterExpression = null,
  ExpressionAttributeNames = null,
  Limit = null,
  CountOnly = false, // If true, just accumulate count instead of returning items
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

      const response = await docClient.query(params);

      if (CountOnly) {
        totalCount += response.Count;
      } else {
        allItems.push(...(response.Items || []));
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.error("Failed to fetch items:", error);
    throw new Error("Error fetching items from DynamoDB");
  }

  return CountOnly ? totalCount : allItems;
};

/**
 * Fetch multiple items by IDs, given a key name.
 */
export const fetchItemsByIds = async (table, ids, keyName) => {
  const keys = ids.map((id) => ({ [keyName]: id }));
  const params = {
    RequestItems: {
      [table]: {
        Keys: keys,
      },
    },
  };

  try {
    const result = await docClient.batchGet(params);
    return result.Responses?.[table] || [];
  } catch (error) {
    console.error("Error fetching items by IDs:", error);
    return [];
  }
};

export const fetchAllItemsByScan = async ({
  TableName,
  FilterExpression = null,
  ExpressionAttributeNames = null,
  ExpressionAttributeValues = null,
}) => {
  let lastEvaluatedKey;
  const allItems = [];

  try {
    do {
      const params = {
        TableName,
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      if (FilterExpression) {
        params.FilterExpression = FilterExpression;
      }

      if (ExpressionAttributeNames) {
        params.ExpressionAttributeNames = ExpressionAttributeNames;
      }

      if (ExpressionAttributeValues) {
        params.ExpressionAttributeValues = ExpressionAttributeValues;
      }

      const response = await docClient.scan(params);
      allItems.push(...(response.Items || []));
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.error("Failed to scan items:", error);
    throw new Error("Error scanning items from DynamoDB");
  }

  return allItems;
};
