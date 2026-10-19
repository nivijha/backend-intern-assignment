const RawPacket = require('../models/RawPacket');
const DecryptedPacket = require('../models/DecryptedPacket');
const Device = require('../models/Device');
const Reading = require('../models/Reading');
const { decryptPacket } = require('./decrypt');
const { decodePacket } = require('./decoder');
const { calculateActivityScore } = require('./activity');
const { evaluateAllAlerts } = require('./alertEvaluation');

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

async function ingestPacket(data) {
  const { gatewayId, iv, ciphertext, tag } = data;

  const rawPacket = await RawPacket.create({
    gatewayId,
    iv,
    ciphertext,
    tag,
    receivedAt: new Date(),
    status: 'pending'
  });

  try {
    const decrypted = decryptPacket({ gatewayId, iv, ciphertext, tag });

    await DecryptedPacket.create({
      rawPacketId: rawPacket._id,
      plaintext: decrypted.plaintext
    });

    const decoded = decodePacket(decrypted.payload.data);

    const activityScore = calculateActivityScore(decoded.samples);

    const deviceTimestamp = new Date(decoded.timestamp * 1000);

    const duplicate = await Reading.findOne({
      deviceId: decoded.deviceId,
      sequence: decoded.sequence,
      deviceTimestamp: {
        $gte: new Date(deviceTimestamp.getTime() - DUPLICATE_WINDOW_MS),
        $lte: new Date(deviceTimestamp.getTime() + DUPLICATE_WINDOW_MS)
      }
    });

    if (duplicate) {
      await RawPacket.findByIdAndUpdate(rawPacket._id, {
        status: 'success',
        decryptedPacket: rawPacket.decryptedPacket
      });

      return {
        status: 'duplicate',
        message: 'Duplicate packet received, no new reading created',
        readingId: duplicate._id,
        rawPacketId: rawPacket._id
      };
    }

    await Reading.create({
      deviceId: decoded.deviceId,
      sequence: decoded.sequence,
      deviceTimestamp,
      temperature: decoded.temperature,
      battery: decoded.battery,
      label: decoded.label,
      samples: decoded.samples,
      activityScore,
      rawPacketId: rawPacket._id
    });

    // Create or update the Device record
    await Device.findOneAndUpdate(
      { deviceId: decoded.deviceId },
      { $set: { label: decoded.label } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await RawPacket.findByIdAndUpdate(rawPacket._id, {
      status: 'success'
    });

    await evaluateAllAlerts(
      decoded.deviceId,
      decoded.temperature,
      deviceTimestamp,
      decoded.samples
    );

    return {
      status: 'created',
      message: 'Packet processed and reading stored',
      rawPacketId: rawPacket._id
    };

  } catch (error) {
    await RawPacket.findByIdAndUpdate(rawPacket._id, {
      status: 'failed',
      error: error.message
    });
    throw error;
  }
}

module.exports = { ingestPacket, DUPLICATE_WINDOW_MS };