/**
 * 全量词库构建脚本：从上游 word-atlas.json 生成小程序词库数据文件。
 *
 * 数据源：环境变量 WORD_ATLAS_JSON，默认 ../word-atlas/data/word-atlas.json（相对项目根）。
 * 产物（均带自动生成头注释，勿手改）：
 *   miniprogram/data/vocab-index.ts   索引行 [id, word, meaningCN, ipaUK, ipaUS, cefr, topicId, pos]，学习路径顺序
 *   miniprogram/data/vocab-chunks.ts   chunk 元信息（每 chunk 词数、分包归属）
 *   miniprogram/vocab-{a,b,...}/chunks/N.js  详情行（原生 CommonJS），每文件 CHUNK_WORDS 词
 *     详情行 [id, senses, examples, collocations, wordFamily, usageTip, synonyms, antonyms, note]
 *     senses   = [[pos, zh, en], ...]（全部义项）
 *     examples = [[en, zh], ...]（全部例句文本）
 *     旧 Word 字段 meaningEN / example / exampleCN 由 word-repo 从首义项、首例句派生，避免重复存储
 *
 * 断言失败立即退出非 0：总数 7298、id 唯一、无空 senses/ex、
 * 话题词数与 data/topics.ts 一致、每分包 < 1.9MB、索引 < 800KB、
 * app.json 中 vocab-* 数据分包注册与本次生成结果一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MP = path.join(ROOT, 'miniprogram');
const SOURCE = process.env.WORD_ATLAS_JSON
  ? path.resolve(process.env.WORD_ATLAS_JSON)
  : path.join(ROOT, '..', 'word-atlas', 'data', 'word-atlas.json');

const EXPECTED_TOTAL = 7298;
const CHUNK_WORDS = 500;
const PACKAGE_BYTES_LIMIT = 1.6 * 1024 * 1024; // 分包分配阈值（保险上限 1.9MB 校验）
const PACKAGE_HARD_LIMIT = 1.9 * 1024 * 1024;
const INDEX_BYTES_LIMIT = 800 * 1024;

const failures = [];
function assert(cond, message) {
  if (!cond) failures.push(message);
}

// ---------- 读取与校验上游数据 ----------
const raw = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
assert(Array.isArray(raw), '上游数据不是数组');
assert(raw.length === EXPECTED_TOTAL, `总词数 ${raw.length} ≠ ${EXPECTED_TOTAL}`);

const ids = new Set();
const topicCount = new Map();
const rows = [];
for (const entry of raw) {
  assert(typeof entry.id === 'string' && entry.id, `词条 ${entry.w} 缺少 id`);
  assert(!ids.has(entry.id), `id 重复：${entry.id}`);
  ids.add(entry.id);
  assert(entry.senses?.length > 0, `${entry.id} 无 senses`);
  assert(entry.ex?.length > 0, `${entry.id} 无 ex`);
  assert(entry.uk && entry.us, `${entry.id} 缺音标`);
  topicCount.set(entry.topic, (topicCount.get(entry.topic) ?? 0) + 1);

  const sense = entry.senses[0];
  // 词性：合并所有义项的词性并去重（如 "n." 或 "n./v."），无词性则为空字符串
  const pos = [...new Set(entry.senses.map((s) => s.pos).filter(Boolean))].join('/');
  // 完整释义：全部义项与全部例句（上游当前为 1–3 个义项 / 2 条例句）
  const senses = (entry.senses ?? []).map((s) => [s.pos ?? '', s.zh ?? '', s.en ?? '']);
  const examples = (entry.ex ?? []).map((x) => [x.en ?? '', x.zh ?? '']);
  rows.push({
    id: entry.id,
    word: entry.w,
    zh: sense.zh,
    pos,
    ipa: entry.uk,
    ipaUS: entry.us,
    cefr: entry.cefr,
    topicId: entry.topic,
    senses,
    examples,
    col: entry.col ?? [],
    fam: entry.fam ?? [],
    tip: entry.tip ?? '',
    syn: entry.syn ?? [],
    ant: entry.ant ?? [],
    note: entry.note ?? ''
  });
}

// 话题词数必须与 data/topics.ts 的 wordCount 一致
const topicsSrc = fs.readFileSync(path.join(MP, 'data', 'topics.ts'), 'utf8');
const expectedCounts = new Map();
for (const m of topicsSrc.matchAll(/\{ id: '(\w+)', name: '[^']+', wordCount: (\d+) \}/g)) {
  expectedCounts.set(m[1], Number(m[2]));
}
assert(expectedCounts.size > 0, '未从 topics.ts 解析出 wordCount');
for (const [topic, count] of expectedCounts) {
  assert(topicCount.get(topic) === count, `话题 ${topic} 词数 ${topicCount.get(topic)} ≠ topics.ts 的 ${count}`);
}
assert([...topicCount.keys()].every((t) => expectedCounts.has(t)), `上游话题未在 topics.ts 中：${[...topicCount.keys()].filter((t) => !expectedCounts.has(t)).join(',')}`);

// ---------- 生成索引文件 ----------
function indexRow(r) {
  return [r.id, r.word, r.zh, r.ipa, r.ipaUS, r.cefr, r.topicId, r.pos];
}
/** 详情行不重复存放首义项/首例句：由 services/word-repo.ts 派生为 PRD 的 Word 字段。 */
function detailRow(r) {
  return [r.id, r.senses, r.examples, r.col, r.fam, r.tip, r.syn, r.ant, r.note];
}
const json = (value) => JSON.stringify(value);

const indexLines = rows.map((r) => `  ${json(indexRow(r))},`).join('\n');
const indexTs = `// 自动生成 by scripts/build-vocab.mjs，勿手改 · 数据来源 Word Atlas 开源数据集（CC BY 4.0）
export type VocabIndexRow = [string, string, string, string, string, string, string, string];
/** 索引行：[id, word, meaningCN, ipaUK, ipaUS, cefr, topicId, pos]，按上游学习路径顺序排列。pos 为去重词性（如 "n." 或 "n./v."）。 */
export const VOCAB_INDEX_ROWS: VocabIndexRow[] = [
${indexLines}
];
`;
assert(Buffer.byteLength(indexTs) < INDEX_BYTES_LIMIT, `索引文件 ${(Buffer.byteLength(indexTs) / 1048576).toFixed(2)}MB 超过 ${INDEX_BYTES_LIMIT / 1024}KB 上限`);

// ---------- 生成分包详情 chunk ----------
// 注意：chunk 文件必须是原生 .js（CommonJS）——分包内无页面的 .ts 不会被 devtools 的
// TS 编译插件编译（无静态引用），require.async 会报 "module is not defined"。
const chunks = [];
for (let i = 0; i < rows.length; i += CHUNK_WORDS) {
  const slice = rows.slice(i, i + CHUNK_WORDS);
  const lines = slice.map((r) => `  ${json(detailRow(r))},`).join('\n');
  const js = `// 自动生成 by scripts/build-vocab.mjs，勿手改 · 数据来源 Word Atlas 开源数据集（CC BY 4.0）
// 详情行：[id, senses, examples, collocations, wordFamily, usageTip, synonyms, antonyms, note]
// senses: [[pos, zh, en], ...] · examples: [[en, zh], ...]
// 由主包 services/word-repo.ts 通过 require.async（分包异步化）加载
module.exports = { VOCAB_DETAIL_ROWS: [
${lines}
] };
`;
  chunks.push({ no: chunks.length, js, bytes: Buffer.byteLength(js) });
}

// 按累计体积分配到分包（vocab-a、vocab-b、…）
const PACKAGE_ROOTS = ['vocab-a', 'vocab-b', 'vocab-c', 'vocab-d', 'vocab-e', 'vocab-f'];
const packages = [];
let current = { root: PACKAGE_ROOTS[0], chunks: [], bytes: 0 };
for (const chunk of chunks) {
  if (current.chunks.length > 0 && current.bytes + chunk.bytes > PACKAGE_BYTES_LIMIT) {
    packages.push(current);
    current = { root: PACKAGE_ROOTS[packages.length] ?? `vocab-${packages.length + 1}`, chunks: [], bytes: 0 };
  }
  current.chunks.push(chunk.no);
  current.bytes += chunk.bytes;
}
packages.push(current);
for (const pkg of packages) {
  assert(pkg.bytes < PACKAGE_HARD_LIMIT, `分包 ${pkg.root} ${pkg.bytes}B 超过 1.9MB`);
}

// 写出前先清理旧的 vocab-* 分包目录，避免残留
for (const dir of fs.readdirSync(MP)) {
  if (dir.startsWith('vocab-')) fs.rmSync(path.join(MP, dir), { recursive: true, force: true });
}

fs.mkdirSync(path.join(MP, 'data'), { recursive: true });
fs.writeFileSync(path.join(MP, 'data', 'vocab-index.ts'), indexTs);

for (const pkg of packages) {
  const dir = path.join(MP, pkg.root, 'chunks');
  fs.mkdirSync(dir, { recursive: true });
  for (const no of pkg.chunks) {
    fs.writeFileSync(path.join(dir, `${no}.js`), chunks[no].js);
  }
}

const pkgLines = packages
  .map((pkg) => `  { root: '${pkg.root}', chunks: ${json(pkg.chunks)} },`)
  .join('\n');
const metaTs = `// 自动生成 by scripts/build-vocab.mjs，勿手改 · 数据来源 Word Atlas 开源数据集（CC BY 4.0）
/** 每个 chunk 文件包含的词条数。 */
export const CHUNK_WORDS = ${CHUNK_WORDS};

/** 全量词库总词数。 */
export const VOCAB_TOTAL = ${rows.length};

export interface VocabChunkPackage {
  /** 分包根目录名（如 vocab-a）。 */
  root: string;
  /** 该分包包含的 chunk 编号。 */
  chunks: number[];
}

/** chunk 编号 → 分包归属映射。 */
export const VOCAB_CHUNK_PACKAGES: VocabChunkPackage[] = [
${pkgLines}
];
`;
fs.writeFileSync(path.join(MP, 'data', 'vocab-chunks.ts'), metaTs);

// ---------- 生成静态 chunk 加载器 ----------
// require.async 的路径必须是字面量：工具无法对模板字符串做静态依赖分析，
// 否则数据分包会被判为「无依赖文件」，上传时被 ignoreUploadUnusedFiles 过滤掉。
const loaderLines = packages
  .flatMap((pkg) => pkg.chunks.map((no) => `  ${no}: () => require.async('../${pkg.root}/chunks/${no}.js'),`))
  .join('\n');
const loadersTs = `// 自动生成 by scripts/build-vocab.mjs，勿手改 · 数据来源 Word Atlas 开源数据集（CC BY 4.0）
// @ts-nocheck
/**
 * chunk 编号 → 分包数据文件的静态加载器。
 * require.async 的参数必须是字符串字面量：开发者工具的静态依赖分析无法解析模板
 * 字符串拼出的路径，会把 15 个数据分包判为「无依赖文件」；上传时若开启
 * ignoreUploadUnusedFiles 就会被过滤，真机词条详情会空白。
 * 这个文件由 build-vocab.mjs 随分包划分一起生成，改分包时不需要手工维护。
 */
const loaders: Record<number, () => Promise<unknown>> = {
${loaderLines}
};

/** 按 chunk 编号加载分包数据模块（分包异步化）。 */
export function loadChunkModule(chunkNo: number): Promise<unknown> {
  const loader = loaders[chunkNo];
  if (!loader) return Promise.reject(new Error(\`chunk \${chunkNo} 未配置分包归属\`));
  return loader();
}
`;
fs.writeFileSync(path.join(MP, 'data', 'vocab-chunk-loaders.ts'), loadersTs);

// ---------- 校验 app.json 数据分包注册 ----------
// 分包数量随详情数据量变化；注册缺失会让 require.async 在真机找不到模块（编译期不报错）。
const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
const registered = (appJson.subPackages ?? [])
  .map((pkg) => pkg.root)
  .filter((root) => String(root).startsWith('vocab-'))
  .sort();
const generated = packages.map((pkg) => pkg.root).sort();
assert(
  registered.length === generated.length && registered.every((root, i) => root === generated[i]),
  `app.json 数据分包与生成结果不一致：需要 [${generated.join(', ')}]，当前 [${registered.join(', ')}]`
);

// ---------- 报告 ----------
if (failures.length) {
  console.error('BUILD FAILED:');
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
const fmt = (b) => `${(b / 1024).toFixed(0)}KB`;
console.log('BUILD OK  · 全量词库数据生成成功');
console.log(`  词条总数: ${rows.length}（chunk ${CHUNK_WORDS} 词/文件，共 ${chunks.length} 个 chunk 文件）`);
console.log(`  data/vocab-index.ts: ${fmt(Buffer.byteLength(indexTs))}（主包）`);
for (const pkg of packages) {
  console.log(`  ${pkg.root}: ${pkg.chunks.length} 个 chunk，共 ${fmt(pkg.bytes)}（分包）`);
}
console.log(`  话题词数校验: ${expectedCounts.size} 个话题与 topics.ts 一致`);
console.log(`  数据分包注册校验: ${generated.join(', ')} 与 app.json 一致`);
