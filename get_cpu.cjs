const fs = require('fs');
const cp = require('child_process');
try {
  console.log(cp.execSync('ps aux --sort=-%cpu | head -n 10', {encoding:'utf8'}));
} catch(e) {
  console.error(e.message);
}
