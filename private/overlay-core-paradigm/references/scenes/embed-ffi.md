# Scene delta — FFI / 嵌入运行时

## 性能

跨界拷贝最小化是目标，断言阶数与是否多余克隆，不断言单次调用绝对微秒。RSS 绝对值禁止。

## 韧性

单测单 Isolate。宿主崩溃不得污染下一用例。超时 terminate 后返回结构化错误。

## 兼容

共享 testdata 三端同文件。绑定层薄，行为在纯 Rust 测。

Isolate / GIL / UAF 物理仍在 testing-scenario-embed-ffi。
