const { contextBridge, ipcRenderer } = require('electron');

const webUrl = (process.env.JEPOW_WEB_URL || 'https://jepow.com').replace(/\/$/, '');

contextBridge.exposeInMainWorld('jepowDesktop', {
  version: '1.0.0',
  platform: process.platform,
  webUrl,
  openWeb: (url) => ipcRenderer.invoke('open-web', url),
  onAuth: (callback) => {
    ipcRenderer.on('desktop-auth', (_event, data) => callback(data));
  },
  projects: {
    list: (userId) => ipcRenderer.invoke('projects:list', userId),
    read: (userId, id) => ipcRenderer.invoke('projects:read', userId, id),
    write: (userId, record) => ipcRenderer.invoke('projects:write', userId, record),
    remove: (userId, id) => ipcRenderer.invoke('projects:remove', userId, id),
    rename: (userId, id, name) =>
      ipcRenderer.invoke('projects:rename', userId, id, name),
    pickSavePath: (userId, defaultName) =>
      ipcRenderer.invoke('projects:pickSavePath', userId, defaultName),
    pickDirectory: () => ipcRenderer.invoke('projects:pickDirectory'),
    createAtPath: (userId, name, filePath) =>
      ipcRenderer.invoke('projects:createAtPath', userId, name, filePath),
  },
  /** 本地 3D 资产库（桌面端不上传云端） */
  assets: {
    pickModelFile: () => ipcRenderer.invoke('assets:pickModelFile'),
    importFile: (userId, sourcePath, projectId, nodeType) =>
      ipcRenderer.invoke('assets:importFile', userId, sourcePath, projectId, nodeType),
    saveBuffer: (userId, fileName, base64, projectId, nodeType) =>
      ipcRenderer.invoke('assets:saveBuffer', userId, fileName, base64, projectId, nodeType),
    saveBufferRaw: (userId, fileName, arrayBuffer, projectId, nodeType) =>
      ipcRenderer.invoke('assets:saveBufferRaw', userId, fileName, arrayBuffer, projectId, nodeType),
    readBuffer: (localPath) => ipcRenderer.invoke('assets:readBuffer', localPath),
    resolveScenePath: (userId, hints) =>
      ipcRenderer.invoke('assets:resolveScenePath', userId, hints),
  },
  /** Jepow 自研原生 3D 内核 — 与 AI / LLM API 无关 */
  viewport: {
    getStatus: () => ipcRenderer.invoke('viewport:getStatus'),
    pickSceneFile: () => ipcRenderer.invoke('viewport:pickSceneFile'),
    openScene: (scenePath) => ipcRenderer.invoke('viewport:openScene', scenePath),
    sceneInfo: (scenePath) => ipcRenderer.invoke('viewport:sceneInfo', scenePath),
    renderPreview: (opts) => ipcRenderer.invoke('viewport:renderPreview', opts),
    readPreview: (previewUrl) => ipcRenderer.invoke('viewport:readPreview', previewUrl),
  },
});
