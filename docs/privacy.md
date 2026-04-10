# Privacy Policy

`ccg-grant-deliberation` 默认按本地工具运行。

- 插件只读取用户显式提供的议题、材料路径和运行环境信息。
- 当你调用实际模型 provider 时，相关 prompt 与材料摘要会发送给对应 provider。
- 本仓库本身不额外托管独立云端服务，也不默认持久化完整辩论 transcript。
- 生成的报告默认写入本地 `reports/ccg-grant-deliberation/` 目录。

使用本插件前，请自行确认你所调用的 `codex`、`gemini`、`claude` 及相关包装器的隐私与数据处理政策。
