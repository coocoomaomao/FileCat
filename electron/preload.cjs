const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('filecat', {
  chooseFolder: () => ipcRenderer.invoke('filecat:choose-folder'),
  scanFolder: folder => ipcRenderer.invoke('filecat:scan-folder', folder),
  executePlan: plan => ipcRenderer.invoke('filecat:execute-plan', plan),
  undoLast: () => ipcRenderer.invoke('filecat:undo-last'),
  getLastOperation: () => ipcRenderer.invoke('filecat:last-operation')
});
