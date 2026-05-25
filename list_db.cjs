const fs = require('fs');
console.log('files:', fs.readdirSync('.').filter(f => f.includes('db.json')));
