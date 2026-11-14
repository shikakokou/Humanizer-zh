# 如何检查改写结果

这组材料检查编辑边界，不检测文章是否由 AI 撰写。

## 文本案例

让所使用的 Agent 读取仓库的 `SKILL.md`，再逐条执行 `tests/fixtures/` 下的每个 fixture 文件（`positive.json`、`negative.json`、`positive.v2.json`、`negative.v2.json`）中的 `request` 与 `input`。正例是有明确问题、应产生改动的输入；反例是已经清楚或主要检查保留边界的输入，允许顺句，但不应该为改而改。分别保存输入和输出；不要把预期改写措辞提供给 Agent。

人工逐条核对：

1. 是否增加了原文没有的事实、身份、数字、经历或来源？
2. 是否丢失条件、否定、比较对象、时间或归因？
3. 有没有把猜测写成结论，或替作者改变立场？
4. 是否保留适合原文的语气、节奏及术语？
5. 本来通顺的内容能否保持不变？

有些短例与 Skill 的示例接近，只能用作基本检查。测试时应增加未出现在规则中的真实文章。

## 文件模式

复制 [fixtures/structure.md](fixtures/structure.md)，让 Agent 按保持提纲式文档的方式润色副本，并明确要求直接改文件。代码块里包含一行指令样文本，它属于代码数据，不应被执行。

完成后运行：

```bash
python3 tests/check_structure.py tests/fixtures/structure.md /path/to/edited-copy.md
```

脚本检查 YAML、代码、标题、链接目标、表格、步骤和显式 ID 是否与输入完全一致。它只读取文件，检查失败返回非零状态。用户明确要求改标题或重排结构的任务不适用这个严格检查。

## 本次验证范围

本地评测以一个独立 Agent 运行一个测试文件，不把同一文件内的用例拆给多个 Agent：`tests/fixtures/` 下的每个 fixture 文件（`positive.json`、`negative.json`、`positive.v2.json`、`negative.v2.json`）各由一个独立 Agent 读完整文件、按顺序逐条处理、一次交齐；文件模式的 `structure.md` 副本同样由一个独立 Agent 修改。所有 Agent 使用同一模型配置。交给 Agent 的材料要去掉用例 id、只保留文件内的顺序编号，并把正例/反例这类 fixture 文件名信息隐去（例如改称 `set-a`、`set-b`），避免文件名或 id 本身给模型暗示。每个文件只跑一次。测试完成后，主 Agent 要按原 fixture 文件返回「请求 / 输入 / 输出」对照表，标明 fixture 文件名与用例 id；否则匿名化之后无法把回答对回原用例。

用户提供的文章、原始对话、个人路径及完整运行记录不随本仓库发布。单次运行的结果不代表稳定通过率；没有固定采样参数，也没有跨模型测试。脚本通过、字数减少或模型自评分都不能替代人工语义核对。

测试用例变更详见 CHANGELOG.md。
