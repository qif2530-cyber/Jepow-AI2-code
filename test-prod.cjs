const fs = require('fs');
const path = require('path');
const os = require('os');
const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(os.homedir(), '.jepow-data'));
const PersistentDataDir = isProd ? path.join(os.homedir(), '.jepow-data') : process.cwd();
console.log({isProd, PersistentDataDir});
