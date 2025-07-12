const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
dotenv.config();
const analysisController = require('./controllers/analysisController');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Upload Excel and query
app.post('/api/analyze', upload.single('file'), analysisController.handleAnalysis);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));