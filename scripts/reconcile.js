#!/usr/bin/env node
/**
 * Reconciliation script: compares every replayed packet against the
 * decrypted reference dataset (decrypted_packets.json).
 *
 * Reads all readings from the backend API for each device, decodes each
 * reference packet's plaintext.data (256 bytes) using the same decoder
 * logic, and matches by deviceId + sequence + deviceTimestamp.
 *
 * Reports: created packets, duplicates, rejected, failures, and any
 * reconciliation mismatches (missing, extra, or field mismatches).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = 'http://localhost:3000';
const ENCRYPTED_DATASET = path.join(__dirname, '..', 'encrypted_packets.json');
const DECRYPTED_DATASET = path.join(__dirname, '..', 'decrypted_packets.json');

// ---------- Decoder (matches src/services/decoder.js) ----------
function decodePacket(data) {
  if (!Array.isArray(data)) throw new Error('packet data must be an array');
  if (data.length !== 256) throw new Error('packet must be exactly 256 bytes');
  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    if (!Number.isInteger(val) || val < 0 || val > 255)
      throw new Error(`byte ${i} must be an integer 0-255`);
  }
  const buf = Buffer.from(data);
  if (buf[0] !== 0xA5 || buf[1] !== 0x5A)
    throw new Error('invalid header');
  if (buf[2] !== 2) throw new Error('unsupported format version');
  if (buf[254] !== 0x5A || buf[255] !== 0xA5)
    throw new Error('invalid footer');
  const sampleCount = buf[15];
  if (sampleCount !== 16) throw new Error('sample count must be 16');
  const battery = buf[14];
  if (battery < 0 || battery > 100) throw new Error('battery percentage must be 0-100');
  let checksum = 0;
  for (let i = 0; i < 252; i++) checksum = (checksum + buf[i]) % 65536;
  const storedChecksum = buf.readUInt16LE(252);
  if (checksum !== storedChecksum) throw new Error('checksum mismatch');

  const sequence = buf[3];
  const deviceId = buf.readUInt32LE(4);
  const timestamp = buf.readUInt32LE(8);
  const temperatureRaw = buf.readInt16LE(12);
  const temperature = temperatureRaw / 100;
  const samples = [];
  for (let i = 0; i < 16; i++) {
    const offset = 16 + i * 6;
    samples.push({
      x: buf.readInt16LE(offset),
      y: buf.readInt16LE(offset + 2),
      z: buf.readInt16LE(offset + 4),
    });
  }
  const labelBytes = buf.slice(112, 128);
  const labelEnd = labelBytes.indexOf(0);
  const label = labelEnd === -1 ? labelBytes.toString('ascii') : labelBytes.slice(0, labelEnd).toString('ascii');

  return { sequence, deviceId, timestamp, temperature, battery, label, samples };
}

// ---------- HTTP helpers ----------
function apiGet(endpoint, query = {}) {
  return new Promise((resolve, reject) => {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const url = `${API_BASE}${endpoint}${qs ? '?' + qs : ''}`;
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: null, raw: data });
          }
        });
      })
      .on('error', reject);
    });
}

async function getAllReadings(deviceId) {
  const all = [];
  let page = 1;
  const limit = 200;
  while (true) {
    const res = await apiGet(`/api/devices/${deviceId}/readings`, { page, limit });
    if (res.status !== 200 || !res.body) {
      throw new Error(`GET /api/devices/${deviceId}/readings failed: status ${res.status}`);
    }
    const readings = res.body.readings || [];
    all.push(...readings);
    if (all.length >= (res.body.pagination && res.body.pagination.total || 0)) break;
    if (readings.length === 0) break;
    page++;
    if (page > 50) break; // safety
  }
  return all;
}

// ---------- Main ----------
async function main() {
  console.log('=== Loading reference dataset ===');
  const encrypted = JSON.parse(fs.readFileSync(ENCRYPTED_DATASET, 'utf8'));
  const decrypted = JSON.parse(fs.readFileSync(DECRYPTED_DATASET, 'utf8'));
  console.log(`Encrypted packets: ${encrypted.length}`);
  console.log(`Decrypted packets: ${decrypted.length}`);

  // Build reference map: key = deviceId|sequence|timestampISO
  const reference = new Map();
  let decodeErrors = 0;
  for (const pkt of decrypted) {
    try {
      const decoded = decodePacket(pkt.plaintext.data);
      const key = `${decoded.deviceId}|${decoded.sequence}|${new Date(decoded.timestamp * 1000).toISOString()}`;
      reference.set(key, {
        id: pkt.id,
        sentAt: pkt.sentAt,
        deviceId: decoded.deviceId,
        sequence: decoded.sequence,
        timestamp: decoded.timestamp,
        timestampISO: new Date(decoded.timestamp * 1000).toISOString(),
        temperature: decoded.temperature,
        battery: decoded.battery,
        label: decoded.label,
        samples: decoded.samples,
      });
    } catch (e) {
      decodeErrors++;
      console.error(`[ref id ${pkt.id}] decode error: ${e.message}`);
    }
  }
  console.log(`Reference entries decoded: ${reference.size} (decode errors: ${decodeErrors})`);

  // Fetch all devices and their readings from the API
  const devRes = await apiGet('/api/devices');
  if (devRes.status !== 200) throw new Error(`GET /api/devices failed: ${devRes.status}`);
  const devices = devRes.body || [];
  console.log(`Devices in DB: ${devices.length}`);
  devices.forEach((d) => console.log(`  device ${d.deviceId}: ${d.label}, latestTemp=${d.latestTemperature}, openAlert=${d.hasOpenAlert}`));

  let totalReadings = 0;
  const matched = new Set();
  const mismatches = [];
  const missingFromDb = [];
  const extraInDb = [];

  for (const device of devices) {
    const readings = await getAllReadings(device.deviceId);
    totalReadings += readings.length;
    console.log(`\nDevice ${device.deviceId}: ${readings.length} readings fetched`);

    // Index DB readings by key
    const dbByKey = new Map();
    for (const r of readings) {
      const tsISO = new Date(r.deviceTimestamp).toISOString();
      const key = `${r.deviceId}|${r.sequence}|${tsISO}`;
      dbByKey.set(key, r);
    }

    // Check each reference packet for this device
    for (const [key, ref] of reference) {
      if (ref.deviceId !== device.deviceId) continue;
      const dbReading = dbByKey.get(key);
      if (!dbReading) {
        missingFromDb.push(ref);
        continue;
      }
      matched.add(key);

      // Compare fields
      const tempMatch = Math.abs(dbReading.temperature - ref.temperature) < 0.005;
      const batteryMatch = dbReading.battery === ref.battery;
      const labelMatch = dbReading.label === ref.label;
      const samplesMatch =
        dbReading.samples.length === ref.samples.length &&
        dbReading.samples.every((s, i) => s.x === ref.samples[i].x && s.y === ref.samples[i].y && s.z === ref.samples[i].z);

      if (!tempMatch || !batteryMatch || !labelMatch || !samplesMatch) {
        mismatches.push({
          key,
          ref: { temperature: ref.temperature, battery: ref.battery, label: ref.label },
          db: { temperature: dbReading.temperature, battery: dbReading.battery, label: dbReading.label },
          tempMatch, batteryMatch, labelMatch, samplesMatch,
        });
      }
    }

    // Check for extra readings in DB not in reference
    for (const [key, r] of dbByKey) {
      if (!matched.has(key)) {
        // Only flag if it's not a duplicate sequence within same timestamp window
        extraInDb.push({ deviceId: r.deviceId, sequence: r.sequence, timestamp: r.deviceTimestamp });
      }
    }
  }

  // Report
  console.log('\n=== RECONCILIATION RESULTS ===');
  console.log(`Reference packets: ${reference.size}`);
  console.log(`Total readings in DB: ${totalReadings}`);
  console.log(`Matched readings: ${matched.size}`);
  console.log(`Missing from DB: ${missingFromDb.length}`);
  console.log(`Field mismatches: ${mismatches.length}`);
  console.log(`Extra in DB (not in reference): ${extraInDb.length}`);

  if (missingFromDb.length > 0) {
    console.log('\n--- Missing from DB (first 10) ---');
    missingFromDb.slice(0, 10).forEach((m) => console.log(`  id=${m.id} dev=${m.deviceId} seq=${m.sequence} ts=${m.timestampISO} temp=${m.temperature} batt=${m.battery}`));
  }
  if (mismatches.length > 0) {
    console.log('\n--- Field mismatches (first 10) ---');
    mismatches.slice(0, 10).forEach((m) => {
      console.log(`  ${m.key}: ref temp=${m.ref.temperature} batt=${m.ref.battery} label=${m.ref.label} | db temp=${m.db.temperature} batt=${m.db.battery} label=${m.db.label} | temp=${m.tempMatch} batt=${m.batteryMatch} label=${m.labelMatch} samples=${m.samplesMatch}`);
    });
  }
  if (extraInDb.length > 0) {
    console.log('\n--- Extra in DB (first 10) ---');
    extraInDb.slice(0, 10).forEach((e) => console.log(`  dev=${e.deviceId} seq=${e.sequence} ts=${e.timestamp}`));
  }

  const allMatch = missingFromDb.length === 0 && mismatches.length === 0 && extraInDb.length === 0;
  console.log(`\n=== RECONCILIATION ${allMatch ? 'PASSED' : 'FAILED'} ===`);
  process.exit(allMatch ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
