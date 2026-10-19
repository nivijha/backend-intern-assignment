const Reading = require('../models/Reading');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseDateParam(value, paramName) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${paramName} date format. Use ISO 8601.`);
  }
  return date;
}

function parsePagination(page, limit) {
  const pageStr = String(page || '').trim();
  const limitStr = String(limit || '').trim();
  
  const pageNum = pageStr ? parseInt(pageStr, 10) : 1;
  const limitNum = limitStr ? parseInt(limitStr, 10) : DEFAULT_LIMIT;
  
  if (pageStr && (!Number.isInteger(pageNum) || pageNum < 1)) {
    throw new Error('page must be an integer >= 1');
  }
  if (limitStr && (!Number.isInteger(limitNum) || limitNum < 1)) {
    throw new Error('limit must be an integer >= 1');
  }
  if (limitNum > MAX_LIMIT) {
    throw new Error(`limit cannot exceed ${MAX_LIMIT}`);
  }
  
  return {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum
  };
}

async function getReadings(deviceId, { from, to, page, limit }) {
  if (!Number.isInteger(deviceId)) {
    throw new Error('Invalid deviceId');
  }

  const deviceExists = await Reading.exists({ deviceId });
  if (!deviceExists) {
    const device = await require('../models/Device').findOne({ deviceId });
    if (!device) {
      return { error: 'NOT_FOUND' };
    }
  }

  const filter = { deviceId };
  
  if (from || to) {
    filter.deviceTimestamp = {};
    if (from) filter.deviceTimestamp.$gte = from;
    if (to) filter.deviceTimestamp.$lte = to;
  }

  const { skip, limit: limitNum } = parsePagination(page, limit);

  const [readings, total] = await Promise.all([
    Reading.find(filter)
      .sort({ deviceTimestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Reading.countDocuments(filter)
  ]);

  return {
    readings,
    pagination: {
      page: Math.floor(skip / limitNum) + 1,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  };
}

module.exports = {
  getReadings,
  DEFAULT_LIMIT,
  MAX_LIMIT
};