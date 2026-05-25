const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /      db\.users\[userIndex\]\.certifications\.push\(newCert\);\n      writeDB\(db\);\n      return db\.users\[userIndex\];/g,
  `      db.users[userIndex].certifications.push(newCert);\n      writeDB(db);\n      io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: db.users[userIndex] });\n      return db.users[userIndex];`
);

code = code.replace(
  /      db\.users\[userIndex\]\.certifications = db\.users\[userIndex\]\.certifications\.filter\(\(c: any\) => c\.id !== certId\);\n      writeDB\(db\);\n      return \{ success: true \};/g,
  `      db.users[userIndex].certifications = db.users[userIndex].certifications.filter((c: any) => c.id !== certId);\n      writeDB(db);\n      io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: db.users[userIndex] });\n      return { success: true };`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed certifications event emit in server.ts');
