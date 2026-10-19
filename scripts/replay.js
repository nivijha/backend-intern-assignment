#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_API_URL = 'http://localhost:3000';
const DEFAULT_SPEED = 1;
const ENCRYPTED_DATASET = path.join(__dirname, '..', 'encrypted_packets.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    apiUrl: DEFAULT_API_URL,
    speed: DEFAULT_SPEED,
    datasetPath: ENCRYPTED_DATASET,
    limit: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--api':
        config.apiUrl = args[++i];
        break;
      case '--speed':
        config.speed = parseFloat(args[++i]) || DEFAULT_SPEED;
        break;
      case '--dataset':
        config.datasetPath = args[++i];
        break;
      case '--limit':
        config.limit = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
Usage: node scripts/replay.js [options]

Options:
  --api <url>        API base URL (default: ${DEFAULT_API_URL})
  --speed <number>   Speed multiplier (default: ${DEFAULT_SPEED})
  --dataset <path>   Path to encrypted_packets.json (default: ${ENCRYPTED_DATASET})
  --limit <number>   Limit number of records to replay
  --help             Show this help
        `);
        process.exit(0);
    }
  }

  return config;
}

async function replay(config) {
  if (!fs.existsSync(config.datasetPath)) {
    console.error(`Dataset not found: ${config.datasetPath}`);
    process.exit(1);
  }

  console.log(`Loading dataset from ${config.datasetPath}...`);
  const rawData = fs.readFileSync(config.datasetPath, 'utf8');
  const packets = JSON.parse(rawData);

  if (!Array.isArray(packets)) {
    console.error('Dataset must be an array of packet objects');
    process.exit(1);
  }

  if (config.limit) {
    packets.length = config.limit;
  }

  console.log(`Loaded ${packets.length} packets`);
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Speed: ${config.speed}x`);
  console.log('Starting replay...\n');

  const client = axios.create({
    baseURL: config.apiUrl,
    timeout: 10000
  });

  let lastSentAt = null;
  let sent = 0;
  let created = 0;
  let duplicates = 0;
  let rejected = 0;
  let failed = 0;
  let alertsCreated = 0;

  const startTime = Date.now();

  for (const packet of packets) {
    const sentAt = new Date(packet.sentAt).getTime();

    if (lastSentAt !== null) {
      const delay = (sentAt - lastSentAt) / config.speed;
      if (delay > 0) {
        await sleep(Math.min(delay, 5000));
      }
    }

    const body = packet.body;
    if (!body || !body.gatewayId || !body.iv || !body.ciphertext || !body.tag) {
      console.error(`[${packet.id}] Invalid packet structure, skipping`);
      rejected++;
      continue;
    }

    try {
      const response = await client.post('/api/ingest', {
        gatewayId: body.gatewayId,
        iv: body.iv,
        ciphertext: body.ciphertext,
        tag: body.tag
      });

      if (response.status === 201) {
        created++;
      } else if (response.status === 200) {
        duplicates++;
      } else {
        rejected++;
      }

      if (response.data && response.data.alertsCreated) {
        alertsCreated += response.data.alertsCreated;
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 400) {
          rejected++;
        } else {
          failed++;
        }
        console.error(`[${packet.id}] HTTP ${error.response.status}: ${error.response.data?.error || error.message}`);
      } else {
        failed++;
        console.error(`[${packet.id}] ${error.message}`);
      }
    }

    sent++;
    lastSentAt = sentAt;

    if (sent % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Progress: ${sent}/${packets.length} (${((sent/packets.length)*100).toFixed(1)}%) | Created: ${created} | Duplicates: ${duplicates} | Rejected: ${rejected} | Failed: ${failed} | Alerts: ${alertsCreated} | Elapsed: ${elapsed}s`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== REPLAY SUMMARY ===');
  console.log(`Total packets:    ${packets.length}`);
  console.log(`Sent:             ${sent}`);
  console.log(`Created (201):    ${created}`);
  console.log(`Duplicates (200): ${duplicates}`);
  console.log(`Rejected (400):   ${rejected}`);
  console.log(`Failed (other):   ${failed}`);
  console.log(`Alerts created:   ${alertsCreated}`);
  console.log(`Total time:       ${totalTime}s`);
  console.log(`Effective speed:  ${(packets.length / totalTime * config.speed).toFixed(2)}x recorded time`);

  if (failed > 0) {
    process.exit(1);
  }
}

const config = parseArgs();
replay(config).catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});