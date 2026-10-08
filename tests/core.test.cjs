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

test('smart classification recognizes practical filename intent',()=>{
  assert.equal(core.smartClassify({name:'毕业论文最终版.docx',category:'文档',textSample:''}).label,'学术科研');
  assert.equal(core.smartClassify({name:'深圳XX公司报价单.xlsx',category:'表格',textSample:''}).label,'公司财务');
  assert.equal(core.smartClassify({name:'合作协议.pdf',category:'PDF',textSample:''}).label,'合同资料');
  assert.equal(core.smartClassify({name:'PawID-Setup.exe',category:'安装包',textSample:''}).label,'软件安装包');
});

test('smart classification can use local text sample',()=>{
  const out=core.smartClassify({name:'1111.txt',category:'文档',textSample:'abstract doi reference journal experiment'});
  assert.equal(out.label,'学术科研');
  assert.equal(out.confidence,'高');
});

test('buildPlan supports smart and type modes',()=>{
  const file={name:'合同最终版.pdf',path:'/tmp/合同最终版.pdf',size:10,category:'PDF',smart:{label:'合同资料',reason:'keyword',confidence:'中'}};
  assert.equal(core.buildPlan('/tmp',[file],'smart')[0].category,'合同资料');
  assert.equal(core.buildPlan('/tmp',[file],'type')[0].category,'PDF');
});
