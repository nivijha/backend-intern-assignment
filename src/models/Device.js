const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  label: {
    type: String,
    required: true
  },
  location: {
    type: String,
    default: ''
  },
  installationDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Device', deviceSchema);