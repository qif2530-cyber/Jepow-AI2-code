const { dialog } = require('electron');
const nativeEngine = require('./native-engine-bridge.cjs');

function registerViewportIpc(ipcMain) {
  ipcMain.handle('viewport:getStatus', async () => nativeEngine.getStatus());

  ipcMain.handle('viewport:pickSceneFile', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择 3D 场景文件',
      properties: ['openFile'],
      filters: [
        {
          name: '3D Scene',
          extensions: ['glb', 'gltf', 'fbx', 'obj'],
        },
      ],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { canceled: true, filePath: null };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  });

  ipcMain.handle('viewport:openScene', async (_e, scenePath) => {
    return nativeEngine.openScene(scenePath);
  });

  ipcMain.handle('viewport:sceneInfo', async (_e, scenePath) => {
    return nativeEngine.openScene(scenePath);
  });

  ipcMain.handle('viewport:renderPreview', async (_e, opts) => {
    return nativeEngine.renderPreview(opts || {});
  });

  ipcMain.handle('viewport:readPreview', async (_e, previewUrl) => {
    if (!previewUrl || typeof previewUrl !== 'string') return null;
    const name = previewUrl.replace('viewport-cache://', '');
    return nativeEngine.readCachedImageByName(name);
  });
}

module.exports = { registerViewportIpc };
