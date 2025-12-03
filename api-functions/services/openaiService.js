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
  ],
  api_integration_with_upstream_downstream_systems: [
    "Yes but limited",
    "No",
    "Limited",
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
    "3 Windows", // Only Windows
    "DoesNotMatter",
  ],
  ai_capabilities: ["Yes", "No", "Limited"],
  support_import_export_formats: ["Yes", "No", "Limited functionality"],
};

export async function fillMissingFields(tool, missingFields) {
  if (missingFields.length === 0) {
    return {};
  }

  try {
    // Construct validation rules for missing fields
    const validationRules = missingFields
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

Goal: Fill in as many missing fields as possible with accurate information.

Missing fields that need information: ${missingFields.join(", ")}

Return a JSON object with these fields. Try to provide a value for every field.
${missingFields.map((f) => `- ${f}`).join("\n")}

STRICT VALIDATION RULES (You MUST select the best matching value from these lists for the respective fields):
${validationRules}

Context about the tool:
- Name: ${tool.tool_name || "N/A"}
- Category: ${tool.category_name || "N/A"}
- URL: ${tool.home_page_url || "N/A"}
- Price: ${tool.price || "N/A"}
- Features: ${
      Array.isArray(tool.core_features)
        ? tool.core_features.join(", ")
        : "N/A"
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
4. For text fields, provide a concise and accurate description.
5. "core_features" MUST be a JSON array of strings (e.g., ["Feature 1", "Feature 2"]).
6. IMPORTANT: For fields with numeric options (e.g., 1, 2, 3), return them as NUMBERS (integers), NOT strings. Example: "deployment_options_on_prem_or_saas": 2
7. Only return the JSON object.`;

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

    const content = response.choices[0]?.message?.content?.trim() || "";
    
    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const data = JSON.parse(jsonStr);

    const result = {};
    missingFields.forEach((field) => {
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
