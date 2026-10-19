const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    index: true
  },
  deviceId: {
    type: Number,
    required: true,
    index: true
  },
  raisedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  acknowledged: {
    type: Boolean,
    default: false,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

alertSchema.index({ deviceId: 1, raisedAt: -1 });

// Partial unique index: only one open (unacknowledged) alert per deviceId + type
alertSchema.index(
  { deviceId: 1, type: 1 },
  { unique: true, partialFilterExpression: { acknowledged: false } }
);

module.exports = mongoose.model('Alert', alertSchema);