function decodePacket(data) {
  if (!Array.isArray(data)) {
    throw new Error('packet data must be an array');
  }

  if (data.length !== 256) {
    throw new Error('packet must be exactly 256 bytes, got ' + data.length);
  }

  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    if (!Number.isInteger(val) || val < 0 || val > 255) {
      throw new Error('byte ' + i + ' must be an integer 0-255, got ' + val);
    }
  }

  const buf = Buffer.from(data);

  if (buf[0] !== 0xA5 || buf[1] !== 0x5A) {
    throw new Error('invalid header: expected 0xA5 0x5A, got 0x' + buf[0].toString(16).padStart(2, '0') + ' 0x' + buf[1].toString(16).padStart(2, '0'));
  }

  if (buf[2] !== 2) {
    throw new Error('unsupported format version: ' + buf[2] + ', expected 2');
  }

  if (buf[254] !== 0x5A || buf[255] !== 0xA5) {
    throw new Error('invalid footer: expected 0x5A 0xA5, got 0x' + buf[254].toString(16).padStart(2, '0') + ' 0x' + buf[255].toString(16).padStart(2, '0'));
  }

  const sampleCount = buf[15];
  if (sampleCount !== 16) {
    throw new Error('sample count must be 16, got ' + sampleCount);
  }

  const battery = buf[14];
  if (battery < 0 || battery > 100) {
    throw new Error('battery percentage must be 0-100, got ' + battery);
  }

  let checksum = 0;
  for (let i = 0; i < 252; i++) {
    checksum = (checksum + buf[i]) % 65536;
  }
  const storedChecksum = buf.readUInt16LE(252);
  if (checksum !== storedChecksum) {
    throw new Error('checksum mismatch: calculated ' + checksum + ', stored ' + storedChecksum);
  }

  const sequence = buf[3];
  const deviceId = buf.readUInt32LE(4);
  const timestamp = buf.readUInt32LE(8);
  const temperatureRaw = buf.readInt16LE(12);
  const temperature = temperatureRaw / 100;

  const samples = [];
  for (let i = 0; i < 16; i++) {
    const offset = 16 + i * 6;
    const x = buf.readInt16LE(offset);
    const y = buf.readInt16LE(offset + 2);
    const z = buf.readInt16LE(offset + 4);
    samples.push({ x, y, z });
  }

  const labelBytes = buf.slice(112, 128);
  const labelEnd = labelBytes.indexOf(0);
  const label = labelEnd === -1 ? labelBytes.toString('ascii') : labelBytes.slice(0, labelEnd).toString('ascii');

  return {
    sequence,
    deviceId,
    timestamp,
    timestampISO: new Date(timestamp * 1000).toISOString(),
    temperature,
    temperatureRaw,
    battery,
    sampleCount,
    samples,
    label
  };
}

module.exports = { decodePacket };