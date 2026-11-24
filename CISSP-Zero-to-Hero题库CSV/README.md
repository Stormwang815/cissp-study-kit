# CISSP-Zero-to-Hero 题库 CSV

来源文件夹：`CISSP-Zero-to-Hero-main`

本次处理：
- 扫描正式选择题文件：16 个 `*.Q.* Questions.md`
- 抽取选择题：229 道
- 输出中文 App CSV：`cissp_zero_to_hero_questions_zh_app.csv`
- 保留英文原始 CSV：`cissp_zero_to_hero_questions_raw_en.csv`
- 翻译缓存：`translation_cache.json`

字段格式沿用之前 App 的 CSV 模板：
`id, domain_id, domain_name, tags, difficulty, question_en, question_cn, option_a, option_b, option_c, option_d, correct_answer, explanation_cn, why_a_wrong_cn, why_b_wrong_cn, why_c_wrong_cn, why_d_wrong_cn, manager_mindset_cn, source_type, source_name, source_url, review_status`

注意：
- `option_a` 到 `option_d` 已翻译为中文，英文原文保存在 raw CSV 中。
- 多选题的 `correct_answer` 使用分号分隔，例如 `A;C`。
- 普通章节里的 `Open Questions` 多数没有标准选项和答案，不符合 App 选择题模板，所以没有混入主 CSV。
- 翻译为机器翻译，建议导入 App 前对重点题目做人工复核。

Domain 题量：
- D1: 60
- D2: 39
- D3: 22
- D4: 24
- D5: 20
- D6: 14
- D7: 30
- D8: 20
