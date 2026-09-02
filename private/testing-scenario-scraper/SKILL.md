---
name: testing-scenario-scraper
description: 采集爬虫与数据清洗管道场景测试规范（Testing Scenario Scraper & Pipelines）：严格区分「本地解析逻辑错误」与「外部源站页面改版」。定义离线 Fixture 解析优先原则、字段结构契约（必填项、单调性、价格范围）、选择器健康度监控、模拟重试限流退避，以及将活网连通性作为非阻塞探针的约束。触发词：scraper-testing, crawler-test, pipeline-testing, selector-health, fixture-parsing, data-cleaning-test.
---

# Testing Scenario: Scraper & Pipeline — 采集爬虫与数据清洗管道测试规范

> **核心哲学**：外部网络世界是不可信且时刻变动的。
> 测试体系必须严格区分**「我的解析逻辑写错了」**与**「外部源站页面结构改版了」**。日常自动化测试必须 100% 离线化运行，严禁在 CI 中依赖活网请求。

---

## 1. 分层精力分配启发式（Effort Heuristics）

| 层次 | 推荐精力占比 | 核心验证方式 | 说明 |
|---|---|---|---|
| **离线解析与数据清洗 (Offline Parse)** | **~90%** | 基于离线 HTML/JSON Fixtures 的表驱动测试 | 覆盖变体排版、脏数据、缺失字段 |
| **活网探针与健康监控 (Live Probe)** | **~10%** | 独立网络探针（标记为 ignore/probe，不阻断 CI） | 仅监控源站存活与改版，不作单元测试 |

---

## 2. Oracle 判定来源与字段契约

1. **冻结的真实样本（Frozen Fixtures）**：
   - 在 `testdata/fixtures/` 下存放捕获于真实源站的 HTML/JSON 样本（并记录采集时间）；
   - 至少包含 2 种样本：标准完整用例 + 包含大量缺失可选字段/空空白字符的畸形用例。
2. **领域不变量契约（Domain Invariants）**：
   - 必填字段存在性（如 `title` 不为空）；
   - 数值与时间单调性（时间戳相对 fixture 采集时间单调递增或通过注入的时钟判定，避免硬绑定宿主机当前墙钟；价格必须 >= 0；商品库存整数非负）；
   - 跨数据源一致性（当同时采集两个镜像源时，核心键值映射一致）。
3. **选择器健康度（Selector Health Signal）**：
   - 当某个可选字段在解析中出现连续大面积空值（如从 3% 缺失飙升至 90% 缺失）时，测试断言应明确抛出「源站可能发生 A/B 测试或结构改版」警告，而非报普通未捕获空指针。

---

## 3. 管道逻辑测试（Pipeline & Policy Logic）

- **重试与退避逻辑（Retry & Backoff）**：通过注入 Mock HTTP 客户端（返回 429 Too Many Requests / 503 Service Unavailable）和虚拟时钟，验证退避倍率算法与最大重试次数，**[禁止] 严禁在测试中使用真实 `time.Sleep`**；
- **幂等入库（Idempotent Storage）**：验证同一批抓取数据被重复喂入清洗管道时，数据库或文件存储不会产生重复记录或自增 ID 爆炸。

---

## 4. [禁止] 严禁反模式

- **[禁止] 严禁**在 `cargo test` / `pytest` / `go test` 的默认内循环中向真实外网发起 HTTP 请求；
- **[禁止] 严禁**将「HTTP 返回 200」等同于「数据抓取与解析成功」；
- **[禁止] 严禁**无脑 snapshot 整个外网主页作为 Golden（外网的动态广告与推荐流会导致测试天天报红）。
