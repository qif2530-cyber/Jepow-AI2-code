const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/debug/db',
  method: 'GET'
};

const req = http.request(options, res => {
  let d = '';
  res.on('data', chunk => d += chunk);
  res.on('end', () => {
    if (res.statusCode === 403) {
      console.log('403 Forbidden. I need token.');
      return;
    }
    const db = JSON.parse(d);
    console.log('Total projects:', db.projects ? db.projects.length : 0);
    if (db.projects && db.projects.length > 0) {
      console.log('Projects:', db.projects.map(p => ({id: p.id, userId: p.userId, name: p.name})));
      console.log('Users mapping:');
      db.users.forEach(u => console.log(u.id, u.username));
    }
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
