// Async route wrapper: forwards rejected promises to Express error handling.
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncH };
