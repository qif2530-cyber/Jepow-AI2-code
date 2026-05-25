const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');

const INDEX_DIR = () => path.join(app.getPath('userData'), 'project-index');
const LEGACY_ROOT = () => path.join(app.getPath('userData'), 'projects');

function safeUserId(userId) {
  return String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function indexPath(userId) {
  const dir = INDEX_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safeUserId(userId)}.json`);
}

function loadIndex(userId) {
  const fp = indexPath(userId);
  if (fs.existsSync(fp)) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      return Array.isArray(data.entries) ? data : { entries: [], lastSaveDir: data.lastSaveDir || '' };
    } catch {
      return { entries: [], lastSaveDir: '' };
    }
  }
  return migrateLegacyIndex(userId);
}

function saveIndex(userId, index) {
  fs.writeFileSync(indexPath(userId), JSON.stringify(index, null, 2), 'utf8');
}

function migrateLegacyIndex(userId) {
  const legacyDir = path.join(LEGACY_ROOT(), safeUserId(userId));
  const entries = [];
  if (fs.existsSync(legacyDir)) {
    for (const f of fs.readdirSync(legacyDir).filter((x) => x.endsWith('.json'))) {
      try {
        const filePath = path.join(legacyDir, f);
        const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        entries.push({
          id: record.id,
          name: record.name,
          filePath,
          thumbnail: record.thumbnail || '',
          thumbnails: record.thumbnails || [],
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      } catch {
        /* skip corrupt */
      }
    }
  }
  const index = { entries, lastSaveDir: app.getPath('documents') };
  saveIndex(userId, index);
  return index;
}

function toMeta(entry) {
  return {
    id: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    thumbnail: entry.thumbnail,
    thumbnails: entry.thumbnails,
    filePath: entry.filePath,
  };
}

function findEntry(index, id) {
  return index.entries.find((e) => String(e.id) === String(id));
}

function registerProjectIpc(ipcMain) {
  ipcMain.handle('projects:pickSavePath', async (_e, userId, defaultName) => {
    const index = loadIndex(userId);
    const base =
      index.lastSaveDir ||
      path.join(app.getPath('documents'), 'JepowProjects');
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

    const safeName = (defaultName || '未命名工程').replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog({
      title: '选择工程保存位置',
      defaultPath: path.join(base, `${safeName}.jepow.json`),
      filters: [
        { name: 'Jepow 工程文件', extensions: ['jepow.json', 'json'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true, filePath: null };
    }

    const dir = path.dirname(result.filePath);
    index.lastSaveDir = dir;
    saveIndex(userId, index);

    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('projects:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择工程保存文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('projects:list', async (_e, userId) => {
    const index = loadIndex(userId);
    const list = index.entries
      .filter((e) => e.filePath && fs.existsSync(e.filePath))
      .map(toMeta)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    return list;
  });

  ipcMain.handle('projects:read', async (_e, userId, id) => {
    const index = loadIndex(userId);
    const entry = findEntry(index, id);
    if (!entry?.filePath || !fs.existsSync(entry.filePath)) return null;
    return JSON.parse(fs.readFileSync(entry.filePath, 'utf8'));
  });

  ipcMain.handle('projects:write', async (_e, userId, record) => {
    const index = loadIndex(userId);
    let entry = findEntry(index, record.id);
    const now = new Date().toISOString();

    if (!entry) {
      const filePath = path.join(
        index.lastSaveDir || app.getPath('documents'),
        `${String(record.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.jepow.json`,
      );
      entry = {
        id: record.id,
        name: record.name,
        filePath,
        thumbnail: '',
        thumbnails: [],
        createdAt: now,
        updatedAt: now,
      };
      index.entries.push(entry);
    }

    const payload = { ...record, updatedAt: now };
    fs.mkdirSync(path.dirname(entry.filePath), { recursive: true });
    fs.writeFileSync(entry.filePath, JSON.stringify(payload, null, 2), 'utf8');

    entry.name = record.name;
    entry.updatedAt = now;
    entry.thumbnail = record.thumbnail || '';
    entry.thumbnails = record.thumbnails || [];
    index.lastSaveDir = path.dirname(entry.filePath);
    saveIndex(userId, index);

    return toMeta(entry);
  });

  ipcMain.handle('projects:createAtPath', async (_e, userId, name, filePath) => {
    if (!filePath) return { error: '未选择保存路径' };

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const record = {
      id,
      userId: String(userId),
      name: name || path.basename(filePath, path.extname(filePath)),
      data: { nodes: [], edges: [], canvasColor: '#ffffff' },
      thumbnail: '',
      thumbnails: [],
      createdAt: now,
      updatedAt: now,
    };

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');

    const index = loadIndex(userId);
    index.entries = index.entries.filter(
      (e) => path.resolve(e.filePath) !== path.resolve(filePath),
    );
    index.entries.push({
      id,
      name: record.name,
      filePath,
      thumbnail: '',
      thumbnails: [],
      createdAt: now,
      updatedAt: now,
    });
    index.lastSaveDir = path.dirname(filePath);
    saveIndex(userId, index);

    return { meta: toMeta(index.entries[index.entries.length - 1]), record };
  });

  ipcMain.handle('projects:remove', async (_e, userId, id) => {
    const index = loadIndex(userId);
    const entry = findEntry(index, id);
    if (entry?.filePath && fs.existsSync(entry.filePath)) {
      try {
        fs.unlinkSync(entry.filePath);
      } catch {
        /* ignore */
      }
    }
    index.entries = index.entries.filter((e) => String(e.id) !== String(id));
    saveIndex(userId, index);
  });

  ipcMain.handle('projects:rename', async (_e, userId, id, name) => {
    const index = loadIndex(userId);
    const entry = findEntry(index, id);
    if (!entry?.filePath || !fs.existsSync(entry.filePath)) {
      throw new Error('项目不存在');
    }
    const record = JSON.parse(fs.readFileSync(entry.filePath, 'utf8'));
    record.name = name;
    record.updatedAt = new Date().toISOString();
    fs.writeFileSync(entry.filePath, JSON.stringify(record, null, 2), 'utf8');
    entry.name = name;
    entry.updatedAt = record.updatedAt;
    saveIndex(userId, index);
  });
}

module.exports = { registerProjectIpc };
