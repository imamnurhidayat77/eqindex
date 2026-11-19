const { createApp } = require('./app');
const { PORT, prodConfigProblems } = require('./config');

const problems = prodConfigProblems();
if (problems.length) {
  console.error(`[boot] refusing to start in production:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}

createApp().listen(PORT, () => console.log(`[api] listening on :${PORT}`));
