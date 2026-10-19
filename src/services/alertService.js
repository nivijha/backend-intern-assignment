const Alert = require('../models/Alert');

async function getAlerts({ status }) {
  const filter = {};
  if (status === 'open') {
    filter.acknowledged = false;
  } else if (status === 'acknowledged') {
    filter.acknowledged = true;
  } else if (status && status !== 'all') {
    throw new Error('Invalid status. Use open, acknowledged, or all.');
  }

  const alerts = await Alert.find(filter)
    .sort({ raisedAt: -1 })
    .lean();

  return alerts;
}

async function acknowledgeAlert(alertId) {
  if (!alertId || !alertId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new Error('Invalid alert ID');
  }

  const alert = await Alert.findById(alertId);
  if (!alert) {
    return null;
  }

  if (alert.acknowledged) {
    return alert;
  }

  alert.acknowledged = true;
  await alert.save();
  return alert;
}

module.exports = {
  getAlerts,
  acknowledgeAlert
};