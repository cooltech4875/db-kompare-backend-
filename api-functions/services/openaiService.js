import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ALLOWED_VALUES = {
  access_control: ["Yes", "No", "Limited", "DoesNotMatter"],
  version_control: ["Yes", "No", "DoesNotMatter"],
  support_for_workflow: ["Yes", "No", "DoesNotMatter"],
  web_access: ["Yes", "No", "DoesNotMatter"],
  deployment_options_on_prem_or_saas: [
    1, // On-Prem
    2, // SaaS on Cloud
    3, // On-prem and SaaS options available
    "DoesNotMatter",
  ],
  free_community_edition: [
    1, // Open source
    2, // Apache
    3, // Community edition
    4, // Commercial / trial 14 days
    "DoesNotMatter",
  ],
  authentication_protocol_supported: [
    1, // Userid / pwd
    2, // Api token
    3, // Kerberos
    4, // All
    "DoesNotMatter",
  ],
  api_integration_with_upstream_downstream_systems: [
    "Yes but limited",
    "No",
    "Limited",
    "DoesNotMatter",
  ],
  user_created_tags_comments: [
    "DoesNotMatter",
    "Yes",
    "No",
    "LimitedFunctionality",
  ],
  customization_possible: [
    "Yes",
    "No",
    "Limited functionality",
    "DoesNotMatter",
  ],
  modern_ways_of_deployment: [
    1, // Kubernetes
    2, // Docker Containers
    3, // Only Windows
    "DoesNotMatter",
  ],
  ai_capabilities: ["Yes", "No", "Limited"],
  support_import_export_formats: ["Yes", "No", "Limited functionality"],
};

export async function populateDbToolFields(tool, fieldsToPopulate) {
  if (fieldsToPopulate.length === 0) {
    return {};
  }

  try {
    // Construct validation rules for fields to populate
    const validationRules = fieldsToPopulate
      .map((field) => {
        if (ALLOWED_VALUES[field]) {
          return `- ${field}: Must be one of [${ALLOWED_VALUES[field]
            .map((v) => (typeof v === "string" ? `"${v}"` : v))
            .join(", ")}]`;
        }
        return null;
      })
      .filter(Boolean)
      .join("\n");

    const prompt = `You are a database tool expert. Provide accurate information for ${
      tool.tool_name || "this database tool"
    }.

Goal: Populate as many of the following fields as possible with accurate information.

Fields that need information: ${fieldsToPopulate.join(", ")}

Return a JSON object with these fields. Try to provide a value for every field.
${fieldsToPopulate.map((f) => `- ${f}`).join("\n")}

STRICT VALIDATION RULES (You MUST select the best matching value from these lists for the respective fields):
${validationRules}

Context about the tool:
- Name: ${tool.tool_name || "N/A"}
- Category: ${tool.category_name || "N/A"}
- URL: ${tool.home_page_url || "N/A"}
- Price: ${tool.price || "N/A"}
- Features: ${
      Array.isArray(tool.core_features) ? tool.core_features.join(", ") : "N/A"
    }
- AI Capabilities: ${tool.ai_capabilities || "N/A"}
- Customization: ${tool.customization_possible || "N/A"}
- Deployment Options: ${tool.deployment_options_on_prem_or_saas || "N/A"}
- Free Community Edition: ${tool.free_community_edition || "N/A"}
- Access Control: ${tool.access_control || "N/A"}
- Version Control: ${tool.version_control || "N/A"}
- Web Access: ${tool.web_access || "N/A"}
- Support for Workflow: ${tool.support_for_workflow || "N/A"}
- Import/Export Formats: ${tool.support_import_export_formats || "N/A"}

Instructions:
1. For each field, provide the most accurate value based on your knowledge.
2. For dropdown fields (listed in VALIDATION RULES), you MUST choose one of the provided options.
3. If you are unsure about a dropdown field, choose the option that best fits or a default like "DoesNotMatter" / "Limited" if applicable. Do not leave it empty if a reasonable guess can be made.
4. For text fields, provide a clear and informative description, not just a short phrase.
5. For "tool_description", write **exactly 5 full sentences** in this order: (1) brief history with year of launch and year it gained popularity, and clearly state if it is a rework/re-skin of an older tool; (2) key algorithm or processing approach driving its success; (3) key architecture or design pattern driving its success; (4) the best business problem it solves, explained with a simple layman example that a business student can understand; (5) the latest important features released in the last 12 months. **Number these sentences explicitly as "1) ...", "2) ...", "3) ...", "4) ...", "5) ..." at the start of each sentence. Start the value directly with "1) ...", and then prefix only sentences 2–5 with a newline character (\\n2) ..., \\n3) ..., etc.) so that 2–5 each start on their own line.** Each sentence MUST end with a period and be clearly separated.
6. For "price", write **3-5 full sentences** explaining the pricing model in detail, including: (a) whether it is open source and under which license; (b) what commercial / hosted / enterprise options exist; (c) how customers are typically billed (per user/month, usage-based, etc.); and (d) total cost-of-ownership considerations for small teams vs enterprises. **Number these sentences explicitly as "1) ...", "2) ...", "3) ...", "4) ...", "5) ..." (or up to the number of sentences you use) at the start of each sentence. Start the value directly with "1) ...", and then prefix only sentences 2+ with a newline character (\\n2) ..., \\n3) ..., etc.) so that subsequent points start on new lines.** Do NOT respond with a short fragment like "Open source / Free" – always use multiple full sentences.
7. For "dbkompare_view", write an **8-line tech critique** in this exact format, one numbered sentence per line:
   1) Best architectural point.
   2) Business problem most suited, with a layman example understood by business students.
   3) Where it fails repeatedly in practice, with a layman example understood by business students.
   4) How those failures have been addressed recently, with a layman example understood by business students.
   5) Typical size / scale limits (data volume, concurrency, workload patterns).
   6) Forecast of the tool over the next 2 years (technical and market position).
   7) Other alternative tools if those failures are a big concern.
   8) Pricing pressure and proposed big architectural changes over the next 2 years, plus 3 reference links used for this critique focused on failures/limitations from non-vendor sources and 2 reference links on pricing pressure and roadmap for the next 2 years by this vendor. Format these 5 links as HTML anchors like <a href="https://example.com" target="_blank">label</a> so they are clickable in a new page, and insert a newline character (\\n) before each anchor so every hyperlink appears on its own line.
   All lines MUST be numbered 1) to 8), each a full sentence ending with a period, and separated by newline characters (\\n) so every numbered point starts on a new line. Apart from the HTML anchor tags for links, all other text must be plain text (no additional HTML).
8. "core_features" MUST be a JSON array of strings (e.g., ["Feature 1", "Feature 2"]).
9. If "useful_links" is requested, ALWAYS return a JSON array of 3-5 relevant URLs as strings (e.g., docs, GitHub repo, official site, community forum). Do not leave "useful_links" empty if you can infer good links.
10. IMPORTANT: For fields with numeric options (e.g., 1, 2, 3), return them as NUMBERS (integers), NOT strings. Example: "deployment_options_on_prem_or_saas": 2
11. Only return the JSON object.`;

    console.log("[OpenAI Service] Sending request to OpenAI API");
    console.log("[OpenAI Service] Model: gpt-4o-mini");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that provides accurate information about database tools. Return only valid JSON without markdown formatting. Try to fill all requested fields with the best available information or reasonable defaults from the provided options.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    console.log("[OpenAI Service] OpenAI API response received");
    console.log(
      "[OpenAI Service] Response choices count:",
      response.choices?.length || 0
    );

    const content = response.choices[0]?.message?.content?.trim() || "";

    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    console.log("[OpenAI Service] Cleaned JSON string length:", jsonStr.length);
    const data = JSON.parse(jsonStr);
    console.log(
      "[OpenAI Service] Parsed JSON data:",
      JSON.stringify(data, null, 2)
    );

    const result = {};
    fieldsToPopulate.forEach((field) => {
      // Check if field exists in response (even if null/undefined)
      if (field in data) {
        const value = data[field];
        // Only include non-null, non-empty values
        if (value !== null && value !== undefined && value !== "") {
          result[field] = value;
        }
      }
    });

    return result;
  } catch (error) {
    console.error(
      `[OpenAI Service] Error for ${tool.tool_name}:`,
      error.message
    );
    return {};
  }
}

// Backwards-compatible aliases (if any other code still imports old names)
export const fillMissingDbToolFields = populateDbToolFields;
export const fillMissingFields = populateDbToolFields;

export async function populateDatabaseFields(database, fieldsToPopulate) {
  if (fieldsToPopulate.length === 0) {
    return {};
  }

  try {
    const prompt = `You are a database expert. Provide accurate information for the database "${
      database.name || "this database"
    }".

Goal: Populate as many of the following fields as possible with accurate information.

Fields that need information: ${fieldsToPopulate.join(", ")}

Return a JSON object with these fields. Try to provide a value for every field.
${fieldsToPopulate.map((f) => `- ${f}`).join("\n")}

Context about the database:
- Name: ${database.name || "N/A"}
- Description: ${database.description || "N/A"}
- Developer: ${database.developer || "N/A"}
- Initial Release: ${database.initial_release || "N/A"}

Instructions:
1. For each field, provide the most accurate value based on your knowledge.
2. For text fields, provide a clear and informative description, not just a short phrase, and break it into proper sentences.
3. If you are asked to populate the "description" field for a database, write **exactly 5 full sentences** in this order: (1) brief history with year of launch and year it gained popularity, and clearly state if it is a rework/re-skin of an older system; (2) key algorithm or processing approach driving its success (e.g., MPP, cost-based optimizer, vectorization); (3) key architecture or storage/compute design driving its success; (4) the best business problem it solves, explained with a simple layman example that a business student can understand; (5) the latest important features released in the last 12 months. **Number these sentences explicitly as "1) ...", "2) ...", "3) ...", "4) ...", "5) ..." at the start of each sentence. Start the value directly with "1) ...", and then prefix only sentences 2–5 with a newline character (\\n2) ..., \\n3) ..., etc.) so that 2–5 each start on their own line.** Each sentence MUST end with a period and be clearly separated.
4. For "db_kompare_view", write an **8-line tech critique** in this exact format, one numbered sentence per line:
   1) Best architectural point.
   2) Business problem most suited, with a layman example understood by business students.
   3) Where it fails repeatedly in practice, with a layman example understood by business students.
   4) How those failures have been addressed recently, with a layman example understood by business students.
   5) Typical size / scale limits (data volume, concurrency, workload patterns).
   6) Forecast of the database over the next 2 years (technical and market position).
   7) Other alternative databases / tools if those failures are a big concern.
   8) Pricing pressure and proposed big architectural changes over the next 2 years, plus 3 reference links used for this critique focused on failures/limitations from non-vendor sources and 2 reference links on pricing pressure and roadmap for the next 2 years by this vendor. Format these 5 links as HTML anchors like <a href="https://example.com" target="_blank">label</a> so they are clickable in a new page, and insert a newline character (\\n) before each anchor so every hyperlink appears on its own line.
   All lines MUST be numbered 1) to 8), each a full sentence ending with a period, and separated by newline characters (\\n) so every numbered point starts on a new line. Apart from the HTML anchor tags for links, all other text must be plain text (no additional HTML).
5. For fields that require lists (e.g., supported_programming_languages, server_operating_systems, apis_and_other_access_methods, dbaas_offerings, implementation_language, partitioning_methods, queries, replication_methods, secondary_database_models), return a JSON array of strings.
6. For boolean-like fields (e.g., "yes"/"no"), use "yes" or "no" as strings (lowercase) unless the field implies a more complex answer.
7. Only return the JSON object.`;

    console.log("[OpenAI Service] Sending request to OpenAI API for Database");
    console.log("[OpenAI Service] Model: gpt-4o-mini");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that provides accurate information about databases. Return only valid JSON without markdown formatting. Try to fill all requested fields with the best available information.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    console.log("[OpenAI Service] OpenAI API response received");
    const content = response.choices[0]?.message?.content?.trim() || "";

    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    console.log("[OpenAI Service] Cleaned JSON string length:", jsonStr.length);
    const data = JSON.parse(jsonStr);
    console.log(
      "[OpenAI Service] Parsed JSON data:",
      JSON.stringify(data, null, 2)
    );

    const result = {};
    fieldsToPopulate.forEach((field) => {
      if (field in data) {
        const value = data[field];
        if (value !== null && value !== undefined && value !== "") {
          result[field] = value;
        }
      }
    });

    return result;
  } catch (error) {
    console.error(
      `[OpenAI Service] Error for database ${database.name}:`,
      error.message
    );
    return {};
  }
}

// Backwards-compatible alias for old name
export const fillMissingDatabaseFields = populateDatabaseFields;
