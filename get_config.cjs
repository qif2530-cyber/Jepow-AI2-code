const fs = require('fs');
const path = require('path');
const os = require('os');

const isProd = true; // Try production path first
let PersistentDataDir = path.join(os.homedir(), '.jepow-data');
let dbPath = path.join(PersistentDataDir, 'db.json');

if (!fs.existsSync(dbPath)) {
  PersistentDataDir = process.cwd();
  dbPath = path.join(PersistentDataDir, 'db.json');
}

console.log("DB PATH:", dbPath);
if (fs.existsSync(dbPath)) {
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    console.log("--- CONFIG ---");
    console.log(JSON.stringify(db.config, null, 2));
    console.log("--------------");
  } catch (e) {
    console.error("Error reading db:", e);
  }
} else {
  console.log("DB file not found!");
}
