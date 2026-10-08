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

const TEXT_SAMPLE_EXTS = new Set(['.txt','.md','.csv','.tsv','.json','.yaml','.yml','.toml','.xml','.html','.htm','.js','.ts','.py','.sql','.log']);
const MB = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;

const SMART_RULES = [
  { label:'合同资料', words:['合同','协议','agreement','contract','nda','保密协议','租赁','委托书','授权书'] },
  { label:'公司财务', words:['发票','invoice','报销','费用','账单','对账','付款','收款','工资','薪资','税','纳税','财务','报价单','报价','采购','订单','bank','statement'] },
  { label:'学术科研', words:['论文','paper','manuscript','thesis','article','journal','reference','参考文献','实验','experiment','modeling','建模','科研','研究','figure','table','doi','abstract'] },
  { label:'简历求职', words:['简历','resume','cv','求职','offer','面试','招聘','job'] },
  { label:'会议演示', words:['会议','汇报','路演','presentation','pitch','ppt','方案汇报','答辩','开题'] },
  { label:'旅行资料', words:['机票','酒店','hotel','flight','行程','itinerary','旅行','旅游','签证','visa','booking'] },
  { label:'设计素材', words:['海报','poster','logo','banner','封面','设计稿','素材','配图','视觉','mockup','ui','ux'] },
  { label:'照片截图', words:['截图','screenshot','snip','微信图片','wx','screen shot'] }
];

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

function readTextSample(filePath, ext, size) {
  if (!TEXT_SAMPLE_EXTS.has(ext) || size > 3 * MB) return '';
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(size, 96 * 1024));
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    return buffer.subarray(0, bytes).toString('utf8').replace(/\0/g,' ').slice(0, 90000);
  } catch {
    return '';
  }
}

function smartClassify(file) {
  const name = file.name.toLowerCase();
  const sample = (file.textSample || '').toLowerCase();
  const haystack = `${name}\n${sample}`;
  const basic = file.category;

  for (const rule of SMART_RULES) {
    const hit = rule.words.find(word => haystack.includes(word.toLowerCase()));
    if (hit) return { label: rule.label, confidence: sample.includes(String(hit).toLowerCase()) ? '高' : '中', reason: `识别到关键词「${hit}」` };
  }

  if (basic === '安装包') return { label:'软件安装包', confidence:'高', reason:'根据安装包扩展名识别' };
  if (basic === '代码') return { label:'代码开发', confidence:'高', reason:'根据代码文件类型识别' };
  if (basic === '视频') return { label:'视频素材', confidence:'高', reason:'根据视频文件类型识别' };
  if (basic === '音频') return { label:'音频素材', confidence:'高', reason:'根据音频文件类型识别' };
  if (basic === '压缩包') return { label:'压缩归档', confidence:'高', reason:'根据压缩包类型识别' };
  if (basic === '字体') return { label:'字体资源', confidence:'高', reason:'根据字体文件类型识别' };
  if (basic === '演示') return { label:'会议演示', confidence:'中', reason:'演示文稿默认归入会议演示' };
  if (basic === '表格') return { label:'表格数据', confidence:'中', reason:'表格文件默认归入表格数据' };
  if (basic === '图片') {
    const screenLike = /screenshot|screen shot|截图|snip|微信图片|wx[_-]?\d/i.test(file.name);
    return screenLike
      ? { label:'照片截图', confidence:'中', reason:'文件名像截图或聊天图片' }
      : { label:'图片素材', confidence:'中', reason:'图片文件默认归入图片素材' };
  }
  if (basic === 'PDF') return { label:'PDF资料', confidence:'低', reason:'仅根据文件类型，建议人工确认' };
  if (basic === '文档') return { label:'普通文档', confidence:'低', reason:'未命中用途关键词' };
  return { label:'其他文件', confidence:'低', reason:'暂未识别明确用途' };
}

function listTopLevel(folderPath, now = Date.now()) {
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
      const ext = path.extname(entry.name).toLowerCase();
      const category = classifyFile(entry.name);
      const textSample = readTextSample(fullPath, ext, st.size);
      const file = {
        name: entry.name,
        path: fullPath,
        size: st.size,
        modifiedMs: st.mtimeMs,
        ageDays: Math.max(0, Math.floor((now - st.mtimeMs) / DAY)),
        category,
        ext,
        textSample
      };
      file.smart = smartClassify(file);
      file.isOld = file.ageDays >= 365;
      file.isLarge = file.size >= 500 * MB;
      file.isOldInstaller = category === '安装包' && file.ageDays >= 90;
      files.push(file);
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

async function findDuplicates(files, maxHashBytes = 1024 * MB) {
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

function buildPlan(folderPath, files, mode = 'smart') {
  const root = path.join(folderPath, 'FileCat_整理');
  return files.map(file => {
    const category = mode === 'smart' ? file.smart.label : file.category;
    return {
      source: file.path,
      sourceName: file.name,
      category,
      targetDir: path.join(root, category),
      target: path.join(root, category, file.name),
      size: file.size,
      reason: mode === 'smart' ? file.smart.reason : '按文件类型整理',
      confidence: mode === 'smart' ? file.smart.confidence : '高'
    };
  });
}

function buildInsights(files, duplicates, versions) {
  const oldFiles = files.filter(f => f.isOld).sort((a,b)=>b.size-a.size);
  const largeFiles = files.filter(f => f.isLarge).sort((a,b)=>b.size-a.size);
  const oldInstallers = files.filter(f => f.isOldInstaller).sort((a,b)=>b.ageDays-a.ageDays);
  const duplicateBytes = duplicates.reduce((sum,g)=>sum + g.size * (g.items.length - 1), 0);
  return {
    oldFiles,
    largeFiles,
    oldInstallers,
    duplicateBytes,
    duplicateBytesText: formatBytes(duplicateBytes),
    summary: {
      oldCount: oldFiles.length,
      largeCount: largeFiles.length,
      oldInstallerCount: oldInstallers.length
    }
  };
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
  smartClassify,
  isDangerousFolder,
  listTopLevel,
  findDuplicates,
  findVersionFamilies,
  buildPlan,
  buildInsights,
  executePlan,
  undoOperations
};
