const express = require('express');
const cors = require('cors');
const ingestRoutes = require('./routes/ingestRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const readingRoutes = require('./routes/readingRoutes');
const alertRoutes = require('./routes/alertRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'backend-intern-assignment',
    timestamp: new Date().toISOString()
  });
});

app.use(ingestRoutes);
app.use(deviceRoutes);
app.use(readingRoutes);
app.use(alertRoutes);

module.exports = app;