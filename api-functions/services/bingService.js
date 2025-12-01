import axios from "axios";
import { delay } from "../helpers/helpers.js";

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SERPAPI_URL = "https://serpapi.com/search";

export async function getBingMetrics(queries) {
  const batchSize = 3; // Number of queries per batch
  const results = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize); // Get the next batch of 3 queries

    // Process the current batch
    const batchResults = await Promise.all(
      batch.map(async (query) => {
        try {
          const params = {
            engine: "bing",
            q: query,
            api_key: SERPAPI_KEY,
          };
          console.log("params", params);
          const response = await axios.get(SERPAPI_URL, { params });
          console.log("response", response.data);

          // SerpApi does not provide webPages.totalEstimatedMatches
          const totalMatches = response.data.organic_results?.length || 0; // closest alternative
          console.log("totalMatches", "query", totalMatches, query);
          return {
            query,
            totalEstimatedMatches: totalMatches,
          };
        } catch (error) {
          console.error(
            `Error fetching Bing data for query "${query}":`,
            error.message
          );
          return { query, totalEstimatedMatches: 100000 }; // Fallback for errors
        }
      })
    );

    results.push(...batchResults); // Add the results to the overall results array
    console.log(`Processed batch:`, batch);

    // Wait for 1 second before processing the next batch, unless this is the last batch
    if (i + batchSize < queries.length) {
      await delay(1000);
    }
  }

  return results;
}
