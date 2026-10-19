require('dotenv').config();

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const { calculateActivityScore, calculateMagnitude } = require('../src/services/activity');
const { decryptPacket } = require('../src/services/decrypt');
const { decodePacket } = require('../src/services/decoder');
const { ingestPacket } = require('../src/services/ingestService');
const RawPacket = require('../src/models/RawPacket');
const DecryptedPacket = require('../src/models/DecryptedPacket');
const Reading = require('../src/models/Reading');
const Device = require('../src/models/Device');
const {
  TEST_KEY_HEX,
  TEST_KEY,
  encryptPacket,
  recalculateChecksum,
  VALID_PACKET,
  ENCRYPTED_SAMPLE
} = require('./fixtures');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment');
  process.exit(1);
}

jest.setTimeout(30000);

describe('activity service', () => {
  it('calculates magnitude correctly', () => {
    expect(calculateMagnitude({ x: 0, y: 0, z: 0 })).toBe(0);
    expect(calculateMagnitude({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(calculateMagnitude({ x: 1000, y: 0, z: 0 })).toBe(1000);
  });

  it('calculates activity score for samples at resting magnitude', () => {
    const samples = Array(16).fill({ x: 1000, y: 0, z: 0 });
    const score = calculateActivityScore(samples);
    expect(score).toBe(0);
  });

  it('calculates activity score correctly for varied samples', () => {
    const samples = [
      { x: 1100, y: 0, z: 0 },
      { x: 900, y: 0, z: 0 }
    ];
    const score = calculateActivityScore(samples);
    expect(score).toBe(100);
  });

  it('uses all 16 samples in calculation', () => {
    const samples = Array(16).fill({ x: 1100, y: 0, z: 0 });
    const score = calculateActivityScore(samples);
    expect(score).toBe(100);
  });

  it('throws on empty samples array', () => {
    expect(() => calculateActivityScore([])).toThrow('samples cannot be empty');
  });

  it('throws on non-array samples', () => {
    expect(() => calculateActivityScore('not array')).toThrow('samples must be an array');
  });

  it('throws on non-object sample', () => {
    expect(() => calculateActivityScore([null])).toThrow('sample 0 must be an object');
  });

  it('throws on non-integer axes', () => {
    expect(() => calculateActivityScore([{ x: 1.5, y: 0, z: 0 }]))
      .toThrow('sample 0 axes must be integers');
    expect(() => calculateActivityScore([{ x: 1000, y: 2.5, z: 0 }]))
      .toThrow('sample 0 axes must be integers');
    expect(() => calculateActivityScore([{ x: 1000, y: 0, z: 3.5 }]))
      .toThrow('sample 0 axes must be integers');
  });
});

describe('ingestService integration', () => {
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
    await RawPacket.deleteMany({});
    await DecryptedPacket.deleteMany({});
    await Reading.deleteMany({});
    await Device.deleteMany({});
  }, 15000);

  it('stores raw packet, decrypts, decodes, scores, and stores reading', async () => {
    const result = await ingestPacket({
      gatewayId: 'gw-001',
      ...ENCRYPTED_SAMPLE
    });

    expect(result.status).toBe('created');

    const raw = await RawPacket.findById(result.rawPacketId);
    expect(raw).toBeTruthy();
    expect(raw.gatewayId).toBe('gw-001');
    expect(raw.status).toBe('success');

    const decrypted = await DecryptedPacket.findOne({ rawPacketId: raw._id });
    expect(decrypted).toBeTruthy();
    expect(decrypted.plaintext).toBeTruthy();

    const readings = await Reading.find({ rawPacketId: raw._id });
    expect(readings).toHaveLength(1);
    expect(readings[0].deviceId).toBe(0x78563412);
    expect(readings[0].sequence).toBe(1);
    expect(readings[0].temperature).toBe(25.00);
    expect(readings[0].battery).toBe(100);
    expect(readings[0].label).toBe('DEVICE-001');
    expect(readings[0].samples).toHaveLength(16);
    expect(typeof readings[0].activityScore).toBe('number');
  }, 15000);

  it('stores raw packet even when decryption fails', async () => {
    await expect(ingestPacket({
      gatewayId: 'gw-001',
      iv: ENCRYPTED_SAMPLE.iv,
      ciphertext: 'invalid',
      tag: ENCRYPTED_SAMPLE.tag
    })).rejects.toThrow();

    const raw = await RawPacket.findOne({ gatewayId: 'gw-001' });
    expect(raw).toBeTruthy();
    expect(raw.status).toBe('failed');
    expect(raw.error).toBeTruthy();
  }, 15000);

  it('stores raw packet even when decoding fails', async () => {
    const badPacket = [...VALID_PACKET];
    badPacket[0] = 0x00;
    const encrypted = encryptPacket({ data: badPacket });

    await expect(ingestPacket({
      gatewayId: 'gw-001',
      ...encrypted
    })).rejects.toThrow('invalid header');

    const raw = await RawPacket.findOne({ gatewayId: 'gw-001' });
    expect(raw).toBeTruthy();
    expect(raw.status).toBe('failed');
    expect(raw.error).toContain('invalid header');
  }, 15000);

  it('does not create duplicate reading for same deviceId and sequence within 2 minutes', async () => {
    await ingestPacket({ gatewayId: 'gw-001', ...ENCRYPTED_SAMPLE });

    const result2 = await ingestPacket({ gatewayId: 'gw-002', ...ENCRYPTED_SAMPLE });

    expect(result2.status).toBe('duplicate');
    expect(result2.readingId).toBeTruthy();

    const readings = await Reading.find({});
    expect(readings).toHaveLength(1);
  }, 15000);

  it('allows same sequence after 2-minute window', async () => {
    let packet = recalculateChecksum([...VALID_PACKET]);
    packet[8] = 0x00;
    packet[9] = 0x00;
    packet[10] = 0x00;
    packet[11] = 0x00;
    packet = recalculateChecksum(packet);
    const encrypted1 = encryptPacket({ data: packet });

    await ingestPacket({ gatewayId: 'gw-001', ...encrypted1 });

    packet = recalculateChecksum([...VALID_PACKET]);
    packet[8] = 0x00;
    packet[9] = 0x00;
    packet[10] = 0x00;
    packet[11] = 0x01;
    packet = recalculateChecksum(packet);
    const encrypted2 = encryptPacket({ data: packet });

    const result2 = await ingestPacket({ gatewayId: 'gw-002', ...encrypted2 });

    expect(result2.status).toBe('created');

    const readings = await Reading.find({});
    expect(readings).toHaveLength(2);
  }, 15000);

  it('handles sequence wraparound (255 -> 0)', async () => {
    const packet255 = recalculateChecksum([...VALID_PACKET]);
    packet255[3] = 255;
    const encrypted255 = encryptPacket({ data: recalculateChecksum(packet255) });

    await ingestPacket({ gatewayId: 'gw-001', ...encrypted255 });

    const packet0 = recalculateChecksum([...VALID_PACKET]);
    packet0[3] = 0;
    const encrypted0 = encryptPacket({ data: recalculateChecksum(packet0) });

    const result = await ingestPacket({ gatewayId: 'gw-002', ...encrypted0 });

    expect(result.status).toBe('created');

    const readings = await Reading.find({});
    expect(readings).toHaveLength(2);
    expect(readings.map(r => r.sequence).sort((a,b) => a-b)).toEqual([0, 255]);
  }, 30000);

  it('stores reading for unregistered device', async () => {
    const result = await ingestPacket({
      gatewayId: 'gw-001',
      ...ENCRYPTED_SAMPLE
    });

    expect(result.status).toBe('created');

    const readings = await Reading.find({});
    expect(readings).toHaveLength(1);
    expect(readings[0].deviceId).toBe(0x78563412);

    const devices = await Device.find({});
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceId).toBe(0x78563412);
    expect(devices[0].label).toBe('DEVICE-001');
  }, 15000);
});

describe('POST /api/ingest endpoint', () => {
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
    await RawPacket.deleteMany({});
    await DecryptedPacket.deleteMany({});
    await Reading.deleteMany({});
    await Device.deleteMany({});
  }, 15000);

  it('returns 201 for valid encrypted packet', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({
        gatewayId: 'gw-001',
        ...ENCRYPTED_SAMPLE
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('created');
  }, 15000);

  it('returns 200 for duplicate packet', async () => {
    await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', ...ENCRYPTED_SAMPLE });

    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-002', ...ENCRYPTED_SAMPLE });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('duplicate');
  }, 15000);

  it('returns 400 for missing gatewayId', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({ iv: ENCRYPTED_SAMPLE.iv, ciphertext: ENCRYPTED_SAMPLE.ciphertext, tag: ENCRYPTED_SAMPLE.tag });

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing iv', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', ciphertext: ENCRYPTED_SAMPLE.ciphertext, tag: ENCRYPTED_SAMPLE.tag });

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing ciphertext', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', iv: ENCRYPTED_SAMPLE.iv, tag: ENCRYPTED_SAMPLE.tag });

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing tag', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', iv: ENCRYPTED_SAMPLE.iv, ciphertext: ENCRYPTED_SAMPLE.ciphertext });

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid ciphertext', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', iv: ENCRYPTED_SAMPLE.iv, ciphertext: 'invalid', tag: ENCRYPTED_SAMPLE.tag });

    expect(response.status).toBe(400);
  });

  it('returns 400 for tampered ciphertext (auth failure)', async () => {
    const tampered = Buffer.from(ENCRYPTED_SAMPLE.ciphertext, 'base64');
    tampered[0] ^= 0xFF;
    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', iv: ENCRYPTED_SAMPLE.iv, ciphertext: tampered.toString('base64'), tag: ENCRYPTED_SAMPLE.tag });

    expect(response.status).toBe(400);
  });

  it('returns 400 for wrong authentication tag', async () => {
    const tampered = Buffer.from(ENCRYPTED_SAMPLE.tag, 'base64');
    tampered[0] ^= 0xFF;
    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', iv: ENCRYPTED_SAMPLE.iv, ciphertext: ENCRYPTED_SAMPLE.ciphertext, tag: tampered.toString('base64') });

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid packet header', async () => {
    const badPacket = [...VALID_PACKET];
    badPacket[0] = 0x00;
    const encrypted = encryptPacket({ data: badPacket });

    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', ...encrypted });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('invalid header');
  });

  it('returns 400 for invalid packet footer', async () => {
    const badPacket = [...VALID_PACKET];
    badPacket[254] = 0x00;
    const encrypted = encryptPacket({ data: badPacket });

    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', ...encrypted });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('invalid footer');
  });

  it('returns 400 for invalid checksum', async () => {
    const badPacket = [...VALID_PACKET];
    badPacket[252] = 0x00;
    badPacket[253] = 0x00;
    const encrypted = encryptPacket({ data: badPacket });

    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', ...encrypted });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('checksum mismatch');
  });

  it('returns 400 for invalid battery percentage', async () => {
    const badPacket = [...VALID_PACKET];
    badPacket[14] = 101;
    const encrypted = encryptPacket({ data: badPacket });

    const response = await request(app)
      .post('/api/ingest')
      .send({ gatewayId: 'gw-001', ...encrypted });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('battery percentage');
  });
});