const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema({
  deviceId: {
    type: Number,
    required: true,
    index: true
  },
  sequence: {
    type: Number,
    required: true
  },
  deviceTimestamp: {
    type: Date,
    required: true,
    index: true
  },
  temperature: {
    type: Number,
    required: true
  },
  battery: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  label: {
    type: String,
    required: true
  },
  samples: [{
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    z: { type: Number, required: true }
  }],
  activityScore: {
    type: Number,
    required: true
  },
  rawPacketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RawPacket',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

readingSchema.index({ deviceId: 1, sequence: 1, deviceTimestamp: 1 });

module.exports = mongoose.model('Reading', readingSchema);