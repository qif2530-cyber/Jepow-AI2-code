const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function projectsRoot() {
  return path.join(app.getPath('userData'), 'projects');
}

function userDir(userId) {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(projectsRoot(), safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function projectPath(userId, id) {
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(userDir(userId), `${safeId}.json`);
}

function toMeta(record) {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    thumbnail: record.thumbnail,
    thumbnails: record.thumbnails,
  };
}

function registerProjectIpc(ipcMain) {
  ipcMain.handle('projects:list', async (_e, userId) => {
    const dir = userDir(userId);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const list = files
      .map((f) => {
        try {
          const record = JSON.parse(
            fs.readFileSync(path.join(dir, f), 'utf8'),
          );
          return toMeta(record);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    list.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return list;
  });

  ipcMain.handle('projects:read', async (_e, userId, id) => {
    const fp = projectPath(userId, id);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  });

  ipcMain.handle('projects:write', async (_e, userId, record) => {
    const fp = projectPath(userId, record.id);
    fs.writeFileSync(fp, JSON.stringify(record, null, 0), 'utf8');
    return toMeta(record);
  });

  ipcMain.handle('projects:remove', async (_e, userId, id) => {
    const fp = projectPath(userId, id);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });

  ipcMain.handle('projects:rename', async (_e, userId, id, name) => {
    const fp = projectPath(userId, id);
    if (!fs.existsSync(fp)) throw new Error('项目不存在');
    const record = JSON.parse(fs.readFileSync(fp, 'utf8'));
    record.name = name;
    record.updatedAt = new Date().toISOString();
    fs.writeFileSync(fp, JSON.stringify(record, null, 0), 'utf8');
  });
}

module.exports = { registerProjectIpc };
