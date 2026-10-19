const express = require('express');
const { registerDevice, getDevices, getDeviceById } = require('../services/deviceService');

const router = express.Router();

function validateDeviceRegistration(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }
  if (body.deviceId === undefined || body.deviceId === null) {
    return 'deviceId is required';
  }
  if (!Number.isInteger(body.deviceId)) {
    return 'deviceId must be an integer';
  }
  if (!body.label || typeof body.label !== 'string') {
    return 'label is required and must be a string';
  }
  if (body.location !== undefined && typeof body.location !== 'string') {
    return 'location must be a string';
  }
  if (body.installationDate !== undefined && body.installationDate !== null) {
    const date = new Date(body.installationDate);
    if (isNaN(date.getTime())) {
      return 'installationDate must be a valid ISO 8601 date or null';
    }
  }
  return null;
}

router.post('/api/devices', async (req, res) => {
  const validationError = validateDeviceRegistration(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const device = await registerDevice(req.body);
    return res.status(201).json(device);
  } catch (error) {
    if (error.message === 'Device already registered') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Device registration error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/devices', async (req, res) => {
  try {
    const devices = await getDevices();
    return res.status(200).json(devices);
  } catch (error) {
    console.error('Get devices error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/devices/:id', async (req, res) => {
  const deviceId = parseInt(req.params.id, 10);
  
  if (!Number.isInteger(deviceId)) {
    return res.status(400).json({ error: 'Invalid deviceId' });
  }

  try {
    const device = await getDeviceById(deviceId);
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    return res.status(200).json(device);
  } catch (error) {
    if (error.message === 'Invalid deviceId') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Get device error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;