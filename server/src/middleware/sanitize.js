// Blocks NoSQL operator injection ({"identifier": {"$ne": ""}} style attacks).
// Any key that starts with "$" or contains "." is dropped from the body, query and params before a controller sees it.
function clean(value) {
  if (Array.isArray(value)) {
    value.forEach(clean);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else clean(value[key]);
    }
  }
}

export function sanitize(req, _res, next) {
  clean(req.body);
  clean(req.params);
  // Express 5 builds req.query fresh on every read, so clean one copy and pin it
  const query = req.query;
  clean(query);
  Object.defineProperty(req, 'query', { value: query, configurable: true, enumerable: true, writable: true });
  next();
}
