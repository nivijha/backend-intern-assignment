const Alert = require('../models/Alert');
const Reading = require('../models/Reading');

const OVER_TEMP_THRESHOLD = 40.00;
const OFFLINE_WINDOW_MS = 30 * 60 * 1000;
const INACTIVITY_THRESHOLD = 50;
const INACTIVITY_WINDOW_MS = 60 * 60 * 1000;

async function createAlertIfNotExists({ deviceId, type, raisedAt, details = {} }) {
  try {
    const result = await Alert.updateOne(
      { deviceId, type, acknowledged: false },
      {
        $setOnInsert: {
          deviceId,
          type,
          raisedAt,
          acknowledged: false,
          details
        }
      },
      { upsert: true }
    );

    if (!result.upsertedId) {
      return null;
    }

    return Alert.findById(result.upsertedId);
  } catch (error) {
    // Duplicate-key race: another concurrent upsert won the unique partial
    // index on { deviceId, type, acknowledged: false }. Treat as "already
    // exists" so concurrent evaluations never create multiple open alerts.
    if (error && error.code === 11000) {
      return null;
    }
    throw error;
  }
}

async function evaluateOverTempAlert(deviceId, temperature, deviceTimestamp) {
  if (temperature <= OVER_TEMP_THRESHOLD) {
    return null;
  }

  return createAlertIfNotExists({
    deviceId,
    type: 'over_temperature',
    raisedAt: deviceTimestamp,
    details: { temperature }
  });
}

async function evaluateInactivityAlert(deviceId, deviceTimestamp) {
  const windowStart = new Date(deviceTimestamp.getTime() - INACTIVITY_WINDOW_MS);

  const readings = await Reading.find({
    deviceId,
    deviceTimestamp: { $gte: windowStart, $lte: deviceTimestamp }
  }).select('activityScore').lean();

  if (readings.length === 0) {
    return null;
  }

  const avgScore = readings.reduce((sum, r) => sum + r.activityScore, 0) / readings.length;

  if (avgScore >= INACTIVITY_THRESHOLD) {
    return null;
  }

  return createAlertIfNotExists({
    deviceId,
    type: 'inactivity',
    raisedAt: deviceTimestamp,
    details: { avgActivityScore: avgScore, readingCount: readings.length }
  });
}

async function evaluateOfflineAlerts() {
  const devices = await require('../models/Device').find().select('deviceId').lean();
  const deviceIds = devices.map(d => d.deviceId);

  const now = new Date();
  const threshold = new Date(now.getTime() - OFFLINE_WINDOW_MS);

  const latestReadings = await Reading.aggregate([
    { $match: { deviceId: { $in: deviceIds } } },
    { $sort: { deviceTimestamp: -1 } },
    { $group: { _id: '$deviceId', lastTimestamp: { $first: '$deviceTimestamp' } } }
  ]);

  const alerts = [];
  for (const lr of latestReadings) {
    if (lr.lastTimestamp < threshold) {
      const alert = await createAlertIfNotExists({
        deviceId: lr._id,
        type: 'offline',
        raisedAt: now,
        details: { lastSeen: lr.lastTimestamp, offlineDurationMs: now - lr.lastTimestamp }
      });
      if (alert) alerts.push(alert);
    }
  }

  return alerts;
}

async function evaluateAllAlerts(deviceId, temperature, deviceTimestamp, samples) {
  const alerts = [];

  const overTempAlert = await evaluateOverTempAlert(deviceId, temperature, deviceTimestamp);
  if (overTempAlert) alerts.push(overTempAlert);

  const inactivityAlert = await evaluateInactivityAlert(deviceId, deviceTimestamp);
  if (inactivityAlert) alerts.push(inactivityAlert);

  return alerts;
}

module.exports = {
  evaluateOverTempAlert,
  evaluateInactivityAlert,
  evaluateOfflineAlerts,
  evaluateAllAlerts,
  OVER_TEMP_THRESHOLD,
  OFFLINE_WINDOW_MS,
  INACTIVITY_THRESHOLD,
  INACTIVITY_WINDOW_MS
};