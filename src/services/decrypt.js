const crypto = require('crypto');

const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isValidBase64(str) {
  return BASE64_REGEX.test(str);
}

function decryptPacket({ gatewayId, iv, ciphertext, tag }) {
  if (!gatewayId || typeof gatewayId !== 'string') {
    throw new Error('gatewayId is required and must be a string');
  }

  if (!iv || typeof iv !== 'string' || iv === '') {
    throw new Error('iv is required and must be a non-empty base64 string');
  }

  if (!ciphertext || typeof ciphertext !== 'string' || ciphertext === '') {
    throw new Error('ciphertext is required and must be a non-empty base64 string');
  }

  if (!tag || typeof tag !== 'string' || tag === '') {
    throw new Error('tag is required and must be a non-empty base64 string');
  }

  if (!isValidBase64(iv)) {
    throw new Error('iv must be valid base64');
  }

  if (!isValidBase64(ciphertext)) {
    throw new Error('ciphertext must be valid base64');
  }

  if (!isValidBase64(tag)) {
    throw new Error('tag must be valid base64');
  }

  const keyHex = process.env.AES_KEY;
  if (!keyHex) {
    throw new Error('AES_KEY is not configured');
  }

  if (keyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('AES_KEY must be 64 hexadecimal characters (32 bytes)');
  }

  const key = Buffer.from(keyHex, 'hex');

  let ivBuf;
  try {
    ivBuf = Buffer.from(iv, 'base64');
  } catch (e) {
    throw new Error('iv must be valid base64');
  }

  if (ivBuf.length !== 12) {
    throw new Error('iv must be 12 bytes');
  }

  let ciphertextBuf;
  try {
    ciphertextBuf = Buffer.from(ciphertext, 'base64');
  } catch (e) {
    throw new Error('ciphertext must be valid base64');
  }

  if (ciphertextBuf.length === 0) {
    throw new Error('ciphertext cannot be empty');
  }

  let tagBuf;
  try {
    tagBuf = Buffer.from(tag, 'base64');
  } catch (e) {
    throw new Error('tag must be valid base64');
  }

  if (tagBuf.length !== 16) {
    throw new Error('tag must be 16 bytes');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);

  let plaintextBuf;
  try {
    plaintextBuf = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);
  } catch (e) {
    if (e.code === 'ERR_OSSL_EVP_WRONG_FINAL_BLOCK_LENGTH' || e.message.includes('auth')) {
      throw new Error('authentication failed: ciphertext or tag is invalid');
    }
    throw new Error('decryption failed: ' + e.message);
  }

  let plaintext;
  try {
    plaintext = plaintextBuf.toString('utf8');
  } catch (e) {
    throw new Error('plaintext is not valid UTF-8');
  }

  let payload;
  try {
    payload = JSON.parse(plaintext);
  } catch (e) {
    throw new Error('plaintext is not valid JSON');
  }

  return {
    gatewayId,
    plaintext,
    payload
  };
}

module.exports = { decryptPacket };