#!/usr/bin/env node
const http = require('http');

function apiGet(endpoint, query = {}) {
  return new Promise((resolve, reject) => {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    http.get(`http://localhost:3000${endpoint}${qs ? '?' + qs : ''}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: null, raw: data }); }
      });
    }).on('error', reject);
  });
}

function apiPatch(endpoint, body = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3000, path: endpoint, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify(body)) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: null, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // 1. Get open alerts
  const openRes = await apiGet('/api/alerts', { status: 'open' });
  console.log('Open alerts:', openRes.body.length);
  const target = openRes.body[0];
  console.log('Target alert:', target._id, target.type, 'device', target.deviceId, 'acknowledged:', target.acknowledged);

  // 2. Acknowledge it
  const ackRes = await apiPatch(`/api/alerts/${target._id}`);
  console.log('Acknowledge response:', ackRes.status, ackRes.body.acknowledged);

  // 3. Verify acknowledged in 'all' view
  const allRes = await apiGet('/api/alerts', { status: 'all' });
  const ackedAlert = allRes.body.find((a) => a._id === target._id);
  console.log('In all view - acknowledged:', ackedAlert ? ackedAlert.acknowledged : 'NOT FOUND');

  // 4. Verify removed from open view
  const openRes2 = await apiGet('/api/alerts', { status: 'open' });
  const stillOpen = openRes2.body.find((a) => a._id === target._id);
  console.log('Still in open view:', stillOpen ? 'YES (BUG)' : 'NO (correct)');
  console.log('Open alert count now:', openRes2.body.length, '(was 11, now should be 10)');

  // 5. Verify acknowledging again is idempotent
  const ackRes2 = await apiPatch(`/api/alerts/${target._id}`);
  console.log('Re-acknowledge response:', ackRes2.status, ackRes2.body.acknowledged);

  const allOk = ackRes.status === 200 &&
    ackedAlert && ackedAlert.acknowledged === true &&
    !stillOpen &&
    openRes2.body.length === 10 &&
    ackRes2.status === 200;
  console.log(`\n=== ACKNOWLEDGEMENT TEST: ${allOk ? 'PASSED' : 'FAILED'} ===`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
