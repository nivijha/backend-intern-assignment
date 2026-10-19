const mongoose = require('mongoose');

const decryptedPacketSchema = new mongoose.Schema({
  rawPacketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RawPacket',
    required: true,
    unique: true,
    index: true
  },
  plaintext: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DecryptedPacket', decryptedPacketSchema);