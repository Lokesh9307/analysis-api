const Groq = require('groq-sdk');

// Ensure your GROQ_API_KEY is properly loaded in your environment.
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Queries the Groq API to extract insights from a dataset based on a user query and chart type,
 * ensuring the response is a clean JSON object with data, summary, and reasoning.
 *
 * @param {Array<Object>} dataset - The dataset to analyze.
 * @param {string} userQuery - The question from the user.
 * @param {string} chartType - The type of chart for which to prepare the data.
 * @returns {Promise<Object>} A promise that resolves to a JSON object with 'data' (array), 'summary' (string), and 'reasoning' (string),
 * or {data: [], summary: '', reasoning: ''} if parsing fails.
 */
exports.queryData = async (dataset, userQuery, chartType) => {
    const systemPrompt = `
You are an expert data analyst simulating a real person's analytical thought process. Given the dataset, user query, and chart type, perform an in-depth analysis including:

- Filtering and grouping based on the query.
- Aggregations (sum, average, median, count, min, max, standard deviation, percentiles).
- Identifying correlations, trends, and outliers.
- Performing necessary calculations or statistical insights (e.g., growth rates, percentages, ratios).
- Ensuring all results are strictly derived from the dataset without inventing data or labels.

Prepare the data in a format suitable for the chart type:
- For 'pie' or 'doughnut': [{"label": "Category1", "value": 123}, {"label": "Category2", "value": 456}]
- For 'bar' or 'column': Similar to pie, or multi-series if applicable.
- For 'line' or 'area': [{"x": "Date1", "y": 123}, {"x": "Date2", "y": 456}], or multi-series.
- For 'scatter' or 'bubble': [{"x": 1, "y": 123}, {"x": 2, "y": 456}]
- For multi-series charts: [{"series": "Series1", "data": [{"label": "Cat1", "value": 123}, ...]}, {"series": "Series2", "data": [...]}]
- Use numeric values where possible; use strings for dates or categories. Keep labels concise and clear.

First, reason step-by-step like a real analyst inside <think> tags. Detail:
- Understanding of the query and dataset structure.
- Steps for filtering, grouping, or aggregating data.
- Calculations (e.g., averages, percentages, correlations).
- Identification of trends, outliers, or anomalies.
- Rationale for the chosen data format for the chart type.

Then, output ONLY a JSON object in this exact format:
{
  "data": [ /* array as described above */ ],
  "summary": "A concise, insightful summary of key findings, trends, and implications (2-3 sentences).",
  "reasoning": "A detailed explanation of the analysis process, including steps, calculations, and observations."
}

DO NOT include any other text, commentary, markdown, or characters outside the <think> tags and the JSON object.
`;

    const userContent = `
Dataset: ${JSON.stringify(dataset).slice(0, 15000)}  // Increased limit for larger datasets

Query: ${userQuery}

Chart Type: ${chartType}
`;

    let rawResult = "";
    try {
        const completion = await client.chat.completions.create({
            model: "deepseek-r1-distill-llama-70b",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.2, // Lower temperature for precision
            max_completion_tokens: 4096, // Increased for complex analysis
            top_p: 0.95,
            stream: true,
        });

        for await (const chunk of completion) {
            rawResult += chunk.choices?.[0]?.delta?.content || "";
        }

        console.log("Raw LLM Response:", rawResult);

        // Extract <think> content for reasoning
        const thinkMatch = rawResult.match(/<think>(.*?)<\/think>/gs);
        const reasoning = thinkMatch ? thinkMatch.map(match => match.replace(/<think>|<\/think>/gs, '').trim()).join('\n') : '';

        console.log("Extracted Reasoning:", reasoning);

        // Remove <think> tags and trim whitespace for JSON
        let cleanedResult = rawResult.replace(/<think>.*?<\/think>/gs, '').trim();

        console.log("Cleaned LLM Response (after removing <think> tags):", cleanedResult);

        // Attempt to parse the cleaned result directly
        try {
            const parsedJson = JSON.parse(cleanedResult);
            console.log("Successfully parsed JSON directly:", parsedJson);
            return { ...parsedJson, reasoning };
        } catch (directParseError) {
            console.warn("Direct JSON parsing failed. Attempting slice extraction. Error:", directParseError.message);

            // Try to extract the JSON object by finding the first '{' and last '}'
            const jsonStart = cleanedResult.indexOf("{");
            const jsonEnd = cleanedResult.lastIndexOf("}");

            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                const jsonString = cleanedResult.slice(jsonStart, jsonEnd + 1);
                console.log("Extracted JSON string via slice:", jsonString);

                // Attempt to parse the extracted JSON string
                try {
                    const parsedJson = JSON.parse(jsonString);
                    console.log("Successfully parsed JSON after slice extraction:", parsedJson);
                    return { ...parsedJson, reasoning };
                } catch (sliceParseError) {
                    console.error("Final parsing error: Extracted string was not valid JSON.", sliceParseError.message);
                    console.error("Problematic JSON string:", jsonString);
                    return { data: [], summary: '', reasoning: '' };
                }
            } else {
                console.error("Could not find a valid JSON object structure (missing { or }).");
                return { data: [], summary: '', reasoning: '' };
            }
        }
    } catch (apiError) {
        console.error("Error calling Groq API:", apiError);
        return { data: [], summary: '', reasoning: '' };
    }
};