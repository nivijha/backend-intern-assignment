const express = require('express');
const { getAlerts, acknowledgeAlert } = require('../services/alertService');

const router = express.Router();

router.get('/api/alerts', async (req, res) => {
  try {
    const status = req.query.status;
    const alerts = await getAlerts({ status });
    return res.status(200).json(alerts);
  } catch (error) {
    if (error.message.includes('Invalid status')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Get alerts error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/api/alerts/:id', async (req, res) => {
  const alertId = req.params.id;
  
  if (!alertId || !alertId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ error: 'Invalid alert ID' });
  }

  try {
    const alert = await acknowledgeAlert(alertId);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    return res.status(200).json(alert);
  } catch (error) {
    if (error.message === 'Invalid alert ID') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Acknowledge alert error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;