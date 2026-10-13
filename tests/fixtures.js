const crypto = require('crypto');

const TEST_KEY_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const TEST_KEY = Buffer.from(TEST_KEY_HEX, 'hex');

function encryptPacket(payload, key = TEST_KEY) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  };
}

function buildValidPacket() {
  const buf = Buffer.alloc(256);

  buf[0] = 0xA5;
  buf[1] = 0x5A;
  buf[2] = 0x02;
  buf[3] = 0x01;
  buf.writeUInt32LE(0x78563412, 4);
  buf.writeUInt32LE(0xF0DEBC9A, 8);
  buf.writeInt16LE(2500, 12);
  buf[14] = 0x64;
  buf[15] = 0x10;

  for (let i = 0; i < 16; i++) {
    const offset = 16 + i * 6;
    const base = (i + 1) * 100;
    buf.writeInt16LE(base, offset);
    buf.writeInt16LE(base + 100, offset + 2);
    buf.writeInt16LE(base + 200, offset + 4);
  }

  const label = 'DEVICE-001';
  buf.write(label, 112, 'ascii');

  buf[254] = 0x5A;
  buf[255] = 0xA5;

  let checksum = 0;
  for (let i = 0; i < 252; i++) {
    checksum = (checksum + buf[i]) % 65536;
  }
  buf.writeUInt16LE(checksum, 252);

  return Array.from(buf);
}

const VALID_PACKET = buildValidPacket();

const ENCRYPTED_SAMPLE = encryptPacket(VALID_PACKET);

module.exports = {
  TEST_KEY_HEX,
  TEST_KEY,
  encryptPacket,
  VALID_PACKET,
  ENCRYPTED_SAMPLE
};