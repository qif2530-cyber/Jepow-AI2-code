const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = './db.json';
const newPassword = process.argv[2] || 'admin123456';

if (!fs.existsSync(dbPath)) {
  console.error("error: db.json not found in current directory!");
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const user = db.users.find(u => u.accountName === 'qif2530' || u.username === 'qif2530' || u.role === 'super_admin' || String(u.id) === String(db.users[0]?.id));
if (user) {
  user.password = bcrypt.hashSync(newPassword, 8);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`✅ 超级管理员 (${user.accountName || user.username}) 的密码已成功重置为: ${newPassword}`);
  console.log(`请立刻使用此密码登录并尽早在前台或后台修改真实密码！`);
} else {
  console.log('未找到管理员账号。');
}
