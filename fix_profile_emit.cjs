const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /      writeDB\(db\);\n      return \{ success: true, user: db\.users\[userIndex\] \};\n    \}\);/g,
  `      writeDB(db);\n      // Emit real-time profile update so other clients update instantly\n      io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: db.users[userIndex] });\n      return { success: true, user: db.users[userIndex] };\n    });`
);

code = code.replace(
  /    db.siteConfig = req.body;\n    writeDB\(db\);\n    res.json\(\{ success: true \}\);/g,
  `    db.siteConfig = req.body;\n    writeDB(db);\n    io.emit('site_config_updated', db.siteConfig);\n    res.json({ success: true, config: db.siteConfig });`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed profile and site config emits in server.ts');
