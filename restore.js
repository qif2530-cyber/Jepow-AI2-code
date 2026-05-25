import fs from 'fs';
import path from 'path';

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const DB_FILE = path.join(process.cwd(), 'db.json');

console.log("=====================================");
console.log("🚨 紧急数据恢复向导 (Emergency Restore)");
console.log("=====================================\n");

if (!fs.existsSync(BACKUP_DIR)) {
    console.error("❌ 错误：未找到 backups 文件夹。");
    process.exit(1);
}

const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('db_backup_'))
    .sort((a, b) => b.localeCompare(a)); // 降序，最新的在前面

if (files.length === 0) {
    console.error("❌ 错误：在 backups 文件夹中未找到任何备份文件。");
    process.exit(1);
}

const latestBackup = files[0];
const backupPath = path.join(BACKUP_DIR, latestBackup);

console.log(`✅ 找到最新备份文件: ${latestBackup}`);

try {
    const backupData = fs.readFileSync(backupPath, 'utf8');
    const parsed = JSON.parse(backupData);
    
    // 简单验证备份文件是否有效
    if (parsed.users && parsed.posts) {
        console.log(`📦 检查备份数据：共 ${parsed.users.length} 个用户, ${parsed.posts.length} 篇帖子.`);
        
        // 覆盖 db.json
        fs.writeFileSync(DB_FILE, backupData, 'utf8');
        console.log(`\n🎉 恢复成功！db.json 已被还原。`);
        console.log(`\n👉 下一步：请运行 npm run start 或重启 pm2，然后刷新网页查看您的数据。`);
    } else {
        console.error("❌ 备份文件内容格式似乎不正确。");
    }
} catch (e) {
    console.error("❌ 读取或恢复备份时发生错误：", e);
}
