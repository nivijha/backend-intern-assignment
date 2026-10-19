const crypto = require('crypto');
const { decryptPacket } = require('../src/services/decrypt');
const { decodePacket } = require('../src/services/decoder');
const {
  TEST_KEY_HEX,
  TEST_KEY,
  encryptPacket,
  VALID_PACKET,
  ENCRYPTED_SAMPLE
} = require('./fixtures');

describe('decryptPacket', () => {
  const validInput = {
    gatewayId: 'gw-001',
    ...ENCRYPTED_SAMPLE
  };

  beforeAll(() => {
    process.env.AES_KEY = TEST_KEY_HEX;
  });

  afterAll(() => {
    delete process.env.AES_KEY;
  });

  it('decrypts a valid packet and returns gatewayId, plaintext, and parsed payload', () => {
    const result = decryptPacket(validInput);
    expect(result.gatewayId).toBe('gw-001');
    expect(typeof result.plaintext).toBe('string');
    expect(result.payload).toEqual({ data: VALID_PACKET });
  });

  it('throws on missing gatewayId', () => {
    expect(() => decryptPacket({ ...validInput, gatewayId: undefined }))
      .toThrow('gatewayId is required');
  });

  it('throws on missing iv', () => {
    expect(() => decryptPacket({ ...validInput, iv: undefined }))
      .toThrow('iv is required');
  });

  it('throws on missing ciphertext', () => {
    expect(() => decryptPacket({ ...validInput, ciphertext: undefined }))
      .toThrow('ciphertext is required');
  });

  it('throws on missing tag', () => {
    expect(() => decryptPacket({ ...validInput, tag: undefined }))
      .toThrow('tag is required');
  });

  it('throws on empty iv', () => {
    expect(() => decryptPacket({ ...validInput, iv: '' }))
      .toThrow('iv is required');
  });

  it('throws on empty ciphertext', () => {
    expect(() => decryptPacket({ ...validInput, ciphertext: '' }))
      .toThrow('ciphertext is required');
  });

  it('throws on empty tag', () => {
    expect(() => decryptPacket({ ...validInput, tag: '' }))
      .toThrow('tag is required');
  });

  it('throws on invalid base64 iv', () => {
    expect(() => decryptPacket({ ...validInput, iv: '!!!' }))
      .toThrow('iv must be valid base64');
  });

  it('throws on invalid base64 ciphertext', () => {
    expect(() => decryptPacket({ ...validInput, ciphertext: '!!!' }))
      .toThrow('ciphertext must be valid base64');
  });

  it('throws on invalid base64 tag', () => {
    expect(() => decryptPacket({ ...validInput, tag: '!!!' }))
      .toThrow('tag must be valid base64');
  });

  it('throws on wrong iv length (valid base64 but wrong decoded length)', () => {
    const badIv = Buffer.alloc(8).toString('base64');
    expect(() => decryptPacket({ ...validInput, iv: badIv }))
      .toThrow('iv must be 12 bytes');
  });

  it('throws on wrong tag length (valid base64 but wrong decoded length)', () => {
    const badTag = Buffer.alloc(8).toString('base64');
    expect(() => decryptPacket({ ...validInput, tag: badTag }))
      .toThrow('tag must be 16 bytes');
  });

  it('throws on missing AES_KEY', () => {
    delete process.env.AES_KEY;
    expect(() => decryptPacket(validInput))
      .toThrow('AES_KEY is not configured');
    process.env.AES_KEY = TEST_KEY_HEX;
  });

  it('throws on AES_KEY wrong length (not 64 hex chars)', () => {
    process.env.AES_KEY = '00010203';
    expect(() => decryptPacket(validInput))
      .toThrow('AES_KEY must be 64 hexadecimal characters');
    process.env.AES_KEY = TEST_KEY_HEX;
  });

  it('throws on AES_KEY non-hex characters', () => {
    process.env.AES_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1g';
    expect(() => decryptPacket(validInput))
      .toThrow('AES_KEY must be 64 hexadecimal characters');
    process.env.AES_KEY = TEST_KEY_HEX;
  });

  it('throws on tampered ciphertext (authentication failure)', () => {
    const tampered = { ...validInput };
    const ctBuf = Buffer.from(validInput.ciphertext, 'base64');
    ctBuf[0] ^= 0xFF;
    tampered.ciphertext = ctBuf.toString('base64');
    expect(() => decryptPacket(tampered))
      .toThrow('authentication failed');
  });

  it('throws on incorrect authentication tag', () => {
    const tampered = { ...validInput };
    const tagBuf = Buffer.from(validInput.tag, 'base64');
    tagBuf[0] ^= 0xFF;
    tampered.tag = tagBuf.toString('base64');
    expect(() => decryptPacket(tampered))
      .toThrow('authentication failed');
  });

  it('throws on invalid JSON plaintext', () => {
    const key = TEST_KEY;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = 'not valid json {';
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const input = {
      gatewayId: 'gw-001',
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: tag.toString('base64')
    };
    expect(() => decryptPacket(input))
      .toThrow('plaintext is not valid JSON');
  });
});

describe('decodePacket', () => {
  it('decodes a valid packet correctly', () => {
    const result = decodePacket(VALID_PACKET);
    expect(result.sequence).toBe(1);
    expect(result.deviceId).toBe(0x78563412);
    expect(result.timestamp).toBe(0xF0DEBC9A);
    expect(result.temperature).toBe(25.00);
    expect(result.temperatureRaw).toBe(2500);
    expect(result.battery).toBe(100);
    expect(result.sampleCount).toBe(16);
    expect(result.samples).toHaveLength(16);
    expect(result.samples[0]).toEqual({ x: 100, y: 200, z: 300 });
    expect(result.samples[15]).toEqual({ x: 1600, y: 1700, z: 1800 });
    expect(result.label).toBe('DEVICE-001');
    expect(result.timestampISO).toBe(new Date(0xF0DEBC9A * 1000).toISOString());
  });

  it('throws on non-array input', () => {
    expect(() => decodePacket('not an array'))
      .toThrow('packet data must be an array');
  });

  it('throws on wrong packet length', () => {
    expect(() => decodePacket(new Array(255).fill(0)))
      .toThrow('packet must be exactly 256 bytes');
    expect(() => decodePacket(new Array(257).fill(0)))
      .toThrow('packet must be exactly 256 bytes');
  });

  it('throws on non-integer byte values', () => {
    const bad = [...VALID_PACKET];
    bad[10] = 1.5;
    expect(() => decodePacket(bad))
      .toThrow('byte 10 must be an integer 0-255');
  });

  it('throws on out-of-range byte values', () => {
    const bad = [...VALID_PACKET];
    bad[10] = 256;
    expect(() => decodePacket(bad))
      .toThrow('byte 10 must be an integer 0-255');
    bad[10] = -1;
    expect(() => decodePacket(bad))
      .toThrow('byte 10 must be an integer 0-255');
  });

  it('throws on incorrect header', () => {
    const bad = [...VALID_PACKET];
    bad[0] = 0x00;
    expect(() => decodePacket(bad))
      .toThrow('invalid header');
  });

  it('throws on incorrect footer', () => {
    const bad = [...VALID_PACKET];
    bad[254] = 0x00;
    expect(() => decodePacket(bad))
      .toThrow('invalid footer');
  });

  it('throws on incorrect version', () => {
    const bad = [...VALID_PACKET];
    bad[2] = 1;
    expect(() => decodePacket(bad))
      .toThrow('unsupported format version');
  });

  it('throws on incorrect checksum', () => {
    const bad = [...VALID_PACKET];
    bad[252] = 0x00;
    bad[253] = 0x00;
    expect(() => decodePacket(bad))
      .toThrow('checksum mismatch');
  });

  it('throws on invalid battery percentage', () => {
    const bad = [...VALID_PACKET];
    bad[14] = 101;
    expect(() => decodePacket(bad))
      .toThrow('battery percentage must be 0-100');
    bad[14] = 255;
    expect(() => decodePacket(bad))
      .toThrow('battery percentage must be 0-100');
  });

  it('throws on incorrect sample count', () => {
    const bad = [...VALID_PACKET];
    bad[15] = 15;
    expect(() => decodePacket(bad))
      .toThrow('sample count must be 16');
  });

  it('returns all 16 motion samples with correct structure', () => {
    const result = decodePacket(VALID_PACKET);
    expect(result.samples).toHaveLength(16);
    result.samples.forEach((sample, i) => {
      expect(sample).toHaveProperty('x');
      expect(sample).toHaveProperty('y');
      expect(sample).toHaveProperty('z');
      expect(typeof sample.x).toBe('number');
      expect(typeof sample.y).toBe('number');
      expect(typeof sample.z).toBe('number');
    });
  });

  it('handles label with zero padding correctly', () => {
    const result = decodePacket(VALID_PACKET);
    expect(result.label).toBe('DEVICE-001');
  });
});