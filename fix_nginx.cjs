const fs = require('fs');
let code = fs.readFileSync('deploy_aliyun.sh', 'utf8');

const wsBlockFull = `
    # WebSocket / Socket.io 代理
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    }

    # 上传文件代理`;

const wsBlockSimple = `
    # WebSocket / Socket.io 代理
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \\$host;
    }

    # 上传文件代理`;

// Replace first occurrence
code = code.replace(/    # 上传文件代理/, wsBlockFull);
// Replace second occurrence
code = code.replace(/    # 上传文件代理/, wsBlockFull);
// Replace third occurrence
code = code.replace(/    # 上传文件代理/, wsBlockSimple);

fs.writeFileSync('deploy_aliyun.sh', code);
console.log('Fixed deploy_aliyun.sh');
