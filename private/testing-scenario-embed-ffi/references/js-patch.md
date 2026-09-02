# JS 行为补丁测试专项分册 (js-patch)

> **核心哲学**：行为补丁（Behavioral Patch）的核心价值是改变宿主环境特定对象的运行期行为。测试必须测**补丁注入后的可观察状态差分（Before vs After）**，而不是断言补丁的源代码字符串。

---

## 1. 补丁语义规格断言（Semantic Specification）

验证补丁是否正确生效的标准范式是「状态机差分（State Diffing）」：

### 核心三步验证法：
1. **基线状态（Before Patch）**：
   - 在纯净环境/未打补丁的目标对象上执行调用，记录基线返回值或异常。
   - 例：`window.fetch(url)` 在未打补丁时直接发起原始请求，返回原始数据。
2. **打入补丁（Apply Patch）**：
   - 加载并执行补丁代码，断言补丁安装函数成功返回，且注入点（Hook Point）挂载完成。
3. **差分断言（After Patch）**：
   - 再次执行相同调用，仅断言**可观察结果的改变**（如：请求头是否带上签名字段、参数是否被正确加密、抛出了特定错误类）；
   - **[禁止] 严禁强行断言内部实现细节（如必须存在某个私有包装函数、必须以某种固定方式进行函数拦截透传）**，遵循 Ian Cooper 律，保护等价重构的自由。

---

## 2. 表征测试与 Golden 边界控制（Characterization & Golden Testing）

在针对复杂的逆向 AST 补丁或混淆还原补丁做回归测试时，采用 Golden Files（已知好输出对比）是极佳手段，但必须严防**全量快照陷阱**。

### 规则一：精准字段 Golden（禁止全量 Snapshot 源码）
- **错误做法**：将打完补丁后生成的 1000 行完整 JS 代码做 `assert_snapshot!(generated_js)`。
  - *后果*：一旦编译器调整一个局部变量名、注释或换行符，测试全红；而当补丁真正算错加解密逻辑时，因为快照更新太容易，可能被开发者直接 `-u` 覆盖盲签。
- **正确做法**：将**可观察的关键字段输出或 AST 核心子树结构**做成 Golden（`hook_installed` 等内部挂载状态仅作为 `characterize` 诊断辅助字段，不作为 `spec` 强制契约要求）：
  ```json
  {
    "id": "patch_crypto_case_01",
    "kind": "characterize",
    "target_function": "encryptPayload",
    "hook_installed": true,
    "intercepted_keys": ["sig", "timestamp"],
    "transformed_ast_digest": "sha256:4a8f..."
  }
  ```

### 规则二：标注 Characterization vs Specification
- 如果 Golden 文件记录的是「当前已有行为的快照（防止改动时引发未预期破坏）」，必须在 `testdata` 中标明 `kind: "characterize"`，并在用例中命名为 `test_characterization_*`，提醒开发者：**这是现状记录，不是神圣规范**。

---

## 3. 防逃逸与宿主安全边界（Sandbox Invariants）

补丁通常在沙箱或受限宿主中运行，必须包含对破坏性行为的负向防御断言：

1. **原型链污染防范**：断言打补丁过程未恶意修改 `Object.prototype` / `Array.prototype` 等全局内置原型。
2. **未授权 API 阻断**：断言补丁脚本无法通过 `constructor`、`eval`、`Function` 逃逸并访问宿主未导出的私有全局对象。
