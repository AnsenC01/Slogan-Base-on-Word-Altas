import { VOCAB_INDEX_ROWS, type VocabIndexRow } from '../data/vocab-index';
import { CHUNK_WORDS, VOCAB_CHUNK_PACKAGES } from '../data/vocab-chunks';
import { loadChunkModule } from '../data/vocab-chunk-loaders';
import { mediaUrls } from '../data/media';
import type { CEFR, LibraryFilter, Word } from '../types/index';

export interface WordIndexItem {
  id: string;
  word: string;
  phoneticUK: string;
  meaningCN: string;
  pos: string;
  cefr: Word['cefr'];
  topicId: string;
  thumbUrl: string;
}

/** 启动时加载的全量索引（7298 词，主包内），供学习队列/词库筛选/练习干扰项同步使用。 */
export const WORD_INDEX: WordIndexItem[] = VOCAB_INDEX_ROWS.map((row) => ({
  id: row[0],
  word: row[1],
  meaningCN: row[2],
  pos: row[7],
  phoneticUK: row[3],
  cefr: row[5] as CEFR,
  topicId: row[6],
  thumbUrl: mediaUrls(row[0]).thumb
}));

/** 词条 id → 学习路径序号。 */
const orderById = new Map<string, number>(VOCAB_INDEX_ROWS.map((row, i) => [row[0], i]));

/** 单个义项：[pos, zh, en]。 */
type DetailSense = [string, string, string];
/** 单条例句：[en, zh]。 */
type DetailExample = [string, string];
/** 详情行：[id, senses, examples, collocations, wordFamily, usageTip, synonyms, antonyms, note]（与生成的 chunk 文件一致）。 */
type VocabDetailRow = [string, DetailSense[], DetailExample[], string[], string[], string, string[], string[], string];

/** 已合并完成的词条缓存。 */
const wordCache = new Map<string, Word>();
/** 已加载 chunk 的详情行缓存：chunk 编号 → id → 详情行。 */
const chunkRows = new Map<number, Map<string, VocabDetailRow>>();
/** chunk 加载去重：chunk 编号 → 加载 Promise。 */
const chunkPromises = new Map<number, Promise<void>>();

/** 仅用于日志显示分包归属；真实的模块路径由静态 loader 表提供。 */
function packageRootOf(chunkNo: number): string {
  const pkg = VOCAB_CHUNK_PACKAGES.find((item) => item.chunks.includes(chunkNo));
  if (!pkg) throw new Error(`chunk ${chunkNo} 未配置分包归属`);
  return pkg.root;
}

/** 分包异步化按需加载 chunk 文件（微信基础库提供 require.async；chunk 为原生 .js，规避 TS 插件不编译无静态引用分包文件的问题）。 */
function loadChunk(chunkNo: number): Promise<void> {
  let pending = chunkPromises.get(chunkNo);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => {
        console.log(`[word-repo] 请求 chunk ${chunkNo}（${packageRootOf(chunkNo)}）`);
        // 路径必须是字面量才能被静态依赖分析识别，见 data/vocab-chunk-loaders.ts
        return loadChunkModule(chunkNo);
      })
      .then((mod) => {
        // 兼容不同运行时的模块封装：优先直接导出，其次 ESM default 包装
        const candidate = (mod ?? {}) as {
          VOCAB_DETAIL_ROWS?: VocabDetailRow[];
          default?: { VOCAB_DETAIL_ROWS?: VocabDetailRow[] };
        };
        const rows = candidate.VOCAB_DETAIL_ROWS ?? candidate.default?.VOCAB_DETAIL_ROWS;
        console.log(`[word-repo] chunk ${chunkNo} 加载，导出键=[${Object.keys(candidate)}]，词条数=${rows ? rows.length : '无'}`);
        if (!rows || !rows.length) {
          throw new Error(`chunk ${chunkNo} 词条数据为空`);
        }
        chunkRows.set(chunkNo, new Map(rows.map((row) => [row[0], row])));
      });
    // 失败后清除缓存，允许下次进入时重试（真机分包下载可能因网络原因失败）
    pending.catch((err) => {
      console.error('[word-repo] chunk 加载失败', chunkNo, err);
      chunkPromises.delete(chunkNo);
    });
    chunkPromises.set(chunkNo, pending);
  }
  return pending;
}

/** 索引行 + 详情行 + 派生媒体 URL → PRD Word 结构（旧字段取首义项/首例句，扩展字段保留全量）。 */
function buildWord(index: VocabIndexRow, detail: VocabDetailRow): Word {
  const urls = mediaUrls(index[0]);
  const senses = (detail[1] ?? []).map((item) => ({ pos: item[0], zh: item[1], en: item[2] }));
  const examples = (detail[2] ?? []).map((item) => ({ en: item[0], zh: item[1] }));
  const firstSense = senses[0];
  const firstExample = examples[0];
  return {
    id: index[0],
    word: index[1],
    phoneticUK: index[3],
    phoneticUS: index[4],
    pos: index[7],
    meaningCN: index[2],
    meaningEN: firstSense?.en ?? '',
    example: firstExample?.en ?? '',
    exampleCN: firstExample?.zh ?? '',
    collocations: detail[3],
    wordFamily: detail[4],
    usageTip: detail[5],
    topicId: index[6],
    cefr: index[5] as CEFR,
    imageUrl: urls.img,
    thumbUrl: urls.thumb,
    audioUK: urls.uk,
    audioUS: urls.us,
    audioExample: urls.ex,
    senses,
    examples,
    synonyms: detail[6],
    antonyms: detail[7],
    note: detail[8]
  };
}

/** 详情加载入口：按需加载词条所在 chunk 并合并为 Word；未收录的 id 返回 undefined。 */
export function loadWordDetail(id: string): Promise<Word | undefined> {
  const cached = wordCache.get(id);
  if (cached) return Promise.resolve(cached);
  const order = orderById.get(id);
  if (order === undefined) return Promise.resolve(undefined);
  return loadChunk(Math.floor(order / CHUNK_WORDS)).then(() => {
    const cachedNow = wordCache.get(id);
    if (cachedNow) return cachedNow;
    const detail = chunkRows.get(Math.floor(order / CHUNK_WORDS))?.get(id);
    if (!detail) return undefined;
    const word = buildWord(VOCAB_INDEX_ROWS[order], detail);
    wordCache.set(id, word);
    return word;
  });
}

/** 批量加载（chunk 级去重，并发拉取未加载的 chunk）。 */
export function loadWordsByIds(ids: string[]): Promise<Word[]> {
  return Promise.all(ids.map((id) => loadWordDetail(id))).then((words) =>
    words.filter((word): word is Word => !!word)
  );
}

export function filterWords(filter: LibraryFilter): WordIndexItem[] {
  const keyword = (filter.keyword ?? '').trim().toLowerCase();
  return WORD_INDEX.filter((item) => {
    if (filter.cefr && filter.cefr !== 'ALL' && item.cefr !== filter.cefr) return false;
    if (filter.topicId && item.topicId !== filter.topicId) return false;
    if (keyword) {
      const haystack = `${item.word} ${item.meaningCN}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export function paginate<T>(list: T[], page: number, pageSize: number): T[] {
  return list.slice(0, page * pageSize);
}
