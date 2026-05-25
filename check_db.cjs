const fs = require('fs');
const path = require('path');
const isProd = process.env.NODE_ENV === 'production';
const os = require('os');
const PersistentDataDir = isProd ? path.join(os.homedir(), '.jepow-data') : process.cwd();
const dbPath = process.env.DB_PATH || path.join(PersistentDataDir, 'db.json');

try {
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  console.log("Total projects:", data.projects ? data.projects.length : 0);
  if (data.projects) {
    data.projects.forEach(p => {
      console.log(`- ID: ${p.id}, Name: ${p.name}, User: ${p.userId}, Nodes: ${p.data?.nodes?.length || 0}`);
    });
  }
} catch (e) {
  console.error("Error:", e.message);
}
