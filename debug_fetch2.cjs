const http = require('http');
setTimeout(() => {
  http.get('http://localhost:3000/api/debug/db', r => {
    let d='';
    r.on('data', c=>d+=c);
    r.on('end', ()=>console.log(d));
  });
}, 2000);
