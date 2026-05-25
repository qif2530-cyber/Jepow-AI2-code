const fs = require('fs');
let code = fs.readFileSync('deploy_aliyun.sh', 'utf8');

const regex = /location \/uploads \{[\s\S]*?\}/g;
const replacement = `location /uploads/ {\n        alias /home/admin/Jepow-AI/uploads/;\n        access_log off;\n        expires 30d;\n        add_header Cache-Control "public";\n    }`;

code = code.replace(regex, replacement);
fs.writeFileSync('deploy_aliyun.sh', code);
console.log('Fixed uploads in deploy_aliyun.sh');
