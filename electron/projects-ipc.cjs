const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const bundle = require('./ai-project-bundle.cjs');

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
      return Array.isArray(data.entries)
        ? data
        : { entries: [], lastSaveDir: data.lastSaveDir || '', activeProjectId: data.activeProjectId || null };
    } catch {
      return { entries: [], lastSaveDir: '', activeProjectId: null };
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
          bundlePath: null,
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
  const index = { entries, lastSaveDir: app.getPath('documents'), activeProjectId: null };
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
    filePath: entry.bundlePath || entry.filePath,
    bundlePath: entry.bundlePath || null,
  };
}

function findEntry(index, id) {
  return index.entries.find((e) => String(e.id) === String(id));
}

function entryBundlePath(entry) {
  if (entry?.bundlePath && bundle.isBundlePath(entry.bundlePath)) {
    return entry.bundlePath;
  }
  return null;
}

function readRecordFromEntry(entry) {
  const bp = entryBundlePath(entry);
  if (bp) {
    const { manifest, data } = bundle.readBundle(bp);
    return {
      id: manifest.id || entry.id,
      userId: manifest.userId,
      name: manifest.name || entry.name,
      data,
      thumbnail: entry.thumbnail || '',
      thumbnails: entry.thumbnails || [],
      createdAt: manifest.createdAt || entry.createdAt,
      updatedAt: manifest.updatedAt || entry.updatedAt,
    };
  }
  if (entry?.filePath && fs.existsSync(entry.filePath)) {
    return JSON.parse(fs.readFileSync(entry.filePath, 'utf8'));
  }
  return null;
}

function extractThumbnails(data, fallback) {
  const nodes = data?.nodes || [];
  const urls = nodes
    .filter((n) => {
      const t = n?.type;
      return (
        (t === 'mediaNode' && n.data?.url) ||
        (t === 'imageShotNode' && n.data?.shot?.imageUrl) ||
        (t === 'videoShotNode' && n.data?.shot?.videoUrl) ||
        (t === 'imageNode' && n.data?.url)
      );
    })
    .map((n) => n.data?.url || n.data?.shot?.imageUrl || n.data?.shot?.videoUrl)
    .filter(Boolean);
  const thumbnails = urls.length > 0 ? urls.slice(-4) : fallback ? [fallback] : [];
  return {
    thumbnail: thumbnails[thumbnails.length - 1] || fallback || '',
    thumbnails,
  };
}

function registerProjectIpc(ipcMain) {
  ipcMain.handle('projects:pickSavePath', async (_e, userId, defaultName) => {
    const index = loadIndex(userId);
    const base =
      index.lastSaveDir || path.join(app.getPath('documents'), 'JepowProjects');
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

    const safeName = (defaultName || '未命名工程').replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog({
      title: '选择 .AI 工程保存位置',
      defaultPath: path.join(base, `${safeName}.AI`),
      filters: [{ name: 'Jepow AI 工程', extensions: ['AI'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true, filePath: null };
    }

    let bundlePath = result.filePath;
    if (!bundlePath.toLowerCase().endsWith('.ai')) {
      bundlePath = `${bundlePath}.AI`;
    }

    index.lastSaveDir = path.dirname(bundlePath);
    saveIndex(userId, index);

    return { canceled: false, filePath: bundlePath };
  });

  ipcMain.handle('projects:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择工程保存文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('projects:getBundlePath', async (_e, userId, projectId) => {
    const index = loadIndex(userId);
    const entry = findEntry(index, projectId);
    return entryBundlePath(entry);
  });

  ipcMain.handle('projects:getActiveBundlePath', async (_e, userId) => {
    const index = loadIndex(userId);
    if (!index.activeProjectId) return null;
    const entry = findEntry(index, index.activeProjectId);
    return entryBundlePath(entry);
  });

  ipcMain.handle('projects:list', async (_e, userId) => {
    const index = loadIndex(userId);
    const list = index.entries
      .filter((e) => {
        if (entryBundlePath(e)) return true;
        return e.filePath && fs.existsSync(e.filePath);
      })
      .map(toMeta)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  });

  ipcMain.handle('projects:read', async (_e, userId, id) => {
    const index = loadIndex(userId);
    const entry = findEntry(index, id);
    if (!entry) return null;
    const record = readRecordFromEntry(entry);
    if (record) {
      index.activeProjectId = id;
      saveIndex(userId, index);
    }
    return record;
  });

  ipcMain.handle('projects:write', async (_e, userId, record) => {
    const index = loadIndex(userId);
    let entry = findEntry(index, record.id);
    const now = new Date().toISOString();

    if (!entry) {
      const baseDir = index.lastSaveDir || app.getPath('documents');
      const safeId = String(record.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const bundlePath = path.join(baseDir, `${safeId}.AI`);
      entry = {
        id: record.id,
        name: record.name,
        bundlePath,
        filePath: null,
        thumbnail: '',
        thumbnails: [],
        createdAt: now,
        updatedAt: now,
      };
      index.entries.push(entry);
    }

    let bundlePath = entryBundlePath(entry);
    if (!bundlePath) {
      if (entry.filePath && entry.filePath.toLowerCase().endsWith('.json')) {
        const legacy = JSON.parse(fs.readFileSync(entry.filePath, 'utf8'));
        bundlePath = bundle.normalizeBundlePath(
          entry.filePath.replace(/\.json$/i, '.AI'),
        );
        bundle.createEmptyBundle(bundlePath, { ...legacy, ...record, updatedAt: now });
        entry.bundlePath = bundlePath;
        entry.filePath = null;
      } else {
        bundlePath = bundle.normalizeBundlePath(
          path.join(
            index.lastSaveDir || app.getPath('documents'),
            `${String(record.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.AI`,
          ),
        );
        entry.bundlePath = bundlePath;
      }
    }

    const payload = {
      ...record,
      createdAt: entry.createdAt || record.createdAt || now,
      updatedAt: now,
    };
    const written = bundle.writeBundle(bundlePath, payload);
    const thumbs = extractThumbnails(written.data, record.thumbnail);

    entry.name = record.name;
    entry.updatedAt = now;
    entry.thumbnail = thumbs.thumbnail;
    entry.thumbnails = thumbs.thumbnails;
    entry.bundlePath = bundlePath;
    index.lastSaveDir = path.dirname(bundlePath);
    index.activeProjectId = record.id;
    saveIndex(userId, index);

    return toMeta(entry);
  });

  ipcMain.handle('projects:createAtPath', async (_e, userId, name, filePath) => {
    if (!filePath) return { error: '未选择保存路径' };

    const bundlePath = bundle.normalizeBundlePath(filePath);
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const record = {
      id,
      userId: String(userId),
      name: name || path.basename(bundlePath, path.extname(bundlePath)),
      data: { nodes: [], edges: [], canvasColor: '#ffffff' },
      thumbnail: '',
      thumbnails: [],
      createdAt: now,
      updatedAt: now,
    };

    bundle.createEmptyBundle(bundlePath, record);

    const index = loadIndex(userId);
    index.entries = index.entries.filter(
      (e) => e.bundlePath && path.resolve(e.bundlePath) !== path.resolve(bundlePath),
    );
    index.entries.push({
      id,
      name: record.name,
      bundlePath,
      filePath: null,
      thumbnail: '',
      thumbnails: [],
      createdAt: now,
      updatedAt: now,
    });
    index.lastSaveDir = path.dirname(bundlePath);
    index.activeProjectId = id;
    saveIndex(userId, index);

    return { meta: toMeta(index.entries[index.entries.length - 1]), record };
  });

  ipcMain.handle('projects:remove', async (_e, userId, id) => {
    const index = loadIndex(userId);
    const entry = findEntry(index, id);
    if (entry?.bundlePath && fs.existsSync(entry.bundlePath)) {
      try {
        fs.rmSync(entry.bundlePath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    if (entry?.filePath && fs.existsSync(entry.filePath)) {
      try {
        fs.unlinkSync(entry.filePath);
      } catch {
        /* ignore */
      }
    }
    index.entries = index.entries.filter((e) => String(e.id) !== String(id));
    if (index.activeProjectId === id) index.activeProjectId = null;
    saveIndex(userId, index);
  });

  ipcMain.handle('projects:rename', async (_e, userId, id, name) => {
    const index = loadIndex(userId);
    const entry = findEntry(index, id);
    if (!entry) throw new Error('项目不存在');

    const record = readRecordFromEntry(entry);
    if (!record) throw new Error('项目不存在');

    record.name = name;
    record.updatedAt = new Date().toISOString();

    if (entryBundlePath(entry)) {
      bundle.writeBundle(entry.bundlePath, record);
    } else if (entry.filePath) {
      fs.writeFileSync(entry.filePath, JSON.stringify(record, null, 2), 'utf8');
    }

    entry.name = name;
    entry.updatedAt = record.updatedAt;
    saveIndex(userId, index);
  });
}

module.exports = { registerProjectIpc, loadIndex, findEntry, entryBundlePath };
