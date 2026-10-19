const Device = require('../models/Device');
const Reading = require('../models/Reading');
const Alert = require('../models/Alert');

async function registerDevice({ deviceId, label, location, installationDate }) {
  if (!deviceId || !Number.isInteger(deviceId)) {
    throw new Error('deviceId is required and must be an integer');
  }
  if (!label || typeof label !== 'string') {
    throw new Error('label is required and must be a string');
  }

  const existing = await Device.findOne({ deviceId });
  if (existing) {
    throw new Error('Device already registered');
  }

  const device = await Device.create({
    deviceId,
    label,
    location: location || '',
    installationDate: installationDate ? new Date(installationDate) : null
  });

  return device;
}

async function getDevices() {
  const devices = await Device.find().sort({ deviceId: 1 }).lean();

  const deviceIds = devices.map(d => d.deviceId);
  
  const latestReadings = await Reading.aggregate([
    { $match: { deviceId: { $in: deviceIds } } },
    { $sort: { deviceTimestamp: -1 } },
    { $group: {
      _id: '$deviceId',
      latestTemp: { $first: '$temperature' },
      latestActivityScore: { $first: '$activityScore' },
      lastSeen: { $first: '$deviceTimestamp' }
    }}
  ]);

  const alerts = await Alert.find({ 
    deviceId: { $in: deviceIds },
    acknowledged: false
  }).select('deviceId').lean();

  const alertDeviceIds = new Set(alerts.map(a => a.deviceId));

  const readingMap = new Map();
  latestReadings.forEach(r => {
    readingMap.set(r._id, r);
  });

  return devices.map(device => {
    const reading = readingMap.get(device.deviceId);
    return {
      deviceId: device.deviceId,
      label: device.label,
      location: device.location,
      installationDate: device.installationDate,
      latestTemperature: reading ? reading.latestTemp : null,
      latestActivityScore: reading ? reading.latestActivityScore : null,
      lastSeen: reading ? reading.lastSeen : null,
      hasOpenAlert: alertDeviceIds.has(device.deviceId)
    };
  });
}

async function getDeviceById(deviceId) {
  if (!Number.isInteger(deviceId)) {
    throw new Error('Invalid deviceId');
  }

  const device = await Device.findOne({ deviceId }).lean();
  if (!device) {
    return null;
  }

  const latestReading = await Reading.findOne({ deviceId })
    .sort({ deviceTimestamp: -1 })
    .select('temperature activityScore deviceTimestamp')
    .lean();

  const openAlert = await Alert.findOne({ deviceId, acknowledged: false })
    .select('_id')
    .lean();

  return {
    ...device,
    latestTemperature: latestReading ? latestReading.temperature : null,
    latestActivityScore: latestReading ? latestReading.activityScore : null,
    lastSeen: latestReading ? latestReading.deviceTimestamp : null,
    hasOpenAlert: !!openAlert
  };
}

module.exports = {
  registerDevice,
  getDevices,
  getDeviceById
};