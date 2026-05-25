const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The replacement targets
const targets = [
  "const postsWithDetails = userPosts.map((p: any) => mapPostResponse(p, db));",
  ").slice(0, 10).map((p: any) => mapPostResponse(p, db));",
  "const postsWithUsers = approvedPosts.map((p: any) => mapPostResponse(p, db));",
  "const postsWithDetails = db.posts.map((p: any) => mapPostResponse(p, db));",
  "const postsWithDetails = collectedPosts.map((p: any) => mapPostResponse(p, db));"
];

let res = code;
res = res.replace(
  "const postsWithDetails = userPosts.map((p: any) => mapPostResponse(p, db));",
  "const ctx = createMapContext(db); const postsWithDetails = userPosts.map((p: any) => mapPostResponse(p, db, ctx));"
);
res = res.replace(
  ").slice(0, 10).map((p: any) => mapPostResponse(p, db));",
  ").slice(0, 10).map((p: any, i, arr) => { const ctx = arr.__ctx || (arr.__ctx = createMapContext(db)); return mapPostResponse(p, db, ctx); });"
);
res = res.replace(
  "const postsWithUsers = approvedPosts.map((p: any) => mapPostResponse(p, db));",
  "const ctx = createMapContext(db); const postsWithUsers = approvedPosts.map((p: any) => mapPostResponse(p, db, ctx));"
);
res = res.replace(
  "const postsWithDetails = db.posts.map((p: any) => mapPostResponse(p, db));",
  "const ctx = createMapContext(db); const postsWithDetails = db.posts.map((p: any) => mapPostResponse(p, db, ctx));"
);
res = res.replace(
  "const postsWithDetails = collectedPosts.map((p: any) => mapPostResponse(p, db));",
  "const ctx = createMapContext(db); const postsWithDetails = collectedPosts.map((p: any) => mapPostResponse(p, db, ctx));"
);

fs.writeFileSync('server.ts', res);
console.log('Replaced map bindings');
