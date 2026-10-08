const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const core = require('./filecat-core.cjs');

const APP_TITLE = 'FileCat 文件整理猫';
const APP_ID = 'com.meowbuild.filecat';

function logPath() { return path.join(app.getPath('userData'), 'last-operation.json'); }
function saveLog(payload) { fs.writeFileSync(logPath(), JSON.stringify(payload, null, 2), 'utf8'); }
function readLog() {
  try { return JSON.parse(fs.readFileSync(logPath(), 'utf8')); } catch { return null; }
}

function createWindow() {
  const win = new BrowserWindow({
    title: APP_TITLE,
    width: 1180,
    height: 850,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: '#f7f2e8',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('filecat:choose-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择要整理的文件夹' });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('filecat:scan-folder', async (_event, folder) => {
  const listing = core.listTopLevel(folder);
  const [duplicates] = await Promise.all([core.findDuplicates(listing.files)]);
  const versions = core.findVersionFamilies(listing.files);
  const plan = core.buildPlan(folder, listing.files);
  const categories = {};
  let totalSize = 0;
  for (const file of listing.files) {
    totalSize += file.size;
    categories[file.category] = (categories[file.category] || 0) + 1;
  }
  return {
    folder,
    ...listing,
    duplicates,
    versions,
    plan,
    totalSize,
    totalSizeText: core.formatBytes(totalSize),
    categories
  };
});

ipcMain.handle('filecat:execute-plan', async (_event, plan) => {
  const operations = core.executePlan(plan);
  const payload = { id: Date.now(), createdAt: new Date().toISOString(), operations };
  saveLog(payload);
  return payload;
});

ipcMain.handle('filecat:last-operation', async () => readLog());

ipcMain.handle('filecat:undo-last', async () => {
  const last = readLog();
  if (!last?.operations?.length) return { ok: false, message: '没有可撤销的整理记录。' };
  const results = core.undoOperations(last.operations);
  saveLog({ id: Date.now(), createdAt: new Date().toISOString(), undoneFrom: last.id, operations: [], undoResults: results });
  return { ok: true, results };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
