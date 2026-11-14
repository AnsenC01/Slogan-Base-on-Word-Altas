/**
 * 短文记词数据构建：
 *   wordiary-passages/passages.min.json  → 目录 / 正文 / 中文译文
 *   word-atlas/data/word-atlas.json      → 重点词（CEFR 自适应）/ 义项 / 音标
 *   → miniprogram/data/passages.ts（主包，生成文件，勿手改）
 *
 * 重点词口径与 wordiary-passages/passage-preview.html 预览一致：
 * 只取命中 7298 词库（含词形还原）的 B1 及以上实词；每篇太少降 A2、太密升 B2；
 * 词库自带的多词词头优先整体标注。中文取词库首义项，弹卡可展开全部义项。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const MP = path.join(PROJECT, 'miniprogram');
const MIN_JSON = process.env.PASSAGES_MIN_JSON || path.resolve(PROJECT, '../wordiary-passages/passages.min.json');
const FULL_JSON = process.env.PASSAGES_FULL_JSON || path.resolve(PROJECT, '../wordiary-passages/passages.json');
const ATLAS_JSON = process.env.WORD_ATLAS_JSON || path.resolve(PROJECT, '../word-atlas/data/word-atlas.json');
const OUT_FILE = path.join(MP, 'data', 'passages.ts');
const OUTPUT_BYTES_LIMIT = 900 * 1024;

const failures = [];
const assert = (ok, msg) => {
  if (!ok) failures.push(msg);
};
const stringify = (v) => JSON.stringify(v);
const normalize = (v) => String(v ?? '').toLowerCase().replace(/\u2019/g, "'");

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const minData = readJson(MIN_JSON);
const fullData = readJson(FULL_JSON);
const atlas = readJson(ATLAS_JSON);

assert(Array.isArray(atlas) && atlas.length === 7298, `上游词库应为 7298 词，当前 ${atlas?.length}`);
assert(Array.isArray(minData?.passages) && minData.passages.length === 67, `精简版应为 67 篇`);
assert(Array.isArray(fullData?.passages) && fullData.passages.length === 67, `全量版应为 67 篇`);
assert(minData?.meta?.passageCount === 67, `精简版 meta.passageCount 应为 67`);

// ---------- 词库索引（复用 word-lookup.ts 的分词与词形还原规则） ----------
const POS_ABBR = new Set([
  'n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'int', 'aux', 'art',
  'num', 'pl', 'sg', 'abbr', 'vt', 'vi', 'pref', 'suf'
]);
const LEVELS = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
const byWord = new Map();
const phrases = new Map();

for (const row of atlas) {
  const key = normalize(row.w);
  const senses = Array.isArray(row.senses) ? row.senses : [];
  const rec = {
    w: String(row.w ?? ''),
    zh: String(senses[0]?.zh ?? '').trim(),
    cefr: String(row.cefr ?? ''),
    uk: String(row.uk ?? ''),
    us: String(row.us ?? ''),
    ss: senses.slice(0, 3).map((s) => [String(s.pos ?? ''), String(s.zh ?? '').trim()])
  };
  if (key.includes(' ')) {
    if (!phrases.has(key)) phrases.set(key, rec);
  } else if (key && !byWord.has(key)) {
    byWord.set(key, rec);
  }
}

function lemmaCandidates(w) {
  const out = [];
  const add = (v) => {
    if (v.length > 1 && !out.includes(v)) out.push(v);
  };
  if (w.endsWith("'s")) add(w.slice(0, -2));
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
  }
  if (/([bcdfghjklmnpqrstvz])\1(ing|ed)$/.test(w)) add(w.slice(0, -4));
  if (w.endsWith('ly')) add(w.slice(0, -2));
  return out;
}

function lookup(raw) {
  const exact = byWord.get(raw);
  if (exact) return exact;
  for (const candidate of lemmaCandidates(raw)) {
    const found = byWord.get(candidate);
    if (found) return found;
  }
  return null;
}

function shortZh(zh) {
  const parts = String(zh ?? '').split(/[；;]/).map((s) => s.trim()).filter(Boolean);
  const text = parts.slice(0, 2).join('；');
  return text.length > 12 ? `${text.slice(0, 12)}…` : text;
}

const WORD_RE = /[A-Za-z]+(?:['\u2019][A-Za-z]+)?/g;

function collectWords(text, minLevel) {
  const out = [];
  WORD_RE.lastIndex = 0;
  let match;
  while ((match = WORD_RE.exec(text)) !== null) {
    const raw = normalize(match[0]);
    if (raw.length < 3 || POS_ABBR.has(raw)) continue;
    const rec = lookup(raw);
    if (!rec || !rec.zh || (LEVELS[rec.cefr] ?? -1) < LEVELS[minLevel]) continue;
    out.push({ s: match.index, e: match.index + match[0].length, text: match[0], rec });
  }
  return out;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function collectPhrases(text) {
  const out = [];
  const list = [...phrases.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, rec] of list) {
    const re = new RegExp(escapeRegExp(phrase), 'gi');
    let match;
    while ((match = re.exec(text)) !== null) {
      const before = text[match.index - 1] ?? '';
      const after = text[match.index + match[0].length] ?? '';
      if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after)) continue;
      out.push({ s: match.index, e: match.index + match[0].length, text: match[0], rec });
    }
  }
  return out;
}

function buildKeywords(text) {
  const base = collectWords(text, 'B1');
  let level = 'B1';
  let words = base;
  if (base.length < 10) {
    level = 'A2';
    words = collectWords(text, 'A2');
  } else if (base.length > 48) {
    level = 'B2';
    words = collectWords(text, 'B2');
  }
  const multi = collectPhrases(text);
  const kept = words.filter((k) => !multi.some((p) => k.s < p.e && p.s < k.e));
  const all = [...multi, ...kept].sort((a, b) => a.s - b.s);
  const result = [];
  let last = 0;
  for (const item of all) {
    if (item.s < last) continue;
    result.push({ ...item.rec, s: item.s, e: item.e, text: item.text, zh: shortZh(item.rec.zh) });
    last = item.e;
  }
  return { keywords: result, level };
}

function buildSegments(text, keywords) {
  const segments = [];
  let pos = 0;
  keywords.forEach((k, i) => {
    if (k.s > pos) segments.push({ t: 0, x: text.slice(pos, k.s) });
    segments.push({ t: 1, x: text.slice(k.s, k.e), ki: i });
    segments.push({ t: 2, x: `（${k.zh}）` });
    pos = k.e;
  });
  if (pos < text.length) segments.push({ t: 0, x: text.slice(pos) });
  return segments;
}

// ---------- 逐篇生成 ----------
const index = [];
const content = {};
const counters = { 'ielts-passage': 0, 'bilingual-story': 0 };
let kwTotal = 0;
let kwMax = 0;

minData.passages.forEach((p, i) => {
  const full = fullData.passages[i];
  assert(full?.id === p.id, `第 ${i + 1} 篇两份 JSON 的 id 不一致`);
  assert(p.english === full?.english, `${p.id} 两份 JSON 的 english 不一致`);
  assert(p.chinese === full?.chinese, `${p.id} 两份 JSON 的 chinese 不一致`);
  assert(typeof p.english === 'string' && p.english.trim().length > 0, `${p.id} english 为空`);
  assert(typeof p.chinese === 'string' && p.chinese.trim().length > 0, `${p.id} chinese 为空`);
  assert(['ielts-passage', 'bilingual-story'].includes(p.category), `${p.id} category 非法`);

  const { keywords, level } = buildKeywords(p.english);
  assert(keywords.length > 0, `${p.id} 没有重点词`);
  keywords.forEach((k) => {
    assert(p.english.slice(k.s, k.e) === k.text, `${p.id} 重点词 ${k.text} 位置不匹配`);
  });
  for (let j = 1; j < keywords.length; j += 1) {
    assert(keywords[j - 1].e <= keywords[j].s, `${p.id} 重点词区间重叠`);
  }

  const segments = buildSegments(p.english, keywords);
  assert(
    segments.filter((s) => s.t !== 2).map((s) => s.x).join('') === p.english,
    `${p.id} segments 拼接未还原英文原文`
  );

  const groupIndex = counters[p.category] ?? 0;
  counters[p.category] = groupIndex + 1;
  kwTotal += keywords.length;
  kwMax = Math.max(kwMax, keywords.length);

  index.push({
    id: p.id,
    no: p.sourceNo ?? null,
    en: p.title?.en ?? '',
    zh: p.title?.zh ?? null,
    category: p.category,
    kwCount: keywords.length,
    level,
    index: groupIndex
  });
  content[p.id] = {
    id: p.id,
    segments,
    zhLines: String(p.chinese ?? '').split('\n'),
    keywords: keywords.map((k) => ({ w: k.w, zh: k.zh, cefr: k.cefr, uk: k.uk, us: k.us, ss: k.ss })),
    kwCount: keywords.length,
    level
  };
});

assert(new Set(index.map((p) => p.id)).size === index.length, 'id 不唯一');
assert(counters['ielts-passage'] === 40, `雅思短文应为 40 篇，当前 ${counters['ielts-passage']}`);
assert(counters['bilingual-story'] === 27, `双语小故事应为 27 篇，当前 ${counters['bilingual-story']}`);

const output = `// 自动生成 by scripts/build-passages.mjs，勿手改
// 短文原文/译文：wordiary-passages/passages.min.json（网络流传资料，上架前需确认授权）
// 重点词/义项/音标：Word Atlas 开源数据集（CC BY 4.0）
import type { PassageIndexItem, PassageContent } from '../types/passage';

/** 短文目录（主包同步加载，列表页用）。 */
export const PASSAGE_INDEX: PassageIndexItem[] = [
${index.map((row) => `  ${stringify(row)},`).join('\n')}
];

/** 短文正文与重点词标注（主包同步加载，详情页用）。 */
export const PASSAGE_CONTENT: Record<string, PassageContent> = {
${Object.entries(content).map(([id, row]) => `  ${stringify(id)}: ${stringify(row)},`).join('\n')}
};
`;
const outBytes = Buffer.byteLength(output);
assert(outBytes < OUTPUT_BYTES_LIMIT, `passages.ts ${outBytes}B 超过 ${OUTPUT_BYTES_LIMIT}B`);

if (failures.length) {
  console.error('BUILD FAILED:');
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}

fs.writeFileSync(OUT_FILE, output);
console.log('BUILD OK  · 短文数据生成成功');
console.log(`  篇数: ${index.length}（雅思短文 ${counters['ielts-passage']} / 双语小故事 ${counters['bilingual-story']}）`);
console.log(`  重点词: ${kwTotal} 处，单篇最多 ${kwMax} 个`);
console.log(`  data/passages.ts: ${(outBytes / 1024).toFixed(0)}KB（主包）`);
console.log('  校验: 两份 JSON 一致 / 分段还原 / 标注位置与区间 / 分组篇数');
