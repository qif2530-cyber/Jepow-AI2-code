#!/bin/bash

# ========================================================
# Jepow AI 阿里云全新原机全自动部署脚本 (证书冲突与权限终极修复版)
# 适用场景: 全新重置的 Ubuntu 22.04 实例
# ========================================================

set -e

# --- 配置变量 ---
GIT_REPO="https://gitee.com/jepow/Jepow-AI2-code.git"
PROJECT_DIR="/home/admin/Jepow-AI2-code"
CERT_DIR="/etc/nginx/cert"
DOMAIN="www.jepow.com"
MAIN_DOMAIN="jepow.com"
CURRENT_USER=${SUDO_USER:-$(whoami)}

echo "🌟 1. 系统更新与依赖安装 (Nginx, Git, 图形库)..."
sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get update
sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get install -yq curl git nginx ufw build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

echo "🟢 2. 安装/更新 Node.js v22 (使用官方的 NodeSource 源，最稳定)..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2-3)" != "22" ]; then
    echo "💡 正在安装 Node.js 22.x..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get install -yq nodejs
fi
echo "Node.js 版本: $(node -v)"
echo "npm 版本: $(npm -v)"

echo "📂 3. 拉取与更新代码..."
cd /home/admin
sudo chmod 755 /home/admin

if [ -d "$PROJECT_DIR" ]; then
    echo "🗑️ 发现已有代码目录，执行清理..."
    # no need to backup db.json/uploads since they correctly live in DATA_DIR now
    # We will just remove the directory
    sudo rm -rf "$PROJECT_DIR"
fi

sudo git clone "$GIT_REPO" "$PROJECT_DIR"
cd "$PROJECT_DIR"

DATA_DIR="/home/admin/.jepow-data"
mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/db.json" ] || [ ! -s "$DATA_DIR/db.json" ]; then
    if [ -f "/home/admin/db_backup.json" ]; then
        sudo cp "/home/admin/db_backup.json" "$DATA_DIR/db.json"
        sudo cp "/home/admin/db_backup.json" "$PROJECT_DIR/db.json"
        sudo chown admin:admin "$DATA_DIR/db.json" "$PROJECT_DIR/db.json"
        echo "✅ 数据库已从 admin 备份中恢复"
    elif [ -f "/root/.jepow-data/db.json" ]; then
        sudo cp "/root/.jepow-data/db.json" "$DATA_DIR/db.json"
        sudo cp "/root/.jepow-data/db.json" "$PROJECT_DIR/db.json"
        sudo chown admin:admin "$DATA_DIR/db.json" "$PROJECT_DIR/db.json"
        echo "✅ 数据库已从 root/.jepow-data 中恢复"
    elif [ -f "/root/Jepow-AI/db.json" ]; then
        sudo cp "/root/Jepow-AI/db.json" "$DATA_DIR/db.json"
        sudo cp "/root/Jepow-AI/db.json" "$PROJECT_DIR/db.json"
        sudo chown admin:admin "$DATA_DIR/db.json" "$PROJECT_DIR/db.json"
        echo "✅ 数据库已从 root/Jepow-AI 中恢复"
    fi
fi

# ============== 终极数据恢复机制 ==============
echo "🔎 正在全盘扫描历史数据库备份（这可能需要几秒钟）..."
# 寻找当前系统里所有名叫 db.json 的文件，排除临时运行时的文件，并按文件大小排序找最大的。
LARGEST_DB=$(sudo find /root /home /opt /var/www -name "db.json" -type f 2>/dev/null | xargs -r ls -S -la --time-style=long-iso 2>/dev/null | head -n 1 | awk '{print $8}')
# 注意上面的 ls 取了有大小的 db.json

if [ -n "$LARGEST_DB" ]; then
    LARGEST_DB_SIZE=$(sudo wc -c < "$LARGEST_DB")
    CURRENT_DB_SIZE=0
    if [ -f "$DATA_DIR/db.json" ]; then
        CURRENT_DB_SIZE=$(sudo wc -c < "$DATA_DIR/db.json")
    fi
    # 如果找到了一个比当前数据库大至少 50 字节的历史数据库，我们认为它是包含真实数据的旧数据库
    if [ "$LARGEST_DB_SIZE" -gt $((CURRENT_DB_SIZE + 50)) ]; then
        echo "🚨 发现隐藏的旧数据库备份！绝对路径: $LARGEST_DB, 大小: $LARGEST_DB_SIZE 字节"
        echo "🔄 正在自动为您恢复真实数据到 $DATA_DIR/db.json"
        sudo cp "$LARGEST_DB" "$DATA_DIR/db.json"
        sudo cp "$LARGEST_DB" "$PROJECT_DIR/db.json"
        sudo chown admin:admin "$DATA_DIR/db.json" "$PROJECT_DIR/db.json"
        # 同时尝试找上传的图片
        OLD_UPLOAD_DIR=$(dirname "$LARGEST_DB")/uploads
        if [ -d "$OLD_UPLOAD_DIR" ]; then
            echo "🖼️ 发现对应的图片上传目录：$OLD_UPLOAD_DIR ，正在恢复..."
            sudo cp -rn "$OLD_UPLOAD_DIR/"* "$DATA_DIR/uploads/" 2>/dev/null || true
            sudo chown -R admin:www-data "$DATA_DIR/uploads"
        fi
        echo "✅ 全盘深度数据恢复成功！"
    fi
fi
# ============================================

mkdir -p "$DATA_DIR/uploads"

if [ ! -d "$DATA_DIR/uploads" ] || [ -z "$(ls -A "$DATA_DIR/uploads" 2>/dev/null)" ]; then
    if [ -d "/home/admin/uploads_backup" ]; then
        sudo cp -r "/home/admin/uploads_backup/"* "$DATA_DIR/uploads/" 2>/dev/null || true
        echo "✅ 上传文件夹已从 admin 备份中恢复"
    elif [ -d "/root/.jepow-data/uploads" ]; then
        sudo cp -r "/root/.jepow-data/uploads/"* "$DATA_DIR/uploads/" 2>/dev/null || true
        echo "✅ 上传文件夹已从 root 备份中恢复"
    elif [ -d "/root/Jepow-AI/uploads" ]; then
        sudo cp -r "/root/Jepow-AI/uploads/"* "$DATA_DIR/uploads/" 2>/dev/null || true
        echo "✅ 上传文件夹已从 root 旧目录中恢复"
    fi
fi

if [ -d "$PROJECT_DIR/uploads" ] && [ ! -L "$PROJECT_DIR/uploads" ]; then
    sudo rm -rf "$PROJECT_DIR/uploads"
fi

if [ ! -e "$PROJECT_DIR/uploads" ]; then
    sudo ln -s "$DATA_DIR/uploads" "$PROJECT_DIR/uploads"
fi

# 确保目录完全归属于当前用户 (admin)
sudo chown -R $CURRENT_USER:$CURRENT_USER "$PROJECT_DIR"
sudo chown -R $CURRENT_USER:$CURRENT_USER ~/.npm || true

echo "📦 4. 配置 npm 加速镜像并安装依赖..."
# 指定系统级的临时目录与缓存，避免 sudo 执行时引发权限错误
npm config set registry https://registry.npmmirror.com
export SHARP_BINARY_HOST="https://npmmirror.com/mirrors/sharp-libvips"
export SHARP_LIBVIPS_BINARY_HOST="https://npmmirror.com/mirrors/sharp-libvips"
export CANVAS_BINARY_HOST_MIRROR="https://registry.npmmirror.com/-/binary/canvas"
export NODE_SQLITE3_BINARY_HOST_MIRROR="https://registry.npmmirror.com/-/binary/node-sqlite3"

echo "🧹 确保 npm 缓存与 node_modules 是干净的..."
sudo rm -rf node_modules package-lock.json
npm cache clean --force

echo "👇 正式开始 npm install (跳过 Electron 桌面包下载，预计 2-5 分钟)..."
# 阿里云只部署网站，不需下载 Electron；避免从国外源拉取导致 socket hang up
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export npm_config_electron_mirror="https://npmmirror.com/mirrors/electron/"
# 使用当前用户级进行安装，防止 root 引发的 EACCES
npm install --no-audit --no-fund --legacy-peer-deps --network-timeout=300000 || {
  echo "⚠️ 安装中断，清理 node_modules 后重试..."
  rm -rf node_modules
  npm install --no-audit --no-fund --legacy-peer-deps --network-timeout=300000
}

echo "🛠️ 5. 构建前端产物..."
npm run build

echo "🔧 6. 修复系统目录权限 (解决 Nginx 500 报错)..."
# 让运行 Nginx 的 www-data 用户可以顺利穿透 admin 的目录结构读取 /dist
sudo chmod 755 /home/admin
sudo chmod 755 "$PROJECT_DIR"
sudo chmod -R 755 "$PROJECT_DIR/dist"

echo "🌐 7. 配置 Nginx 站点代理与 HTTPS 降级验证..."
sudo mkdir -p "$CERT_DIR"
sudo chmod 755 "$CERT_DIR"

CRT_FILE="$CERT_DIR/$DOMAIN.pem"
KEY_FILE="$CERT_DIR/$DOMAIN.key"

USE_SSL=false
if [ -f "$CRT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "✅ 检测到证书文件，尝试启用 HTTPS"
    USE_SSL=true
else
    echo "❌ 未检测到证书 ($CRT_FILE)，将以 HTTP 模式启动。"
fi

if [ "$USE_SSL" = true ]; then
    sudo tee /etc/nginx/sites-available/jepow <<EOF
server {
    listen 80;
    server_name $MAIN_DOMAIN $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name $MAIN_DOMAIN $DOMAIN;
    ssl_certificate $CRT_FILE;
    ssl_certificate_key $KEY_FILE;

    # 后端接口代理
    location /api {
        client_max_body_size 500M;
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }





    # WebSocket / Socket.io 代理
    location /socket.io/ {
        client_max_body_size 500M;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # 上传文件代理
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        add_header Cache-Control "public";
        add_header 'Access-Control-Allow-Origin' '*';
    }

    # 前端静态资源
    location / {
        root $PROJECT_DIR/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
else
    sudo tee /etc/nginx/sites-available/jepow <<EOF
server {
    listen 80;
    server_name $MAIN_DOMAIN $DOMAIN;

    location /api {
        client_max_body_size 500M;
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }


    # WebSocket / Socket.io 代理
    location /socket.io/ {
        client_max_body_size 500M;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # 上传文件代理
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        add_header Cache-Control "public";
        add_header 'Access-Control-Allow-Origin' '*';
    }

    location / {
        root $PROJECT_DIR/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
fi

sudo ln -sf /etc/nginx/sites-available/jepow /etc/nginx/sites-enabled/default
sudo rm -f /etc/nginx/sites-enabled/jepow-ai || true # 移除旧版可能的软链接

if sudo nginx -t; then
    sudo systemctl restart nginx
else
    echo "❌ 警告：Nginx SSL 证书验证不通过！退回为安全无忧的 HTTP 模式！"
    sudo tee /etc/nginx/sites-available/jepow <<EOF
server {
    listen 80;
    server_name $MAIN_DOMAIN $DOMAIN;
    location /api {
        client_max_body_size 500M;
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_set_header Host \$host;
    }

    # WebSocket / Socket.io 代理
    location /socket.io/ {
        client_max_body_size 500M;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # 上传文件代理
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        add_header Cache-Control "public";
        add_header 'Access-Control-Allow-Origin' '*';
    }
    location / {
        root $PROJECT_DIR/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
    sudo nginx -t && sudo systemctl restart nginx
    USE_SSL=false
fi

# 确保上传目录存在并设置权限
echo "📂 7. 设置目录权限与环境 (确保 Nginx 有权访问 uploads)..."
DATA_DIR="/home/admin/.jepow-data"
mkdir -p "$DATA_DIR/uploads"
if [ ! -e "$PROJECT_DIR/uploads" ]; then
    sudo ln -s "$DATA_DIR/uploads" "$PROJECT_DIR/uploads"
fi

sudo chmod 755 /home/admin
sudo chmod 755 "$DATA_DIR"
sudo chmod -R 755 "$PROJECT_DIR"
# 专门给 uploads 目录设置权限，确保 www-data (Nginx 用户) 可读
sudo chown -R $CURRENT_USER:www-data "$DATA_DIR/uploads"
sudo chmod -R 775 "$DATA_DIR/uploads"

echo "🚀 8. 启动 Node.js 后端服务 (PM2)..."
if ! command -v pm2 >/dev/null 2>&1; then
    sudo npm install -g pm2 --registry=https://registry.npmmirror.com
fi

# 停止旧进程
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true
sudo pkill -f node || true

# 启动新进程
cd "$PROJECT_DIR"
NODE_ENV=production pm2 start server.ts --name jepow-ai --interpreter="npx" --interpreter-args="tsx"
pm2 save
# 设置服务器重启自动拉起 pm2
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $CURRENT_USER --hp /home/admin >/dev/null 2>&1 || true

echo "================================================"
if [ "$USE_SSL" = true ]; then
    echo "🎉 完美！【HTTPS】已正常上线！"
    echo "👉 访问网站: https://$DOMAIN"
else
    echo "⚠️ 部署已完成并正常启动！"
    echo "🔐 目前证书暂未生效，以【HTTP】模式运行中。"
    echo "👉 访问网站: http://$DOMAIN"
    echo "💡 若想开启 HTTPS，请前往阿里云控制台一键部署证书至 $CERT_DIR，完成后再运行本部署脚本一次即可。"
fi
echo "================================================"

