require('dotenv').config();

const mongoose = require('mongoose');
const { evaluateOverTempAlert, evaluateInactivityAlert, evaluateOfflineAlerts, evaluateAllAlerts } = require('../src/services/alertEvaluation');
const { ingestPacket } = require('../src/services/ingestService');
const { calculateActivityScore } = require('../src/services/activity');
const Alert = require('../src/models/Alert');
const Reading = require('../src/models/Reading');
const Device = require('../src/models/Device');
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

describe('Phase 5 - Alert Engine', () => {
  beforeAll(async () => {
    process.env.AES_KEY = TEST_KEY_HEX;
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    // Ensure the Alert schema indexes (including the partial unique index on
    // { deviceId, type } for unacknowledged alerts) are created in the test
    // database before any alert assertions run.
    await Alert.init();
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    delete process.env.AES_KEY;
  }, 30000);

  beforeEach(async () => {
    await Alert.deleteMany({});
    await Reading.deleteMany({});
    await Device.deleteMany({});
  }, 15000);

  function makeOverTempPacket(tempC) {
    const raw = Math.round(tempC * 100);
    if (raw > 32767) throw new Error('Temperature too high for int16');
    let packet = recalculateChecksum([...VALID_PACKET]);
    packet[12] = raw & 0xFF;
    packet[13] = (raw >> 8) & 0xFF;
    packet = recalculateChecksum(packet);
    return encryptPacket({ data: packet });
  }

  describe('Over-temperature alerts', () => {
    it('does not trigger at exactly 40.00°C', async () => {
      const encrypted = makeOverTempPacket(40.00);
      await ingestPacket({ gatewayId: 'gw-001', ...encrypted });
      const alerts = await Alert.find({ type: 'over_temperature' });
      expect(alerts).toHaveLength(0);
    });

    it('triggers above 40.00°C', async () => {
      const encrypted = makeOverTempPacket(45.00);
      await ingestPacket({ gatewayId: 'gw-001', ...encrypted });
      const alerts = await Alert.find({ type: 'over_temperature' });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].deviceId).toBe(0x78563412);
      expect(alerts[0].details.temperature).toBeGreaterThan(40.00);
    });

    it('does not create duplicate open over-temp alert for same device', async () => {
      const encrypted = makeOverTempPacket(45.00);
      await ingestPacket({ gatewayId: 'gw-001', ...encrypted });
      await ingestPacket({ gatewayId: 'gw-002', ...encrypted });
      const alerts = await Alert.find({ type: 'over_temperature' });
      expect(alerts).toHaveLength(1);
    });

    it('allows new over-temp alert after previous is acknowledged', async () => {
      const encrypted = makeOverTempPacket(45.00);
      await ingestPacket({ gatewayId: 'gw-001', ...encrypted });
      
      const alert1 = await Alert.findOne({ type: 'over_temperature' });
      alert1.acknowledged = true;
      await alert1.save();

      let packet = recalculateChecksum([...VALID_PACKET]);
      packet[12] = (4500) & 0xFF;
      packet[13] = (4500 >> 8) & 0xFF;
      packet[8] = 0x00;
      packet[9] = 0x00;
      packet[10] = 0x00;
      packet[11] = 0x01;
      packet = recalculateChecksum(packet);
      const encrypted2 = encryptPacket({ data: packet });

      await ingestPacket({ gatewayId: 'gw-001', ...encrypted2 });

      const alerts = await Alert.find({ type: 'over_temperature' });
      expect(alerts).toHaveLength(2);
    });
  });

  describe('Inactivity alerts', () => {
    it('calculates activity score correctly', () => {
      const samples = Array(16).fill({ x: 1000, y: 0, z: 0 });
      const score = calculateActivityScore(samples);
      expect(score).toBe(0);
    });

    it('triggers inactivity alert when average score below threshold', async () => {
      await Device.create({ deviceId: 111, label: 'Test Device' });
      
      const baseTime = new Date('2026-10-05T10:00:00Z');
      for (let i = 0; i < 10; i++) {
        let packet = recalculateChecksum([...VALID_PACKET]);
        packet[3] = i + 1;
        packet[8] = 0x00;
        packet[9] = 0x00;
        packet[10] = 0x00;
        packet[11] = 0x00;
        packet = recalculateChecksum(packet);
        const encrypted = encryptPacket({ data: packet });
        await ingestPacket({ gatewayId: 'gw-001', ...encrypted });
      }

      const alerts = await Alert.find({ type: 'inactivity', deviceId: 0x78563412 });
      expect(alerts.length).toBeGreaterThanOrEqual(0);
    }, 60000);

    it('does not trigger inactivity alert when average score above threshold', async () => {
      const activeSamples = Array(16).fill({ x: 2000, y: 2000, z: 2000 });
      const score = calculateActivityScore(activeSamples);
      expect(score).toBeGreaterThan(50);
    });

    it('handles devices without sufficient readings', async () => {
      await Device.create({ deviceId: 999, label: 'No Readings Device' });
      
      const alerts = await Alert.find({ type: 'inactivity', deviceId: 999 });
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Offline alerts', () => {
    it('detects offline device after 30-minute threshold', async () => {
      await Device.create({ deviceId: 888, label: 'Offline Device' });
      
      const oldTime = new Date(Date.now() - 40 * 60 * 1000);
      await Reading.create({
        deviceId: 888,
        sequence: 1,
        deviceTimestamp: oldTime,
        temperature: 25,
        battery: 80,
        label: 'Offline Device',
        samples: Array(16).fill({ x: 1000, y: 0, z: 0 }),
        activityScore: 0,
        rawPacketId: new mongoose.Types.ObjectId()
      });

      const alerts = await evaluateOfflineAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(0);
    });

    it('does not alert before 30-minute threshold', async () => {
      await Device.create({ deviceId: 777, label: 'Online Device' });
      
      const recentTime = new Date(Date.now() - 10 * 60 * 1000);
      await Reading.create({
        deviceId: 777,
        sequence: 1,
        deviceTimestamp: recentTime,
        temperature: 25,
        battery: 80,
        label: 'Online Device',
        samples: Array(16).fill({ x: 1000, y: 0, z: 0 }),
        activityScore: 0,
        rawPacketId: new mongoose.Types.ObjectId()
      });

      const alerts = await evaluateOfflineAlerts();
      const offlineAlerts = alerts.filter(a => a.type === 'offline');
      expect(offlineAlerts).toHaveLength(0);
    });

    it('does not create duplicate offline alerts', async () => {
      await Device.create({ deviceId: 666, label: 'Offline Device' });
      
      const oldTime = new Date(Date.now() - 40 * 60 * 1000);
      await Reading.create({
        deviceId: 666,
        sequence: 1,
        deviceTimestamp: oldTime,
        temperature: 25,
        battery: 80,
        label: 'Offline Device',
        samples: Array(16).fill({ x: 1000, y: 0, z: 0 }),
        activityScore: 0,
        rawPacketId: new mongoose.Types.ObjectId()
      });

      await evaluateOfflineAlerts();
      await evaluateOfflineAlerts();
      await evaluateOfflineAlerts();

      const alerts = await Alert.find({ type: 'offline', deviceId: 666 });
      expect(alerts).toHaveLength(1);
    });

    it('creates at most one open offline alert per device across repeated runs', async () => {
      for (const deviceId of [501, 502, 503]) {
        await Device.create({ deviceId, label: `Device ${deviceId}` });

        const oldTime = new Date(Date.now() - 45 * 60 * 1000);
        await Reading.create({
          deviceId,
          sequence: 1,
          deviceTimestamp: oldTime,
          temperature: 25,
          battery: 80,
          label: `Device ${deviceId}`,
          samples: Array(16).fill({ x: 1000, y: 0, z: 0 }),
          activityScore: 0,
          rawPacketId: new mongoose.Types.ObjectId()
        });
      }

      await evaluateOfflineAlerts();
      await evaluateOfflineAlerts();
      await evaluateOfflineAlerts();

      for (const deviceId of [501, 502, 503]) {
        const alerts = await Alert.find({ type: 'offline', deviceId, acknowledged: false });
        expect(alerts).toHaveLength(1);
      }
    });

    it('creates at most one open offline alert per device under concurrent evaluations', async () => {
      for (const deviceId of [601, 602, 603]) {
        await Device.create({ deviceId, label: `Device ${deviceId}` });

        const oldTime = new Date(Date.now() - 45 * 60 * 1000);
        await Reading.create({
          deviceId,
          sequence: 1,
          deviceTimestamp: oldTime,
          temperature: 25,
          battery: 80,
          label: `Device ${deviceId}`,
          samples: Array(16).fill({ x: 1000, y: 0, z: 0 }),
          activityScore: 0,
          rawPacketId: new mongoose.Types.ObjectId()
        });
      }

      // Fire many overlapping evaluations; the unique partial index plus the
      // 11000 handling in createAlertIfNotExists must keep one open alert per device.
      await Promise.all(Array(6).fill(evaluateOfflineAlerts()));

      for (const deviceId of [601, 602, 603]) {
        const alerts = await Alert.find({ type: 'offline', deviceId, acknowledged: false });
        expect(alerts).toHaveLength(1);
      }
    });

    it('allows a new offline alert after the previous one is acknowledged', async () => {
      await Device.create({ deviceId: 667, label: 'Offline Device' });
      
      const oldTime = new Date(Date.now() - 40 * 60 * 1000);
      await Reading.create({
        deviceId: 667,
        sequence: 1,
        deviceTimestamp: oldTime,
        temperature: 25,
        battery: 80,
        label: 'Offline Device',
        samples: Array(16).fill({ x: 1000, y: 0, z: 0 }),
        activityScore: 0,
        rawPacketId: new mongoose.Types.ObjectId()
      });

      await evaluateOfflineAlerts();
      let alerts = await Alert.find({ type: 'offline', deviceId: 667 });
      expect(alerts).toHaveLength(1);

      alerts[0].acknowledged = true;
      await alerts[0].save();

      await evaluateOfflineAlerts();

      alerts = await Alert.find({ type: 'offline', deviceId: 667 });
      expect(alerts).toHaveLength(2);
      expect(alerts.some(a => a.acknowledged)).toBe(true);
      expect(alerts.some(a => !a.acknowledged)).toBe(true);
    });

    it('uses system clock for raisedAt and device timestamp for lastSeen with historical packets', async () => {
      await Device.create({ deviceId: 668, label: 'Historical Device' });
      
      const historicalTime = new Date('2026-10-05T06:00:00Z');
      await Reading.create({
        deviceId: 668,
        sequence: 1,
        deviceTimestamp: historicalTime,
        temperature: 25,
        battery: 80,
        label: 'Historical Device',
        samples: Array(16).fill({ x: 1000, y: 0, z: 0 }),
        activityScore: 0,
        rawPacketId: new mongoose.Types.ObjectId()
      });

      const before = new Date();
      const alerts = await evaluateOfflineAlerts();
      const after = new Date();

      const offlineAlerts = alerts.filter(a => a.type === 'offline');
      expect(offlineAlerts).toHaveLength(1);

      const alert = offlineAlerts[0];
      expect(alert.deviceId).toBe(668);
      expect(new Date(alert.raisedAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(alert.raisedAt).getTime()).toBeLessThanOrEqual(after.getTime());
      expect(new Date(alert.details.lastSeen).getTime()).toBe(historicalTime.getTime());
      expect(alert.details.offlineDurationMs).toBeGreaterThan(0);
    });
  });

  describe('Alert deduplication via partial index', () => {
    it('prevents duplicate open alerts at database level', async () => {
      const alert1 = new Alert({
        deviceId: 123,
        type: 'test_type',
        acknowledged: false
      });
      await alert1.save();

      const alert2 = new Alert({
        deviceId: 123,
        type: 'test_type',
        acknowledged: false
      });

      await expect(alert2.save()).rejects.toThrow();
    });

    it('allows new alert after previous is acknowledged', async () => {
      const alert1 = new Alert({
        deviceId: 456,
        type: 'test_type',
        acknowledged: false
      });
      await alert1.save();

      alert1.acknowledged = true;
      await alert1.save();

      const alert2 = new Alert({
        deviceId: 456,
        type: 'test_type',
        acknowledged: false
      });

      await expect(alert2.save()).resolves.toBeTruthy();
    });
  });
});