import axios from "axios";
import { delay } from "../helpers/helpers.js";

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SERPAPI_URL = "https://serpapi.com/search";

export async function getBingMetrics(queries) {
  if (!queries || !Array.isArray(queries) || queries.length === 0) {
    console.warn("getBingMetrics: No queries provided");
    return [];
  }

  const batchSize = 3; // Number of queries per batch
  const results = [];

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize); // Get the next batch of 3 queries

    // Process the current batch
    const batchResults = await Promise.all(
      batch.map(async (query) => {
        try {
          if (!query || typeof query !== "string") {
            console.warn(`Invalid query: ${query}`);
            return { query: query || "", totalEstimatedMatches: 0 };
          }

          const params = {
            engine: "bing",
            q: query,
            api_key: SERPAPI_KEY,
          };
          console.log("params", params);

          const response = await axios.get(SERPAPI_URL, { params });
          console.log("response status:", response.status);
          console.log(
            "response data keys:",
            response.data ? Object.keys(response.data) : "no data"
          );

          // SerpApi does not provide webPages.totalEstimatedMatches
          // Check for organic_results in the response
          let totalMatches = 0;
          if (response.data && response.data.organic_results) {
            totalMatches = Array.isArray(response.data.organic_results)
              ? response.data.organic_results.length
              : 0;
          } else if (response.data && response.data.webPages) {
            // Fallback: try to get totalEstimatedMatches from webPages if available
            totalMatches = response.data.webPages.totalEstimatedMatches || 0;
          }

          console.log("totalMatches", "query", totalMatches, query);

          const result = {
            query,
            totalEstimatedMatches: totalMatches || 0,
          };

          return result;
        } catch (error) {
          console.error(
            `Error fetching Bing data for query "${query}":`,
            error.message,
            error.response?.data || error.response?.status
          );
          return {
            query: query || "",
            totalEstimatedMatches: 100000, // Fallback for errors
          };
        }
      })
    );

    // Filter out any undefined results and add to results array
    const validResults = batchResults.filter(
      (result) => result && result.query !== undefined
    );
    results.push(...validResults);
    console.log(`Processed batch:`, batch, `Results:`, validResults.length);

    // Wait for 1 second before processing the next batch, unless this is the last batch
    if (i + batchSize < queries.length) {
      await delay(1000);
    }
  }

  console.log(
    `getBingMetrics: Returning ${results.length} results for ${queries.length} queries`
  );
  return results;
}
