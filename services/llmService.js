const Groq = require('groq-sdk');
const { jsonrepair } = require('jsonrepair');

// Ensure your GROQ_API_KEY is properly loaded in your environment.
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
exports.queryData = async (dataset, userQuery, chartType) => {
    const systemPrompt = `
You are an expert data analyst simulating a real person's analytical thought process. 
Given the dataset, user query, and chart type, perform an in-depth analysis including:

- Filtering and grouping based on the query.
- Aggregations (sum, average, median, count, min, max, standard deviation, percentiles).
- Identifying correlations, trends, and outliers.
- Performing necessary calculations or statistical insights (growth rates, percentages, ratios).
- Ensuring all results are strictly derived from the dataset without inventing data or labels.

Prepare the data in a format suitable for the chart type:
- For 'pie' or 'doughnut': [{"label": "Category1", "value": 123}, {"label": "Category2", "value": 456}]
- For 'bar' or 'column': Similar to pie, or multi-series if applicable.
- For 'line' or 'area': [{"x": "Date1", "y": 123}, {"x": "Date2", "y": 456}], or multi-series.
- For 'scatter' or 'bubble': [{"x": 1, "y": 123}, {"x": 2, "y": 456}]
- For multi-series charts: [{"series": "Series1", "data": [{"label": "Cat1", "value": 123}, ...]}, {"series": "Series2", "data": [...]}]
- Use numeric values where possible; use strings for dates or categories.

IMPORTANT OUTPUT RULES:
1. First, include your step-by-step reasoning inside <think>...</think> tags.
2. Then, output ONLY a valid JSON object in the following exact format:
{
  "data": [ /* array as described above */ ],
  "summary": "Concise, insightful summary (2-3 sentences).",
  "reasoning": "Detailed explanation of the analysis process, including steps, calculations, and observations."
}
3. Do NOT include any text, commentary, or markdown outside the <think> tags and the JSON object.
4. If the dataset already contains aggregated values, do not re-aggregate unless requested.
`;

    const userContent = `
Dataset: ${JSON.stringify(dataset).slice(0, 15000)}

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
            temperature: 0.2,
            max_completion_tokens: 4096,
            top_p: 0.95,
            stream: true,
        });

        for await (const chunk of completion) {
            rawResult += chunk.choices?.[0]?.delta?.content || "";
        }

        console.log("Raw LLM Response:", rawResult);

        // Extract <think> content for reasoning
        const thinkMatch = rawResult.match(/<think>(.*?)<\/think>/gs);
        const reasoning = thinkMatch
            ? thinkMatch.map(match => match.replace(/<think>|<\/think>/gs, '').trim()).join('\n')
            : '';

        console.log("Extracted Reasoning:", reasoning);

        // Remove <think> tags
        let cleanedResult = rawResult.replace(/<think>.*?<\/think>/gs, '').trim();

        // Match largest JSON block
        const jsonMatch = cleanedResult.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("No JSON block found in LLM output.");
            return { data: [], summary: '', reasoning };
        }

        let jsonString = jsonMatch[0]
            .replace(/,\s*}/g, '}') // Remove trailing commas before object end
            .replace(/,\s*]/g, ']') // Remove trailing commas before array end
            .replace(/^\uFEFF/, ''); // Remove BOM if present

        // Attempt parse
        try {
            const parsedJson = JSON.parse(jsonString);
            console.log("Successfully parsed JSON:", parsedJson);
            return { ...parsedJson, reasoning };
        } catch (e) {
            console.warn("Direct JSON parse failed:", e.message);
            try {
                const fixedJson = jsonrepair(jsonString);
                const parsedJson = JSON.parse(fixedJson);
                console.log("Successfully repaired and parsed JSON:", parsedJson);
                return { ...parsedJson, reasoning };
            } catch (repairErr) {
                console.error("Repair failed:", repairErr.message);
                console.error("Problematic JSON string:", jsonString);
                return { data: [], summary: '', reasoning };
            }
        }
    } catch (apiError) {
        console.error("Error calling Groq API:", apiError);
        return { data: [], summary: '', reasoning: '' };
    }
};
