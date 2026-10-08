const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../electron/filecat-core.cjs');

test('classifies common file types',()=>{
  assert.equal(core.classifyFile('paper.pdf'),'PDF');
  assert.equal(core.classifyFile('预算.xlsx'),'表格');
  assert.equal(core.classifyFile('照片.JPG'),'图片');
  assert.equal(core.classifyFile('setup.exe'),'安装包');
});

test('normalizes common final-version names',()=>{
  assert.equal(core.normalizeVersionName('方案最终版2.docx'), core.normalizeVersionName('方案.docx'));
  assert.equal(core.normalizeVersionName('report_v3.pdf'), core.normalizeVersionName('report.pdf'));
  assert.equal(core.normalizeVersionName('图 (2).png'), core.normalizeVersionName('图.png'));
});
