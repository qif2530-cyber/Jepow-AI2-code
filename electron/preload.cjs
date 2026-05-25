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
  },
});
