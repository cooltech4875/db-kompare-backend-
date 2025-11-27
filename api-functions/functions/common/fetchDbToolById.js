import { TABLE_NAME } from "../../helpers/constants.js";
import { getItem } from "../../helpers/dynamodb.js";

// Get database name
export const fetchDbToolById = async (id) => {
  // Validate id before making the query
  if (!id || typeof id !== "string") {
    console.warn(`Invalid id provided to fetchDbToolById: ${id}`);
    return null;
  }

  const key = {
    id,
  };
  try {
    const result = await getItem(TABLE_NAME.DB_TOOLS, key);
    if (result.Item) {
      return result.Item;
    }
    // Item not found (might be deleted) - return null
    console.warn(`DB tool not found (possibly deleted) for ID: ${id}`);
    return null;
  } catch (error) {
    console.error(`Error fetching db tool for ID ${id}:`, error);
    // Return null instead of throwing to prevent breaking the entire process
    return null;
  }
};
