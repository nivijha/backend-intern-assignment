const request = require('supertest');
const app = require('../src/app');

describe('GET /api/health', () => {
  it('should return 200 OK', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
  });

  it('should return expected JSON structure', async () => {
    const response = await request(app).get('/api/health');
    
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('service', 'backend-intern-assignment');
    expect(response.body).toHaveProperty('timestamp');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('should return valid ISO timestamp', async () => {
    const response = await request(app).get('/api/health');
    const timestamp = new Date(response.body.timestamp);
    expect(timestamp.toString()).not.toBe('Invalid Date');
  });
});