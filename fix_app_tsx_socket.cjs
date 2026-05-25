const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /    socket\.on\('credits_updated', \(data: \{ credits: number \}\) => \{/g,
  `    socket.on('site_config_updated', (config) => {\n      setSiteConfig(config);\n    });\n\n    socket.on('user_profile_updated', (data) => {\n      // Update current logged-in user if it matches\n      setUser(prev => {\n        if (prev && String(prev.id) === String(data.userId)) {\n          // Only spread non-sensitive fields visually needed\n          return { ...prev, avatar: data.user.avatar, username: data.user.username, accountName: data.user.accountName, bio: data.user.bio, industry: data.user.industry, coverUrl: data.user.coverUrl, certifications: data.user.certifications };\n        }\n        return prev;\n      });\n    });\n\n    socket.on('credits_updated', (data: { credits: number }) => {`
);

fs.writeFileSync('src/App.tsx', code);
console.log('Injected socket listeners to App.tsx');
