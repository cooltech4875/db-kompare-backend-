import { TABLE_NAME } from "../../helpers/constants.js";
import { createItemOrUpdate } from "../../helpers/dynamodb.js";
import { sendResponse } from "../../helpers/helpers.js";
import { fetchAllDummyUsers } from "../../helpers/leaderboard.js";

/**
 * Shuffle dummy leaderboard entries by randomizing their XP values
 * This function is called weekly via cron job to randomize dummy user XP
 */
export const handler = async (event) => {
  try {
    const dummyItems = await fetchAllDummyUsers();

    if (dummyItems.length === 0) {
      console.log("No dummy users found. Creating initial dummy users.");
      await createInitialDummyUsers();
      return sendResponse(200, "Initial dummy users created successfully", {
        shuffled: 0,
        created: 25,
      });
    }

    // Randomize XP values for each dummy user
    const updatePromises = dummyItems.map((item) => {
      // Generate random XP between 50 and 500
      const randomXP = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
      const now = new Date().toISOString();

      const updatedItem = {
        ...item,
        value: randomXP,
        lastUpdate: now,
      };

      return createItemOrUpdate(updatedItem, TABLE_NAME.USER_ACHIEVEMENTS);
    });

    await Promise.all(updatePromises);

    console.log(`Successfully shuffled ${dummyItems.length} dummy users`);

    return sendResponse(200, "Dummy leaderboard shuffled successfully", {
      shuffled: dummyItems.length,
    });
  } catch (error) {
    console.error("Error shuffling dummy leaderboard:", error);
    return sendResponse(500, "Failed to shuffle dummy leaderboard", error.message || error);
  }
};

/**
 * Create initial dummy users if none exist
 * Creates 25 dummy users with random names and XP values
 */
const createInitialDummyUsers = async () => {
  const dummyNames = [
    "Alex Johnson",
    "Sarah Chen",
    "Michael Brown",
    "Emily Davis",
    "David Wilson",
    "Jessica Martinez",
    "Christopher Lee",
    "Amanda Taylor",
    "James Anderson",
    "Lisa Garcia",
    "Robert Smith",
    "Maria Rodriguez",
    "Daniel White",
    "Jennifer Lopez",
    "William Thompson",
    "Ashley Moore",
    "Matthew Harris",
    "Nicole Jackson",
    "Ryan Clark",
    "Stephanie Lewis",
    "Kevin Walker",
    "Michelle Hall",
    "Jason Young",
    "Rachel King",
    "Brandon Wright",
  ];

  const dummyUsers = dummyNames.map((name, index) => {
    const randomXP = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
    const now = new Date().toISOString();
    const userId = `DUMMY_${String(index + 1).padStart(3, "0")}`;

    return {
      userId,
      sortKey: "DUMMY_USER",
      value: randomXP,
      name,
      lastUpdate: now,
      createdAt: now,
    };
  });

  const createPromises = dummyUsers.map((user) =>
    createItemOrUpdate(user, TABLE_NAME.USER_ACHIEVEMENTS)
  );

  await Promise.all(createPromises);
  console.log("Created 25 initial dummy users");
};

