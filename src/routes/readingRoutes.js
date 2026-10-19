const express = require('express');
const { getReadings } = require('../services/readingService');

const router = express.Router();

router.get('/api/devices/:id/readings', async (req, res) => {
  const deviceId = parseInt(req.params.id, 10);
  
  if (!Number.isInteger(deviceId)) {
    return res.status(400).json({ error: 'Invalid deviceId' });
  }

  try {
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    
    if (req.query.from && isNaN(from.getTime())) {
      return res.status(400).json({ error: 'Invalid from date format. Use ISO 8601.' });
    }
    if (req.query.to && isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid to date format. Use ISO 8601.' });
    }
    if (from && to && from > to) {
      return res.status(400).json({ error: 'from date must be before to date' });
    }

    const result = await getReadings(deviceId, {
      from,
      to,
      page: req.query.page,
      limit: req.query.limit
    });

    if (result.error === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Device not found' });
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.message.includes('page') || error.message.includes('limit')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Get readings error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;