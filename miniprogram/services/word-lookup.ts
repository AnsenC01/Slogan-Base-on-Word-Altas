import { VOCAB_INDEX_ROWS, type VocabIndexRow } from '../data/vocab-index';

/**
 * 例句 / 短语点词弹卡的查询层。
 *
 * 数据只来自主包里已有的 7298 词索引（vocab-index.ts），不新增词库文件、
 * 不请求网络、不加载分包；只有命中词库（含轻量词形还原）的词才可点。
 * 上游数据需保留 Word Atlas (CC BY 4.0) 署名，见 README 与 settings 页。
 */

/** 弹卡所需的同步词条信息：简单释义 / 词性 / 英美音标，点击即可零延迟展示。 */
export interface LookupWord {
  id: string;
  word: string;
  meaningCN: string;
  pos: string;
  phoneticUK: string;
  phoneticUS: string;
  cefr: string;
}

/** 分词后的最小渲染单元：命中词库的词带 id，其余输出为普通文本。 */
export interface TextToken {
  key: number;
  text: string;
  hit: boolean;
  /** 命中的词条 id，未命中为空串。 */
  id: string;
  /** 原文词形（如 endured），用于弹卡提示「来自 ...」。 */
  raw: string;
}

/** 词族等字段里的词性缩写，不能当作单词查词库。 */
const POS_ABBR = new Set([
  'n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'int', 'aux', 'art',
  'num', 'pl', 'sg', 'abbr', 'vt', 'vi', 'pref', 'suf'
]);

function buildItem(row: VocabIndexRow): LookupWord {
  return {
    id: row[0],
    word: row[1],
    meaningCN: row[2],
    phoneticUK: row[3],
    phoneticUS: row[4],
    cefr: row[5],
    pos: row[7]
  };
}

const byWord = new Map<string, LookupWord>();
const byId = new Map<string, LookupWord>();
VOCAB_INDEX_ROWS.forEach((row) => {
  const key = row[1].toLowerCase();
  const item = buildItem(row);
  byId.set(row[0], item);
  // 多词词头（如 "day off"）无法由单个 token 命中，跳过但不影响详情检索
  if (!key.includes(' ') && !byWord.has(key)) byWord.set(key, item);
});

/** 轻量词形还原候选，按优先级排列；不含原词（原词由精确匹配先查）。 */
function lemmaCandidates(w: string): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    if (value.length > 1 && !out.includes(value)) out.push(value);
  };
  if (w.endsWith("'s")) add(w.slice(0, -2));
  // 复数：-ies → -y / -es / -s
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  // 过去式 / 过去分词：-ied → -y / -ed / -d
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
  }
  // 现在分词：-ing / 去 e / 双写辅音
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
  }
  if (/([bcdfghjklmnpqrstvz])\1(ing|ed)$/.test(w)) add(w.slice(0, -4));
  // 副词
  if (w.endsWith('ly')) add(w.slice(0, -2));
  return out;
}

function normalize(raw: string): string {
  return raw.toLowerCase().replace(/\u2019/g, "'");
}

/** 查一个原文词形；精确命中优先，其次词形还原；未收录返回 undefined。 */
export function lookupByWord(raw: string): LookupWord | undefined {
  const w = normalize(raw);
  if (!w || POS_ABBR.has(w)) return undefined;
  const exact = byWord.get(w);
  if (exact) return exact;
  for (const candidate of lemmaCandidates(w)) {
    const found = byWord.get(candidate);
    if (found) return found;
  }
  return undefined;
}

/** 弹卡按 id 取同步信息（零延迟）。 */
export function getWordById(id: string): LookupWord | undefined {
  return byId.get(id);
}

const WORD_RE = /[A-Za-z]+(?:['\u2019][A-Za-z]+)?/g;

/**
 * 把任意中英混排文本切成渲染 token，拼接后与原文完全一致。
 * 中文、标点、空格以及未命中词库的英文词都是 hit=false 的纯文本。
 */
export function tokenize(text: string): TextToken[] {
  const source = String(text ?? '');
  const tokens: TextToken[] = [];
  const pushPlain = (value: string) => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev && !prev.hit) prev.text += value;
    else tokens.push({ key: tokens.length, text: value, hit: false, id: '', raw: '' });
  };
  WORD_RE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(source)) !== null) {
    pushPlain(source.slice(last, match.index));
    const raw = match[0];
    const found = lookupByWord(raw);
    if (found) {
      tokens.push({ key: tokens.length, text: raw, hit: true, id: found.id, raw });
    } else {
      pushPlain(raw);
    }
    last = match.index + raw.length;
  }
  pushPlain(source.slice(last));
  return tokens;
}
