# Scene delta — FFI / 嵌入运行时

契约对象：共享 testdata、`kind`、异常类与 code、类型往返。

## 差

三端读同一 testdata 文件。对齐/符号宽度、GIL 是物理，不在本包改 schema 解决。异常契约默认类+code，文案非契约。
