// 自动生成 by scripts/build-vocab.mjs，勿手改 · 数据来源 Word Atlas 开源数据集（CC BY 4.0）
/** 每个 chunk 文件包含的词条数。 */
export const CHUNK_WORDS = 500;

/** 全量词库总词数。 */
export const VOCAB_TOTAL = 7298;

export interface VocabChunkPackage {
  /** 分包根目录名（如 vocab-a）。 */
  root: string;
  /** 该分包包含的 chunk 编号。 */
  chunks: number[];
}

/** chunk 编号 → 分包归属映射。 */
export const VOCAB_CHUNK_PACKAGES: VocabChunkPackage[] = [
  { root: 'vocab-a', chunks: [0,1,2,3] },
  { root: 'vocab-b', chunks: [4,5,6,7] },
  { root: 'vocab-c', chunks: [8,9,10,11] },
  { root: 'vocab-d', chunks: [12,13,14] },
];
