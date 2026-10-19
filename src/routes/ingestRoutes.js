const express = require('express');
const { ingestPacket } = require('../services/ingestService');

const router = express.Router();

function validateIngestBody(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }
  if (!body.gatewayId || typeof body.gatewayId !== 'string') {
    return 'gatewayId is required and must be a string';
  }
  if (!body.iv || typeof body.iv !== 'string') {
    return 'iv is required and must be a string';
  }
  if (!body.ciphertext || typeof body.ciphertext !== 'string') {
    return 'ciphertext is required and must be a string';
  }
  if (!body.tag || typeof body.tag !== 'string') {
    return 'tag is required and must be a string';
  }
  return null;
}

router.post('/api/ingest', async (req, res) => {
  const validationError = validateIngestBody(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const result = await ingestPacket(req.body);

    if (result.status === 'duplicate') {
      return res.status(200).json(result);
    }

    return res.status(201).json(result);

  } catch (error) {
    if (error.message.includes('AES_KEY') ||
        error.message.includes('base64') ||
        error.message.includes('authentication failed') ||
        error.message.includes('not valid JSON') ||
        error.message.includes('not valid UTF-8') ||
        error.message.includes('packet data must be an array') ||
        error.message.includes('packet must be exactly 256') ||
        error.message.includes('byte') ||
        error.message.includes('must be an integer') ||
        error.message.includes('invalid header') ||
        error.message.includes('invalid footer') ||
        error.message.includes('unsupported format version') ||
        error.message.includes('sample count') ||
        error.message.includes('battery percentage') ||
        error.message.includes('checksum mismatch')) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Ingest error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;