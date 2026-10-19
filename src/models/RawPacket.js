const mongoose = require('mongoose');

const rawPacketSchema = new mongoose.Schema({
  gatewayId: {
    type: String,
    required: true,
    index: true
  },
  iv: {
    type: String,
    required: true
  },
  ciphertext: {
    type: String,
    required: true
  },
  tag: {
    type: String,
    required: true
  },
  receivedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending',
    index: true
  },
  error: {
    type: String,
    default: null
  },
  decryptedPacket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DecryptedPacket',
    default: null
  }
}, {
  timestamps: true
});

rawPacketSchema.index({ gatewayId: 1, receivedAt: -1 });

module.exports = mongoose.model('RawPacket', rawPacketSchema);