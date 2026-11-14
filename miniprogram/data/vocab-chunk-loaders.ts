// 自动生成 by scripts/build-vocab.mjs，勿手改 · 数据来源 Word Atlas 开源数据集（CC BY 4.0）
// @ts-nocheck
/**
 * chunk 编号 → 分包数据文件的静态加载器。
 * require.async 的参数必须是字符串字面量：开发者工具的静态依赖分析无法解析模板
 * 字符串拼出的路径，会把 15 个数据分包判为「无依赖文件」；上传时若开启
 * ignoreUploadUnusedFiles 就会被过滤，真机词条详情会空白。
 * 这个文件由 build-vocab.mjs 随分包划分一起生成，改分包时不需要手工维护。
 */
const loaders: Record<number, () => Promise<unknown>> = {
  0: () => require.async('../vocab-a/chunks/0.js'),
  1: () => require.async('../vocab-a/chunks/1.js'),
  2: () => require.async('../vocab-a/chunks/2.js'),
  3: () => require.async('../vocab-a/chunks/3.js'),
  4: () => require.async('../vocab-b/chunks/4.js'),
  5: () => require.async('../vocab-b/chunks/5.js'),
  6: () => require.async('../vocab-b/chunks/6.js'),
  7: () => require.async('../vocab-b/chunks/7.js'),
  8: () => require.async('../vocab-c/chunks/8.js'),
  9: () => require.async('../vocab-c/chunks/9.js'),
  10: () => require.async('../vocab-c/chunks/10.js'),
  11: () => require.async('../vocab-c/chunks/11.js'),
  12: () => require.async('../vocab-d/chunks/12.js'),
  13: () => require.async('../vocab-d/chunks/13.js'),
  14: () => require.async('../vocab-d/chunks/14.js'),
};

/** 按 chunk 编号加载分包数据模块（分包异步化）。 */
export function loadChunkModule(chunkNo: number): Promise<unknown> {
  const loader = loaders[chunkNo];
  if (!loader) return Promise.reject(new Error(`chunk ${chunkNo} 未配置分包归属`));
  return loader();
}
