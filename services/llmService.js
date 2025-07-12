const Groq = require('groq-sdk');

// Ensure your GROQ_API_KEY is properly loaded in your environment.
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Queries the Groq API to extract insights from a dataset based on a user query,
 * ensuring the response is a clean JSON array.
 *
 * @param {Array<Object>} dataset - The dataset to analyze.
 * @param {string} userQuery - The question from the user.
 * @returns {Promise<Array<Object>>} A promise that resolves to a JSON array of insights,
 * or an empty array if parsing fails.
 */
exports.queryData = async (dataset, userQuery) => {
    const prompt = `
You are a data analyst. Given the dataset below, and the question from the user, extract relevant insights in JSON format.

Dataset: ${JSON.stringify(dataset).slice(0, 10000)}

Question: ${userQuery}

IMPORTANT: generate a data which is available on;y in excel file not any additional values and labels.

IMPORTANT: Your response MUST be ONLY a JSON array in the exact format:
[
  { "label": "Label1", "value": 123 },
  { "label": "Label2", "value": 456 }
]
  labels should be short and understandable, values should be numbers.
DO NOT include any other text, commentary, explanations, markdown formatting (like '''json), or any other characters before or after the JSON array. Just the pure JSON array.
`;

    let rawResult = "";
    try {
        const completion = await client.chat.completions.create({
            model: "deepseek-r1-distill-llama-70b",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.6,
            max_completion_tokens: 1024,
            top_p: 0.95,
            stream: true,
        });

        for await (const chunk of completion) {
            rawResult += chunk.choices?.[0]?.delta?.content || "";
        }

        console.log("Raw LLM Response:", rawResult);

        // Remove any <think>...</think> tags and trim whitespace.
        let cleanedResult = rawResult.replace(/<think>.*?<\/think>/gs, '').trim();

        console.log("Cleaned LLM Response (after removing <think> tags):", cleanedResult);

        // Attempt to parse the cleaned result directly.
        try {
            const parsedJson = JSON.parse(cleanedResult);
            console.log("Successfully parsed JSON directly:", parsedJson);
            return parsedJson;
        } catch (directParseError) {
            console.warn("Direct JSON parsing failed. Attempting slice extraction. Error:", directParseError.message);

            // If direct parsing fails, try to extract the JSON array
            // by finding the first '[' and last ']' characters.
            const jsonStart = cleanedResult.indexOf("[");
            const jsonEnd = cleanedResult.lastIndexOf("]");

            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                const jsonString = cleanedResult.slice(jsonStart, jsonEnd + 1);
                console.log("Extracted JSON string via slice:", jsonString);

                // Attempt to parse the extracted JSON string.
                try {
                    const parsedJson = JSON.parse(jsonString);
                    console.log("Successfully parsed JSON after slice extraction:", parsedJson);
                    return parsedJson;
                } catch (sliceParseError) {
                    console.error("Final parsing error: Extracted string was not valid JSON.", sliceParseError.message);
                    console.error("Problematic JSON string:", jsonString);
                    return [];
                }
            } else {
                console.error("Could not find a valid JSON array structure (missing [ or ]).");
                return [];
            }
        }
    } catch (apiError) {
        console.error("Error calling Groq API:", apiError);
        return [];
    }
};