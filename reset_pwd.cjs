const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = './db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const user = db.users.find(u => u.accountName === 'qif2530' || u.username === 'qif2530');
if (user) {
  user.password = bcrypt.hashSync('admin123456', 8);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('Password reset successfully.');
} else {
  console.log('User not found.');
}
