const fs = require('fs');
let code = fs.readFileSync('deploy_aliyun.sh', 'utf8');

// 1. 添加更多的二进制镜像
const mirrorConfig = `
npm config set registry https://registry.npmmirror.com
export SHARP_BINARY_HOST="https://npmmirror.com/mirrors/sharp-libvips"
export SHARP_LIBVIPS_BINARY_HOST="https://npmmirror.com/mirrors/sharp-libvips"
export CANVAS_BINARY_HOST_MIRROR="https://registry.npmmirror.com/-/binary/canvas"
export NODE_SQLITE3_BINARY_HOST_MIRROR="https://registry.npmmirror.com/-/binary/node-sqlite3"
export PUPPETEER_DOWNLOAD_HOST="https://img.ucweb.com/s/uae/g/08/20180412782/node-v10.15.3-linux-x64.tar.xz"
`;

if (!code.includes('CANVAS_BINARY_HOST_MIRROR')) {
    code = code.replace(/npm config set registry.*/, mirrorConfig);
}

// 2. 增加安装时的超时设置和内存限制
code = code.replace(/npm install --no-audit.*/, 'npm install --no-audit --no-fund --legacy-peer-deps --network-timeout=300000');

fs.writeFileSync('deploy_aliyun.sh', code);
console.log('Optimized deploy_aliyun.sh for faster installation');
