const { createApp } = require('./app');
const { PORT } = require('./config');

createApp().listen(PORT, () => console.log(`[api] listening on :${PORT}`));
