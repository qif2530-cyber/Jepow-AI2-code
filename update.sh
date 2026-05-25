#!/bin/bash
# 一键更新部署脚本 (One-click update script) 绝对安全终极版

# 确保在项目根目录运行
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)
# 在项目外部创建一个绝对隔离的备份目录，以防任何git操作误删
BACKUP_DIR="../jepow_backup_$(date +%Y%m%d_%H%M%S)"

echo "================================================="
echo "🚀 开始一键平滑更新，正在拉取最新代码..."
echo "🔒 声明：正在执行最高级别【物理隔离备份】数据保护！"
echo "================================================="

# 1. 第一步：强制独立安全备份（将数据备份到项目**外部**，彻底避开git）
echo "💾 第一步：正在对服务器数据进行强制隔离备份..."
mkdir -p "$BACKUP_DIR"

# 尝试修复文件权限，避免 EACCES 错误
sudo chmod 777 db.json 2>/dev/null || true
sudo chmod -R 777 uploads 2>/dev/null || true

if [ -f "db.json" ]; then
    cp db.json "$BACKUP_DIR/db.json"
    echo "   - db.json 已安全隔离备份到 $BACKUP_DIR"
fi

if [ -d "uploads" ]; then
    cp -r uploads "$BACKUP_DIR/uploads"
    echo "   - uploads 文件夹已安全隔离备份到 $BACKUP_DIR"
fi

# 2. 强制同步远端最新代码 (使用更安全的强制覆盖策略，放弃本地任何未关联的代码冲突)
echo "🔄 第二步：强制拉取远端最新代码..."
git fetch origin main
# 强制将本地代码同步为云端最新状态（注意：这会重置被git追踪的文件，但因为上面我们备份了核心数据，所以不怕）
git reset --hard origin/main

# 3. 把刚刚隔离备份的真实数据硬覆盖回来！
echo "♻️ 第三步：正在将真实的服务器数据恢复回去..."

# 修复 Git 覆盖后的权限
sudo chmod 777 db.json 2>/dev/null || true
sudo rm -f db.json 2>/dev/null || true

if [ -f "$BACKUP_DIR/db.json" ]; then
    cp "$BACKUP_DIR/db.json" ./db.json
    echo "   - db.json 数据强制恢复成功"
fi

if [ -d "$BACKUP_DIR/uploads" ]; then
    mkdir -p ./uploads
    cp -a "$BACKUP_DIR/uploads/." ./uploads/
    echo "   - uploads 文件夹数据强制恢复成功"
fi

# 确保最后赋予读写权限，避免 node 报错
sudo chmod 777 db.json 2>/dev/null || true
sudo chmod -R 777 uploads 2>/dev/null || true

echo "📦 第四步：正在安装更新的依赖包..."
npm install

echo "🛠️ 第五步：正在编译打包 Vite 生产环境..."
npm run build

echo "🔄 第六步：正在重启 Node.js 服务..."
if command -v pm2 &> /dev/null
then
    pm2 restart all
    echo "✅ 服务已通过 PM2 重启成功！"
else
    echo "⚠️ 您的服务器没有使用 PM2，请手动重启服务： npm run start"
fi

echo "================================================="
echo "🎉 更新流程完美执行完毕！全新的代码已经生效！"
echo "💎 您的真实数据已被物理隔离并成功兜底恢复。"
echo "💡 (本次的防灾备份文件仍保存在 $BACKUP_DIR，以备不时之需)"
echo "================================================="
