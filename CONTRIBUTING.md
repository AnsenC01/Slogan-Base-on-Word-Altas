# 贡献指南

发现问题时，请附上**词条 ID、复现步骤和预期结果**；内容纠错如有词典或其他可靠依据，也请一并提供。

## 提交前检查

```bash
npm run typecheck         # TypeScript 类型检查
npm run build:vocab       # 改动上游词库数据后重建索引与分包
npm run build:passages    # 改动短文数据后重建
npm run selfcheck:lookup  # 点词索引全量自测
npm run e2e               # 自动探测开发者工具 CLI（自定义安装位置可设置 WECHAT_DEVTOOLS_CLI）
```

## 约定

- 遵循工程根 `docs/PRD.md`（仓库外）的 MVP 范围与「明确不做」清单；先计划后编码，每阶段编译通过再进入下一阶段。
- 生成文件（`miniprogram/data/vocab-index.ts`、`passages.ts`、`vocab-*/chunks/*.js`）不要手改；改源数据与生成脚本后重跑构建。
- 不要提交 `.env`、密钥、开发者工具私有配置或本机绝对路径；私有配置由 `.gitignore` 排除。
- 应用代码按 [MIT](LICENSE) 贡献，内容素材按 [CC BY 4.0](CONTENT_LICENSE.md) 处理。
