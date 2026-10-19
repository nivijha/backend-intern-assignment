function calculateMagnitude(sample) {
  const { x, y, z } = sample;
  return Math.sqrt(x * x + y * y + z * z);
}

function validateSamples(samples) {
  if (!Array.isArray(samples)) {
    throw new Error('samples must be an array');
  }

  if (samples.length === 0) {
    throw new Error('samples cannot be empty');
  }

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (!sample || typeof sample !== 'object') {
      throw new Error(`sample ${i} must be an object`);
    }
    const { x, y, z } = sample;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      throw new Error(`sample ${i} axes must be integers`);
    }
  }
}

function calculateActivityScore(samples) {
  validateSamples(samples);

  const magnitudes = samples.map(calculateMagnitude);
  const deviations = magnitudes.map(m => Math.abs(m - 1000));
  const sum = deviations.reduce((acc, val) => acc + val, 0);
  return sum / deviations.length;
}

module.exports = {
  calculateActivityScore,
  calculateMagnitude
};