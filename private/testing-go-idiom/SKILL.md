---
name: testing-go-idiom
description: Go 地道测试机制规范（Testing Go Idiomatic）：定义 Go 表驱动测试（Table-Driven Tests）、t.Run 子测试、wantErr 模式、testdata 隔离、原生 Fuzzing 以及 errors.Is/As 错误契约断言。触发词：go-test, golang-testing, table-driven-tests, go-fuzz, go-testdata.
---

# Testing Go Idiomatic — Go 地道测试机制规范

> **核心哲学**：Go 语言推崇简单、显式与最小化抽象。
> 官方标准测试文化以**表驱动测试（Table-Driven Tests）**和**原生模糊测试（Go Fuzzing）**为基石。避免过度引入复杂的第三方 Mock 框架，用简单的结构体切片和子测试表达清晰的用例矩阵。

---

## 1. 目录结构与包可见性

- **同包单元测试**：`foo.go` 与 `foo_test.go` 同属 `package foo`，用于测试内部纯逻辑；
- **跨包黑盒集成测试**：使用 `package foo_test`，仅通过导出的公共接口（Public API）进行测试，防止测试渗入私有实现；
- **`testdata/` 目录**：Go 工具链默认忽略 `testdata` 目录的编译，专门用于存放测试 Fixtures；
- **内部测试 Seam**：若必须暴露测试钩子而不扩大 Public API，可通过 `internal/` 包或导出受限变量实现。

---

## 2. 表驱动测试与错误断言（Table-Driven Patterns）

### 1. 表驱动标准结构
```go
func TestParsePayload(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    *Result
        wantErr bool
        errIs   error
    }{
        {
            name:    "valid json payload",
            input:   `{"id": 123}`,
            want:    &Result{ID: 123},
            wantErr: false,
        },
        {
            name:    "syntax error",
            input:   `{"id": `,
            want:    nil,
            wantErr: true,
            errIs:   ErrMalformedSyntax,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParsePayload(tt.input)
            if (err != nil) != tt.wantErr {
                t.Fatalf("ParsePayload() error = %v, wantErr %v", err, tt.wantErr)
            }
            if tt.errIs != nil && !errors.Is(err, tt.errIs) {
                t.Errorf("ParsePayload() error = %v, want %v", err, tt.errIs)
            }
            if diff := cmp.Diff(tt.want, got); diff != "" {
                t.Errorf("ParsePayload() mismatch (-want +got):\n%s", diff)
            }
        })
    }
}
```

### 2. 错误断言准则
- 使用 `errors.Is(err, TargetErr)` 或 `errors.As` 断言错误类型与哨兵错误；
- **[禁止] 严禁断言 `err.Error()` 的自然语言字符串**（除非该字符串是对外公开的 CLI 标准输出契约）。

---

## 3. 隔离与原生 Fuzzing

### 1. 环境与文件隔离
- 使用 `t.TempDir()` 创建临时测试目录，Go 框架会在测试结束时自动清理；
- 使用 `t.Setenv("KEY", "VAL")` 注入环境变量，测试结束时自动还原，防止污染其他并行用例；
- 避免修改全局 `http.DefaultClient`，通过构造函数注入 `http.Client` 或自定义 `RoundTripper`。

### 2. 原生 Fuzz 模糊测试
针对解析器、反序列化器与解码器编写 Fuzz 目标：
```go
func FuzzParsePayload(f *testing.F) {
    // 种子用例
    f.Add(`{"id": 1}`)
    f.Add(`invalid`)

    f.Fuzz(func(t *testing.T, data string) {
        // 断言不变式: 绝不发生 panic
        _, _ = ParsePayload(data)
    })
}
```
