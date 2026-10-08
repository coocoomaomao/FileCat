const $ = s => document.querySelector(s);
let scan = null;
let selectedCategories = new Set();
let organizeMode = 'smart';

const toast = msg => {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
};

const fmt = bytes => {
  if (!bytes) return '0 B';
  const u=['B','KB','MB','GB','TB']; let i=0,v=bytes;
  while(v>=1024&&i<u.length-1){v/=1024;i++}
  return `${v>=10||i===0?v.toFixed(0):v.toFixed(1)} ${u[i]}`;
};

function activeCounts() {
  return organizeMode === 'smart' ? (scan?.categories || {}) : (scan?.typeCategories || {});
}

function activePlan() {
  return organizeMode === 'smart' ? (scan?.smartPlan || []) : (scan?.typePlan || []);
}

function renderCategories() {
  const counts = activeCounts();
  selectedCategories = new Set(Object.keys(counts));
  const list = $('#categoryList');
  list.innerHTML = Object.entries(counts)
    .sort((a,b)=>b[1]-a[1])
    .map(([name,count])=>`<label class="category-item"><input type="checkbox" data-cat="${name}" checked><div><b>${name}</b><span>${count} 个文件</span></div></label>`).join('');
}

$('#categoryList').addEventListener('change', e => {
  const cb = e.target.closest('[data-cat]'); if (!cb) return;
  cb.checked ? selectedCategories.add(cb.dataset.cat) : selectedCategories.delete(cb.dataset.cat);
  renderPlan();
});

function renderFindings() {
  const dup = scan.duplicates || [];
  $('#duplicateList').innerHTML = dup.length
    ? dup.map(g=>`<div class="finding-card"><b>${g.items.length} 个完全相同的文件</b><small>单个 ${fmt(g.size)} · 理论可少占约 ${fmt(g.size*(g.items.length-1))}</small><ul>${g.items.map(x=>`<li>${x.name}</li>`).join('')}</ul></div>`).join('')
    : '<div class="finding-empty">没发现真正重复文件，挺干净 😼</div>';

  const vers = scan.versions || [];
  $('#versionList').innerHTML = vers.length
    ? vers.map(g=>`<div class="finding-card"><b>${g.items.length} 个疑似同一文件的版本</b><small>FileCat 不会删除，只提醒你人工确认</small><ul>${g.items.map((x,i)=>`<li>${i===0?'🆕 ':''}${x.name}</li>`).join('')}</ul></div>`).join('')
    : '<div class="finding-empty">没抓到“最终版2最终版”家族 😂</div>';
}

function renderInsights() {
  const ins = scan.insights || {};
  const items = [];
  if (ins.summary?.oldCount) {
    items.push({
      icon:'🕰️',
      title:`${ins.summary.oldCount} 个文件超过 1 年未修改`,
      desc:'先别删，适合人工确认后归档。',
      cls:'neutral'
    });
  }
  if (ins.summary?.largeCount) {
    items.push({
      icon:'🐘',
      title:`${ins.summary.largeCount} 个大文件超过 500MB`,
      desc:'视频、压缩包和旧安装包通常最占空间。',
      cls:'warn'
    });
  }
  if (ins.summary?.oldInstallerCount) {
    items.push({
      icon:'📦',
      title:`${ins.summary.oldInstallerCount} 个安装包已超过 90 天`,
      desc:'FileCat 只提示，不会自动删除安装包。',
      cls:'warn'
    });
  }
  if (scan.duplicates?.length) {
    items.push({
      icon:'👯',
      title:`${scan.duplicates.length} 组完全重复文件`,
      desc:`理论重复空间约 ${ins.duplicateBytesText || '0 B'}，仍需你自己决定是否清理。`,
      cls:'mint'
    });
  }
  if (!items.length) {
    items.push({icon:'✨',title:'这个目录暂时挺整洁',desc:'没有发现明显的旧文件、大文件或重复文件。',cls:'mint'});
  }
  $('#insightList').innerHTML = items.map(x=>`
    <article class="insight-card ${x.cls}">
      <span class="insight-icon">${x.icon}</span>
      <div><b>${x.title}</b><p>${x.desc}</p></div>
    </article>`).join('');
}

function currentPlan() {
  return activePlan().filter(x => selectedCategories.has(x.category));
}

function renderPlan() {
  const plan = currentPlan();
  $('#planCount').textContent = `${plan.length} 个文件`;
  $('#planPreview').innerHTML = plan.slice(0,140).map(x=>`
    <div class="plan-row">
      <span class="from">${x.sourceName}</span>
      <span>→</span>
      <span class="to">FileCat_整理 / ${x.category}<small>${x.reason || ''}${x.confidence ? ' · '+x.confidence+'置信' : ''}</small></span>
    </div>`).join('') || '<div class="finding-empty">当前没有勾选要整理的文件。</div>';
  $('#executeBtn').disabled = plan.length === 0;
}

function renderStats() {
  $('#statFiles').textContent = scan.files.length;
  $('#statSize').textContent = scan.totalSizeText;
  $('#statDup').textContent = scan.duplicates.length;
  $('#statVersions').textContent = scan.versions.length;
  $('#statOld').textContent = scan.insights?.summary?.oldCount || 0;
  $('#statLarge').textContent = scan.insights?.summary?.largeCount || 0;
}

function setMode(mode) {
  organizeMode = mode;
  $('#smartModeBtn').classList.toggle('active', mode === 'smart');
  $('#typeModeBtn').classList.toggle('active', mode === 'type');
  $('#modeDesc').textContent = mode === 'smart'
    ? '根据文件名、扩展名、时间和少量本地文本抽样，优先整理成“学术科研 / 合同资料 / 公司财务 / 图片素材”等用途目录。'
    : '按 PDF / 文档 / 表格 / 图片 / 视频 / 安装包等传统文件类型整理，逻辑最简单、最可预测。';
  if (scan) { renderCategories(); renderPlan(); }
}

$('#smartModeBtn').addEventListener('click',()=>setMode('smart'));
$('#typeModeBtn').addEventListener('click',()=>setMode('type'));

async function chooseAndScan() {
  const folder = await window.filecat.chooseFolder();
  if (!folder) return;
  $('#folderBadge').textContent = '扫描中…';
  $('#folderTitle').textContent = folder;
  try {
    scan = await window.filecat.scanFolder(folder);
    $('#folderBadge').textContent = folder;
    renderStats();
    renderCategories();
    renderFindings();
    renderInsights();
    renderPlan();
    $('#dashboard').hidden = false;
    $('#dashboard').scrollIntoView({behavior:'smooth',block:'start'});
    toast(`v0.2 扫描完成：${scan.files.length} 个当前层文件`);
  } catch (err) {
    console.error(err);
    $('#folderBadge').textContent='扫描失败';
    toast(err.message || '扫描失败');
  }
}

$('#chooseBtn').addEventListener('click', chooseAndScan);
$('#dropZone').addEventListener('click', chooseAndScan);

$('#executeBtn').addEventListener('click', async () => {
  const plan = currentPlan();
  if (!plan.length) return;
  const modeText = organizeMode === 'smart' ? '智能用途分类' : '传统文件类型';
  const ok = confirm(`FileCat 将按「${modeText}」移动 ${plan.length} 个文件到当前目录下的「FileCat_整理」文件夹。\n\n不会删除文件，也不会进入已有子文件夹。\n\n确认执行吗？`);
  if (!ok) return;

  $('#executeBtn').disabled = true;
  $('#executeBtn').textContent = '正在整理…';
  try {
    const result = await window.filecat.executePlan(plan);
    toast(`整理完成：移动 ${result.operations.length} 个文件，可一键撤销`);
    await refreshAfterAction();
  } catch (err) {
    console.error(err);
    toast('整理失败：'+err.message);
  } finally {
    $('#executeBtn').textContent='确认整理这些文件';
  }
});

async function refreshAfterAction() {
  if (!scan?.folder) return;
  scan = await window.filecat.scanFolder(scan.folder);
  renderStats();
  renderCategories();
  renderFindings();
  renderInsights();
  renderPlan();
}

$('#undoBtn').addEventListener('click', async () => {
  const last = await window.filecat.getLastOperation();
  if (!last?.operations?.length) { toast('目前没有可撤销的整理记录'); return; }
  if (!confirm(`撤销上一次整理？将尝试恢复 ${last.operations.length} 个文件。`)) return;
  const result = await window.filecat.undoLast();
  if (!result.ok) { toast(result.message); return; }
  const okCount = result.results.filter(x=>x.ok).length;
  toast(`已恢复 ${okCount} 个文件`);
  await refreshAfterAction();
});
