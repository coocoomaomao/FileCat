const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATEGORY_RULES = [
  ['PDF', new Set(['.pdf'])],
  ['文档', new Set(['.doc','.docx','.odt','.rtf','.txt','.md','.pages'])],
  ['表格', new Set(['.xls','.xlsx','.csv','.tsv','.numbers'])],
  ['演示', new Set(['.ppt','.pptx','.key'])],
  ['图片', new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tif','.tiff','.svg','.heic','.avif'])],
  ['视频', new Set(['.mp4','.mov','.mkv','.avi','.wmv','.flv','.webm','.m4v'])],
  ['音频', new Set(['.mp3','.wav','.m4a','.aac','.flac','.ogg','.wma'])],
  ['压缩包', new Set(['.zip','.rar','.7z','.tar','.gz','.bz2','.xz'])],
  ['安装包', new Set(['.exe','.msi','.msix','.appx','.dmg','.pkg','.deb','.rpm'])],
  ['代码', new Set(['.js','.jsx','.ts','.tsx','.py','.java','.c','.cc','.cpp','.h','.hpp','.go','.rs','.php','.rb','.swift','.kt','.kts','.html','.css','.scss','.json','.yaml','.yml','.toml','.xml','.sql','.sh','.ps1','.bat','.cmd'])],
  ['字体', new Set(['.ttf','.otf','.woff','.woff2'])]
];

const SYSTEM_SEGMENTS = new Set([
  'windows','program files','program files (x86)','programdata','$recycle.bin','system volume information','appdata'
]);

function classifyFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  for (const [name, exts] of CATEGORY_RULES) if (exts.has(ext)) return name;
  return '其他';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0, value = bytes;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function normalizeVersionName(filename) {
  const ext = path.extname(filename).toLowerCase();
  let base = path.basename(filename, path.extname(filename)).toLowerCase();
  base = base
    .replace(/\s+/g, '')
    .replace(/[（(]\d+[）)]$/g, '')
    .replace(/(?:copy|副本|复制)(?:\d+)?$/gi, '')
    .replace(/(?:最终版|终版|定稿|修改版|修订版|新版|final|finale)(?:\d+)?/gi, '')
    .replace(/(?:[_\-\s]?v(?:er)?\.?\d+(?:\.\d+)*)$/gi, '')
    .replace(/(?:[_\-\s]?\d{8,14})$/g, '')
    .replace(/[_\-\s]+$/g, '');
  return `${base}${ext}`;
}

function isDangerousFolder(folderPath) {
  const resolved = path.resolve(folderPath);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) return true;
  const segments = resolved.split(path.sep).filter(Boolean).map(s => s.toLowerCase());
  return segments.some(s => SYSTEM_SEGMENTS.has(s));
}

function safeStat(filePath) {
  try { return fs.statSync(filePath); } catch { return null; }
}

function listTopLevel(folderPath) {
  if (isDangerousFolder(folderPath)) throw new Error('为了安全，FileCat 不允许直接整理系统目录或磁盘根目录。');
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files = [];
  const folders = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'FileCat_整理') continue;
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isFile()) {
      const st = safeStat(fullPath);
      if (!st) continue;
      files.push({
        name: entry.name,
        path: fullPath,
        size: st.size,
        modifiedMs: st.mtimeMs,
        category: classifyFile(entry.name),
        ext: path.extname(entry.name).toLowerCase()
      });
    } else if (entry.isDirectory()) {
      folders.push({ name: entry.name, path: fullPath });
    }
  }
  return { files, folders };
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function findDuplicates(files, maxHashBytes = 1024 * 1024 * 1024) {
  const sizeGroups = new Map();
  for (const file of files) {
    if (file.size <= 0 || file.size > maxHashBytes) continue;
    const arr = sizeGroups.get(file.size) || [];
    arr.push(file); sizeGroups.set(file.size, arr);
  }
  const groups = [];
  for (const candidates of sizeGroups.values()) {
    if (candidates.length < 2) continue;
    const hashGroups = new Map();
    for (const file of candidates) {
      const hash = await sha256(file.path);
      const arr = hashGroups.get(hash) || [];
      arr.push(file); hashGroups.set(hash, arr);
    }
    for (const [hash, items] of hashGroups) if (items.length > 1) groups.push({ hash, items, size: items[0].size });
  }
  return groups.sort((a,b) => (b.size*b.items.length) - (a.size*a.items.length));
}

function findVersionFamilies(files) {
  const groups = new Map();
  for (const file of files) {
    const key = normalizeVersionName(file.name);
    const arr = groups.get(key) || [];
    arr.push(file); groups.set(key, arr);
  }
  return [...groups.entries()]
    .filter(([,items]) => items.length > 1)
    .map(([key,items]) => ({ key, items: items.sort((a,b) => b.modifiedMs - a.modifiedMs) }))
    .sort((a,b) => b.items.length - a.items.length);
}

function buildPlan(folderPath, files) {
  const root = path.join(folderPath, 'FileCat_整理');
  return files.map(file => ({
    source: file.path,
    sourceName: file.name,
    category: file.category,
    targetDir: path.join(root, file.category),
    target: path.join(root, file.category, file.name),
    size: file.size
  }));
}

function uniqueTarget(target) {
  if (!fs.existsSync(target)) return target;
  const dir = path.dirname(target), ext = path.extname(target), base = path.basename(target, ext);
  let i = 2;
  while (true) {
    const candidate = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i++;
  }
}

function executePlan(plan) {
  const operations = [];
  for (const item of plan) {
    if (!fs.existsSync(item.source)) continue;
    fs.mkdirSync(item.targetDir, { recursive: true });
    const target = uniqueTarget(item.target);
    fs.renameSync(item.source, target);
    operations.push({ source: item.source, target, category: item.category, timestamp: Date.now() });
  }
  return operations;
}

function undoOperations(operations) {
  const results = [];
  for (const op of [...operations].reverse()) {
    if (!fs.existsSync(op.target)) {
      results.push({ ...op, ok: false, reason: '目标文件不存在，可能已被移动。' });
      continue;
    }
    let restore = op.source;
    if (fs.existsSync(restore)) {
      const dir = path.dirname(restore), ext = path.extname(restore), base = path.basename(restore, ext);
      restore = uniqueTarget(path.join(dir, `${base} - FileCat恢复${ext}`));
    }
    fs.renameSync(op.target, restore);
    results.push({ ...op, ok: true, restoredTo: restore });
  }
  return results;
}

module.exports = {
  CATEGORY_RULES,
  classifyFile,
  formatBytes,
  normalizeVersionName,
  isDangerousFolder,
  listTopLevel,
  findDuplicates,
  findVersionFamilies,
  buildPlan,
  executePlan,
  undoOperations
};
