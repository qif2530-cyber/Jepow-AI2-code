/** Serves built frontend only — no API. Desktop API calls go to jepow.com */
const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT) || 38472;
const HOST = process.env.HOST || '127.0.0.1';
const appRoot = process.env.JEPOW_APP_ROOT || path.join(__dirname, '..');
const distPath = path.join(appRoot, 'dist');

if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  console.error('[static-server] dist/index.html not found. Run: npm run build');
  process.exit(1);
}

const app = express();
app.use(express.static(distPath, { maxAge: '1d' }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`[static-server] http://${HOST}:${PORT}`);
});
