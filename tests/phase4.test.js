require('dotenv').config();

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Device = require('../src/models/Device');
const Reading = require('../src/models/Reading');
const Alert = require('../src/models/Alert');
const { ingestPacket } = require('../src/services/ingestService');
const {
  TEST_KEY_HEX,
  encryptPacket,
  recalculateChecksum,
  VALID_PACKET
} = require('./fixtures');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment');
  process.exit(1);
}

jest.setTimeout(30000);

describe('Phase 4 - Device, Reading, Alert APIs', () => {
  beforeAll(async () => {
    process.env.AES_KEY = TEST_KEY_HEX;
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    delete process.env.AES_KEY;
  }, 30000);

  beforeEach(async () => {
    await Device.deleteMany({});
    await Reading.deleteMany({});
    await Alert.deleteMany({});
  }, 15000);

  describe('POST /api/devices', () => {
    it('registers a new device', async () => {
      const response = await request(app)
        .post('/api/devices')
        .send({
          deviceId: 12345,
          label: 'Test Device',
          location: 'Room 101',
          installationDate: '2024-01-15T00:00:00Z'
        });

      expect(response.status).toBe(201);
      expect(response.body.deviceId).toBe(12345);
      expect(response.body.label).toBe('Test Device');
      expect(response.body.location).toBe('Room 101');
      expect(response.body.installationDate).toBe('2024-01-15T00:00:00.000Z');
    });

    it('registers device with minimal fields', async () => {
      const response = await request(app)
        .post('/api/devices')
        .send({
          deviceId: 999,
          label: 'Minimal Device'
        });

      expect(response.status).toBe(201);
      expect(response.body.deviceId).toBe(999);
      expect(response.body.location).toBe('');
    });

    it('returns 400 for missing deviceId', async () => {
      const response = await request(app)
        .post('/api/devices')
        .send({ label: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('deviceId');
    });

    it('returns 400 for non-integer deviceId', async () => {
      const response = await request(app)
        .post('/api/devices')
        .send({ deviceId: 'abc', label: 'Test' });

      expect(response.status).toBe(400);
    });

    it('returns 400 for missing label', async () => {
      const response = await request(app)
        .post('/api/devices')
        .send({ deviceId: 123 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('label');
    });

    it('returns 409 for duplicate deviceId', async () => {
      await request(app)
        .post('/api/devices')
        .send({ deviceId: 555, label: 'First' });

      const response = await request(app)
        .post('/api/devices')
        .send({ deviceId: 555, label: 'Second' });

      expect(response.status).toBe(409);
    });

    it('returns 400 for invalid installationDate', async () => {
      const response = await request(app)
        .post('/api/devices')
        .send({ deviceId: 777, label: 'Test', installationDate: 'invalid' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/devices', () => {
    beforeEach(async () => {
      await Device.create([
        { deviceId: 100, label: 'Device A', location: 'Loc A' },
        { deviceId: 200, label: 'Device B', location: 'Loc B' }
      ]);

      await Reading.create([
        { deviceId: 100, sequence: 1, deviceTimestamp: new Date('2024-01-01T10:00:00Z'), temperature: 22.5, battery: 80, label: 'Device A', samples: Array(16).fill({x:0,y:0,z:0}), activityScore: 5, rawPacketId: new mongoose.Types.ObjectId() },
        { deviceId: 100, sequence: 2, deviceTimestamp: new Date('2024-01-01T11:00:00Z'), temperature: 23.0, battery: 79, label: 'Device A', samples: Array(16).fill({x:0,y:0,z:0}), activityScore: 3, rawPacketId: new mongoose.Types.ObjectId() },
        { deviceId: 200, sequence: 1, deviceTimestamp: new Date('2024-01-01T09:00:00Z'), temperature: 18.0, battery: 90, label: 'Device B', samples: Array(16).fill({x:0,y:0,z:0}), activityScore: 10, rawPacketId: new mongoose.Types.ObjectId() }
      ]);

      await Alert.create({ type: 'high_temp', deviceId: 100, acknowledged: false });
    });

    it('returns all registered devices with latest data', async () => {
      const response = await request(app).get('/api/devices');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      
      const device100 = response.body.find(d => d.deviceId === 100);
      expect(device100.label).toBe('Device A');
      expect(device100.latestTemperature).toBe(23.0);
      expect(device100.latestActivityScore).toBe(3);
      expect(device100.hasOpenAlert).toBe(true);

      const device200 = response.body.find(d => d.deviceId === 200);
      expect(device200.latestTemperature).toBe(18.0);
      expect(device200.hasOpenAlert).toBe(false);
    });

    it('returns empty array when no devices registered', async () => {
      await Device.deleteMany({});
      await Reading.deleteMany({});
      await Alert.deleteMany({});

      const response = await request(app).get('/api/devices');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/devices/:id', () => {
    beforeEach(async () => {
      await Device.create({ deviceId: 42, label: 'Test Device', location: 'Test Loc' });
      await Reading.create([
        { deviceId: 42, sequence: 1, deviceTimestamp: new Date('2024-01-01T10:00:00Z'), temperature: 25.0, battery: 85, label: 'Test Device', samples: Array(16).fill({x:0,y:0,z:0}), activityScore: 2, rawPacketId: new mongoose.Types.ObjectId() }
      ]);
    });

    it('returns device details with latest reading', async () => {
      const response = await request(app).get('/api/devices/42');

      expect(response.status).toBe(200);
      expect(response.body.deviceId).toBe(42);
      expect(response.body.label).toBe('Test Device');
      expect(response.body.latestTemperature).toBe(25.0);
      expect(response.body.latestActivityScore).toBe(2);
    });

    it('returns 404 for non-existent device', async () => {
      const response = await request(app).get('/api/devices/99999');
      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid deviceId format', async () => {
      const response = await request(app).get('/api/devices/abc');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/devices/:id/readings', () => {
    beforeEach(async () => {
      await Device.create({ deviceId: 500, label: 'Reading Device' });
      
      const baseTime = new Date('2024-01-15T12:00:00Z');
      const readings = [];
      for (let i = 0; i < 25; i++) {
        readings.push({
          deviceId: 500,
          sequence: i + 1,
          deviceTimestamp: new Date(baseTime.getTime() + i * 3600000),
          temperature: 20 + (i % 5),
          battery: 100 - i,
          label: 'Reading Device',
          samples: Array(16).fill({x:0,y:0,z:0}),
          activityScore: i % 10,
          rawPacketId: new mongoose.Types.ObjectId()
        });
      }
      await Reading.insertMany(readings);
    });

    it('returns paginated readings newest first', async () => {
      const response = await request(app).get('/api/devices/500/readings?page=1&limit=10');
      
      expect(response.status).toBe(200);
      expect(response.body.readings).toHaveLength(10);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.total).toBe(25);
      expect(response.body.pagination.totalPages).toBe(3);
      
      expect(response.body.readings[0].sequence).toBe(25);
      expect(response.body.readings[9].sequence).toBe(16);
    });

    it('returns second page', async () => {
      const response = await request(app).get('/api/devices/500/readings?page=2&limit=10');
      
      expect(response.status).toBe(200);
      expect(response.body.readings).toHaveLength(10);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.readings[0].sequence).toBe(15);
    });

    it('uses default pagination when not specified', async () => {
      const response = await request(app).get('/api/devices/500/readings');
      
      expect(response.status).toBe(200);
      expect(response.body.readings.length).toBeLessThanOrEqual(50);
      expect(response.body.pagination.limit).toBe(50);
    });

    it('enforces maximum limit', async () => {
      const response = await request(app).get('/api/devices/500/readings?limit=500');
      expect(response.status).toBe(400);
    });

    it('returns 400 for invalid page', async () => {
      const response = await request(app).get('/api/devices/500/readings?page=0');
      expect(response.status).toBe(400);
    });

    it('filters by from date', async () => {
      const response = await request(app).get('/api/devices/500/readings?from=2024-01-15T14:00:00Z');
      
      expect(response.status).toBe(200);
      expect(response.body.readings.length).toBeLessThan(25);
      response.body.readings.forEach(r => {
        expect(new Date(r.deviceTimestamp) >= new Date('2024-01-15T14:00:00Z')).toBe(true);
      });
    });

    it('filters by to date', async () => {
      const response = await request(app).get('/api/devices/500/readings?to=2024-01-15T14:00:00Z');
      
      expect(response.status).toBe(200);
      response.body.readings.forEach(r => {
        expect(new Date(r.deviceTimestamp) <= new Date('2024-01-15T14:00:00Z')).toBe(true);
      });
    });

    it('filters by date range', async () => {
      const response = await request(app).get('/api/devices/500/readings?from=2024-01-15T13:00:00Z&to=2024-01-15T15:00:00Z');
      
      expect(response.status).toBe(200);
      response.body.readings.forEach(r => {
        const ts = new Date(r.deviceTimestamp);
        expect(ts >= new Date('2024-01-15T13:00:00Z')).toBe(true);
        expect(ts <= new Date('2024-01-15T15:00:00Z')).toBe(true);
      });
    });

    it('returns 400 for invalid date format', async () => {
      const response = await request(app).get('/api/devices/500/readings?from=invalid');
      expect(response.status).toBe(400);
    });

    it('returns 400 when from > to', async () => {
      const response = await request(app).get('/api/devices/500/readings?from=2024-01-15T15:00:00Z&to=2024-01-15T13:00:00Z');
      expect(response.status).toBe(400);
    });

    it('returns 404 for device with no readings and not registered', async () => {
      const response = await request(app).get('/api/devices/99999/readings');
      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid deviceId', async () => {
      const response = await request(app).get('/api/devices/abc/readings');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/alerts', () => {
    beforeEach(async () => {
      await Device.create({ deviceId: 300, label: 'Alert Device' });
      
      await Alert.create([
        { type: 'high_temp', deviceId: 300, acknowledged: false, raisedAt: new Date('2024-01-01T10:00:00Z') },
        { type: 'low_battery', deviceId: 300, acknowledged: true, raisedAt: new Date('2024-01-01T11:00:00Z') },
        { type: 'high_temp', deviceId: 300, acknowledged: true, raisedAt: new Date('2024-01-01T12:00:00Z') }
      ]);
    });

    it('returns all alerts by default', async () => {
      const response = await request(app).get('/api/alerts');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
    });

    it('filters by status=open', async () => {
      const response = await request(app).get('/api/alerts?status=open');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      response.body.forEach(a => expect(a.acknowledged).toBe(false));
    });

    it('filters by status=acknowledged', async () => {
      const response = await request(app).get('/api/alerts?status=acknowledged');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      response.body.forEach(a => expect(a.acknowledged).toBe(true));
    });

    it('returns 400 for invalid status', async () => {
      const response = await request(app).get('/api/alerts?status=invalid');
      expect(response.status).toBe(400);
    });

    it('returns empty array when no alerts', async () => {
      await Alert.deleteMany({});
      const response = await request(app).get('/api/alerts');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('PATCH /api/alerts/:id', () => {
    let alertId;

    beforeEach(async () => {
      await Device.create({ deviceId: 400, label: 'Alert Device' });
      const alert = await Alert.create({ 
        type: 'test_alert', 
        deviceId: 400, 
        acknowledged: false 
      });
      alertId = alert._id.toString();
    });

    it('acknowledges an open alert', async () => {
      const response = await request(app).patch(`/api/alerts/${alertId}`);
      
      expect(response.status).toBe(200);
      expect(response.body.acknowledged).toBe(true);
    });

    it('returns 404 for non-existent alert', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app).patch(`/api/alerts/${fakeId}`);
      
      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid alert ID format', async () => {
      const response = await request(app).patch('/api/alerts/invalid-id');
      expect(response.status).toBe(400);
    });

    it('is idempotent - repeated requests return acknowledged alert', async () => {
      await request(app).patch(`/api/alerts/${alertId}`);
      const response2 = await request(app).patch(`/api/alerts/${alertId}`);
      
      expect(response2.status).toBe(200);
      expect(response2.body.acknowledged).toBe(true);
    });
  });
});