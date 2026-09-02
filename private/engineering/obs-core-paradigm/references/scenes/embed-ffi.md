# Scene delta — FFI / 嵌入运行时

工作单元：一次跨界调用（JS<->Rust<->Python）或一次 Isolate 生命周期。

## 差字段

`isolate_id`（测试用，勿当全局单例 ID）、方向（js_to_rust / rust_to_py）、异常是否穿透、是否超时终止。

## 形态

采样栈与异常类型进事件；不要每条 JS 指令打点。泄漏验证走 smoke 循环，不把 RSS 绝对值当事件断言。
