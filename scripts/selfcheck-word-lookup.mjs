/**
 * 点词弹卡查询层自测：node scripts/selfcheck-word-lookup.mjs
 * 用 typescript 的 transpileModule 直接加载 .ts，不产出临时文件、不依赖开发者工具。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();

function loadTs(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const src = fs.readFileSync(abs, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const localRequire = (spec) => {
    if (spec.startsWith('.')) return loadTs(path.resolve(path.dirname(abs), `${spec}.ts`));
    return require(spec);
  };
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}

const { tokenize, lookupByWord, getWordById } = loadTs(
  path.join(root, 'miniprogram/services/word-lookup.ts')
);

const failures = [];
function check(name, pass, detail = '') {
  if (!pass) failures.push(`${name}${detail ? ` · ${detail}` : ''}`);
}

const samples = [
  'We endured hours of noise while workers repaired the roof.',
  'endure hardship｜忍受艰苦',
  'endurance (n.)',
  'library是借阅书籍的图书馆，bookshop是售书的书店。',
  "The world's oldest opera houses are still in use.",
  'We endured hours... '
];
for (const text of samples) {
  const joined = tokenize(text).map((t) => t.text).join('');
  check('分词无损还原原文', joined === text, JSON.stringify(text));
}

const hitCases = [
  ['endured', 'endure'], ['hours', 'hour'], ['considered', 'consider'],
  ['library', 'library'], ['fool', 'fool'], ['opera', 'opera'],
  ['endurance', 'endurance'], ['centuries', 'century']
];
for (const [raw, expected] of hitCases) {
  const found = lookupByWord(raw);
  check(`词形 ${raw} 命中 ${expected}`, !!found && found.word.toLowerCase() === expected,
    found ? found.word : '未命中');
}
for (const raw of ['the', 'a', 'of', 'while', 'n', 'adj', 'zzzz']) {
  check(`未收录词 ${raw} 不可点`, lookupByWord(raw) === undefined);
}

const atlas = JSON.parse(
  fs.readFileSync(path.join(root, '../word-atlas/data/word-atlas.json'), 'utf8')
);
const WORD_RE = /[A-Za-z]+(?:['\u2019][A-Za-z]+)?/g;
let total = 0;
let clickable = 0;
const byField = {};
const fields = [
  ['例句', (r) => (r.ex || []).slice(0, 1).map((e) => e.en)],
  ['搭配', (r) => r.col || []],
  ['词族', (r) => r.fam || []],
  ['同义词', (r) => r.syn || []],
  ['反义词', (r) => r.ant || []],
  ['辨析', (r) => (r.tip ? [r.tip] : [])]
];
for (const [name, get] of fields) {
  let fieldTotal = 0;
  let fieldHit = 0;
  for (const row of atlas) {
    for (const text of get(row)) {
      const value = String(text || '');
      // 词族字段里的 (n.) / (adj.) 是词性标注，不是单词，不计入分母
      const countable = value.replace(/\([^)]*\)/g, ' ');
      fieldTotal += (countable.match(WORD_RE) || []).length;
      const tokens = tokenize(value);
      for (const token of tokens) {
        if (!token.hit) continue;
        fieldHit++;
        check('命中 token 的 id 可反查', !!getWordById(token.id), token.id);
      }
    }
  }
  total += fieldTotal;
  clickable += fieldHit;
  byField[name] = `${((100 * fieldHit) / Math.max(1, fieldTotal)).toFixed(1)}%`;
}
const ratio = (100 * clickable) / Math.max(1, total);
check('全量可点比例落在预期区间 65%~80%', ratio > 65 && ratio < 80, `${ratio.toFixed(1)}%`);

console.log(`分词样本 ${samples.length} 条，词条 ${atlas.length} 个，英文词次 ${total}`);
console.log(`可点 ${clickable}（${ratio.toFixed(1)}%），分模块：`, byField);
if (failures.length) {
  console.error(`WORD_LOOKUP_SELF_CHECK_FAILED：${failures.length} 项`);
  failures.slice(0, 20).forEach((item) => console.error(`  ✗ ${item}`));
  process.exit(1);
}
console.log('WORD_LOOKUP_SELF_CHECK_PASSED');
