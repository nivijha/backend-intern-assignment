module.exports = {
  testEnvironment: 'node',

  // Run test suites serially. All DB-backed suites (phase3, phase4, phase5)
  // share one MongoDB database and each suite's afterAll drops/clears
  // collections, so parallel workers clobber each other's data and produce
  // intermittent failures. Serial execution is the documented interim measure
  // until each suite can be fully isolated with its own database/connection.
  maxWorkers: 1,

  // Force every suite onto a dedicated test database so the development
  // database (default `test` from MONGODB_URI) is never dropped or cleared
  // by the test suite.
  setupFiles: ['./tests/jest.setup.js']

};
