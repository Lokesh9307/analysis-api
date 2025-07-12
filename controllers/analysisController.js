const xlsx = require('xlsx');
const llmService = require('../services/llmService');
const path = require('path');

exports.handleAnalysis = async (req, res) => {
  try {
    // 1. Read file
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    // 2. Get user query
    const { query, chartType } = req.body;

    // 3. Call LLM to filter data
    const filtered = await llmService.queryData(data, query);

    // 4. Respond with filtered data + chartType
    res.json({ data: filtered, chartType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed' });
  }
};