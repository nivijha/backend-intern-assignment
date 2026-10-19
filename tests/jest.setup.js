// Route the test suite onto a dedicated MongoDB database so the development
// database (the default `test` database from MONGODB_URI) is never dropped,
// cleared, or otherwise mutated by the test suite.
//
// dotenv.config() in each test file does NOT overwrite variables that are
// already set, and this setup file runs before test modules are evaluated, so
// the value set here takes precedence over .env.
(function dedicateTestDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return;
  }

  const TEST_DB_NAME = 'backend_intern_assignment_test';
  const [pathless, query] = uri.split('?');

  // Split off the scheme so we can locate the authority and any db path.
  const schemeIdx = pathless.indexOf('://');
  if (schemeIdx === -1) {
    return;
  }
  const scheme = pathless.slice(0, schemeIdx + '://'.length);
  const rest = pathless.slice(scheme.length);

  // Authority ends at the last '@' (separating user:pass from host) when
  // credentials are present; otherwise the host begins right after the scheme.
  const atIdx = rest.lastIndexOf('@');
  const authorityEnd = atIdx === -1 ? 0 : atIdx + 1;
  const hostPart = rest.slice(authorityEnd);
  const slashIdx = hostPart.indexOf('/');

  let newUri;
  if (slashIdx === -1) {
    // No database path present → append the dedicated test database.
    newUri = pathless + '/' + TEST_DB_NAME;
  } else {
    // Replace any existing database path with the dedicated test database.
    newUri =
      pathless.slice(0, pathless.length - hostPart.length) +
      hostPart.slice(0, slashIdx) +
      '/' +
      TEST_DB_NAME;
  }

  process.env.MONGODB_URI = query ? newUri + '?' + query : newUri;
})();
