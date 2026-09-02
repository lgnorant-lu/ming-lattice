---
name: testing-python-idiom
description: Python 地道测试机制规范（Testing Python Idiomatic）：定义 pytest Fixture 作用域分层（session/module/function）与依赖注入、parametrize 表驱动测试、pytest.raises 严格异常契约断言、避免滥用 monkeypatch 刺探私有状态，以及基于协议的轻量适配器模式。触发词：python-test, pytest, pytest-patterns, python-fixtures, parametrize-test, hypothesis-python.
---

# Testing Python Idiomatic — Python 地道测试机制规范

> **核心哲学**：Python 动态语言特性使得运行时类型不确定性与边界异常风险较高。
> Python 测试必须承担起补充类型与协议契约验证的责任，充分利用 **pytest 的依赖注入机制（Fixtures）与表驱动参数化（Parametrize）**，杜绝无断言测试与滥用私有 Mock。

---

## 1. Fixture 作用域与依赖注入（Fixtures Hierarchy）

pytest 的核心威力在于显式的依赖注入（Dependency Injection），而非全局状态：

### 1. 作用域层级管理
- **`scope="session"`**：耗时的全局只读纯数据资源（如加载大型只读 JSON 测试集）。**[禁止] 严禁在 session 级别共享 V8 Isolate 或具备内部易变状态的引擎实例**（引擎实例必须遵循单测单 Isolate 原则）。
- **`scope="module"`**：单文件内共享的无状态客户端或轻量只读配置。
- **`scope="function"`（默认）**：每个用例独立的状态实例、临时文件目录（`tmp_path`），确保用例完全隔离（FIRST 原则）。

### 2. 利用 `yield` 实现优雅清理
```python
import pytest

@pytest.fixture
def managed_resource(tmp_path):
    # Setup
    res = init_resource(tmp_path)
    yield res
    # Teardown: 自动清理，保证异常时也执行
    res.cleanup()
```

---

## 2. 表驱动与参数化测试（Parametrize）

避免为同一逻辑的 10 个测试例子复制粘贴 10 个测试函数，统一使用表驱动模式：

```python
import pytest

@pytest.mark.parametrize("raw_input, expected_status, expected_fields", [
    ("valid_payload", 200, ["id", "sig"]),
    ("", 400, ["error_code"]),
    ("malformed_json{", 422, ["syntax_error"]),
], ids=["valid", "empty", "syntax_error"])
def test_payload_parser_matrix(raw_input, expected_status, expected_fields):
    result = parse_payload(raw_input)
    assert result.status == expected_status
    for field in expected_fields:
        assert field in result.data
```

---

## 3. 异常与错误契约断言（`pytest.raises`）

验证系统在异常输入下的防护行为时，必须严格断言**异常类型**与**结构化错误属性（如 `code`/`kind`）**，**[禁止] 严禁断言自然语言文案（Message Prose）**（除非该文案是公开声明的对外输出契约）：

```python
import pytest

def test_invalid_signature_raises():
    with pytest.raises(ValueError) as exc_info:
        verify_signature(bad_token="abc")
    assert exc_info.type is ValueError
    # 断言结构化契约字段，而非自然语言消息字符串
    assert getattr(exc_info.value, "code", None) == "ERR_INVALID_SIGNATURE"
```

---

## 4. [禁止] 严禁反模式：滥用 Monkeypatch 刺探私有状态

- **反模式**：使用 `monkeypatch.setattr(module, "_private_helper", mock_fn)` 强行替换内部私有函数并断言其调用次数。
- **危害**：将测试与实现代码的私有细节紧紧焊死，一旦重构或内联辅助函数，测试直接全崩。
- **正确做法**：面向公开契约进行测试；若需要替换外部网络/时间等副作用，通过依赖注入传入 Mock 适配器对象。
