// scripts/build-router-manifest.mjs
// Curated routing definitions; registry and local SKILL.md determine availability.
// 输出: config/router-manifest.json

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createOperationalEvent, emitEvent } from '../private/ming-skills-router/scripts/observability.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const MANIFEST_PATH = path.join(CONFIG_DIR, 'router-manifest.json');

// 领域桶初始静态特征契约 (正向 Triggers + 负向 Negatives + 默认配方)
const DOMAIN_DEFS = {
  testing: {
    description: "软件工程测试规范族 (11包: Oracle元规则, 绿场BDD/TDD, 棕场表征锁定, 性质变异, Rust/Py/JS/Go地道测试, CLI/爬虫场景, FFI契约)",
    skills: [
      "testing-core-oracle",
      "testing-workflow-spec",
      "testing-workflow-characterize",
      "testing-property-mutation",
      "testing-rust-idiom",
      "testing-python-idiom",
      "testing-js-idiom",
      "testing-go-idiom",
      "testing-scenario-cli",
      "testing-scenario-scraper",
      "testing-scenario-embed-ffi"
    ],
    triggers: [
      "测试", "单测", "覆盖率", "测试用例", "测试规范", "测试覆盖", "测试体系", "测试计划",
      "单元测试", "性质测试", "变异测试", "表征测试", "契约测试", "集成测试", "回归测试",
      "tdd", "bdd", "pytest", "cargo test", "miri", "vitest", "jest", "hypothesis",
      "proptest", "test framework", "golden test", "spec test", "unit test", "testing", "property-based", "mutation testing",
      // ── eval 挖出的缺门词：场景探测器词升格 + 常用短形补齐 ──
      "爬虫", "退出码", "行为快照", "锁定行为",
      "ffi", "pyo3", "v8", "isolate", "跨语言"
    ],
    // ── weakTriggers（replay 1755 条实测）：泛词单发即误派——采集 175:18、清洗 8:3、
    //    cli 6:0、命令行 3:0、oracle 3:0（overfire:agree）。弱词计入域正向/候选，
    //    单独命中降级 ask，不 dispatch。
    weakTriggers: ["采集", "清洗", "命令行", "cli", "oracle"],
    negatives: [
      "脱壳", "反编译", "ida pro", "gdb", "rop", "pwn", "hook_installed", "抓包", "绕过frida",
      "渗透测试", "安全测试", "pentest",
      // 物理设备/心理测量类"测试"的歧义否决（c-013/c-014 语料靶点）
      // 负词为掩码语义——必须盖住"测试"本体才中和，故用"测试+设备"复合词
      "性格测试", "网速测试", "麦克风测试", "测试麦克风", "测试一下麦克风", "测试一下摄像头", "测试一下网速"
    ],
    defaultRecipe: "spec-driven-greenfield"
  },
  reverse: {
    description: "逆向工程、协议分析、二进制与移动端安全分析 (APK/IDA/JS/Frida/Pwn/固件)",
    skills: [
      "reverse-skill-router", "apk-reverse", "ida-reverse", "radare2", "js-reverse",
      "mobile-reverse", "dotnet-reverse", "malware-analysis", "reverse-engineering",
      "protocol-reverse", "firmware-pentest", "ghidra-reverse", "pwn-chain",
      "patch-diff-exploit", "binary-diff", "go-rust-reverse", "macos-reverse",
      "antibot-fingerprint-paradigm"
    ],
    triggers: [
      "逆向", "反编译", "脱壳", "frida", "ida", "ghidra", "radare2", "jadx",
      "smali", "apk逆向", "jsvmp", "补环境", "混淆还原", "ast解混淆", "抓包分析",
      "协议分析", "私有协议", "签名算法", "sign算法", "so逆向", "rop", "pwn", "固件提取",
      "指纹", "ja3", "ja4", "风控", "反爬", "指纹浏览器", "webdriver检测", "tls指纹",
      "headless检测", "bot detection", "fingerprint", "渗透测试", "安全测试", "pentest", "penetration",
      // ── eval 挖出的缺门词：常用短形与场景词补齐 ──
      "渗透", "反汇编", "反混淆", "栈溢出", "利用链", "安装包", "二进制分析", "抓包",
      "wasm"
    ],
    // ── weakTriggers：小程序 13:4 overfire 偏斜（泛词，可能是任何小工具）──
    weakTriggers: ["小程序"],
    negatives: [
      "单元测试", "测试覆盖", "pytest", "cargo test", "tdd", "bdd", "覆盖设计",
      "性质测试", "变异测试", "测试规范", "测试体系", "ui设计", "前端布局"
    ],
    defaultRecipe: "reverse-general"
  },
  ui: {
    description: "全局 UI/UX 设计范式知识库与前端交互模式",
    skills: ["ui-design-paradigms"],
    triggers: [
      "ui", "ux", "设计范式", "前端设计", "交互设计", "响应式布局", "组件库",
      "界面风格", "tailwind", "shadcn", "design tokens", "视觉规范", "色彩体系",
      // ── eval 挖出的缺门词：常用短形补齐（"布局"泛词不升——会抢"项目布局"） ──
      "响应式", "配色", "交互规范", "布局规范"
    ],
    // ── weakTriggers：裸 "ui" 4:0 全误派（任何界面话题都沾边）──
    weakTriggers: ["ui"],
    negatives: [
      "脱壳", "反编译", "ida", "frida", "漏洞利用", "rop", "pwn", "so逆向"
    ],
    defaultRecipe: "ui-design-standard"
  },
  protocol: {
    description: "私有协议与自动化 UI Oracle 逆向方案",
    skills: ["ui-oracle-protocol", "xfqtrace-kit"],
    triggers: [
      "ui-oracle", "timestamper", "xfqtrace", "流量窗口切片", "重放判官", "无痕hook",
      "appium", "操作到请求", "操作→请求", "请求映射", "生成时机", "参数生成时机",
      "点击触发", "ui自动化", "重放对比", "窗口切片", "操作验证",
      "什么时候生成", "何时生成",
      // ── eval 挖出的缺门词：操作→请求的自然说法补齐（"按钮"泛词不升——会抢样式问题） ──
      "哪些请求", "什么请求", "发出的请求", "点击会", "生成哪些参数", "哪个操作", "操作生成"
    ],
    negatives: [
      "单元测试规范", "覆盖设计"
    ],
    defaultRecipe: "ui-oracle-trace"
  },
  engineering: {
    description: "软件工程质量属性与元规范族 (文档四体裁, 视觉排版动线, 质量门禁, 宽结构化事件, 安全供应链, 数据演进契约, B级质量Overlay)",
    skills: [
      "docs-core-paradigm",
      "docs-presentation-idiom",
      "obs-core-paradigm",
      "sec-core-paradigm",
      "contract-core-paradigm",
      "config-core-paradigm",
      "overlay-core-paradigm",
      "arch-core-paradigm",
      "vendor-paradigm",
      "review-core-paradigm",
      "explore-core-paradigm",
      "depth-core-paradigm",
      "mutation-safety-paradigm",
      "classify-core-paradigm",
      "ming-l-paradigm",
      "ming-skill-forge",
      "ming-experience-direction",
      "ming-distiller",
      "ming-boundary"
    ],
    triggers: [
      "文档体系", "仓库文档", "readme",
      "文档体裁", "diataxis", "adr", "docs-as-code", "架构决策记录",
      "文档排版", "readme排版", "去emoji", "去疲劳", "动线", "docs-presentation",
      "可观测", "observability", "structured logging", "wide events", "宽事件", "相关id",
      "安全元规则", "ast10", "agentic-skills", "supply-chain", "最小权限",
      "数据契约", "schema-evolution", "tolerant-reader", "data-contract", "字段演进",
      "配置归一化", "环境变量", "特性开关", "feature flag", "i18n", "config",
      "性能", "隐私", "韧性", "上下文成本", "可移植", "overlay",
      "规范体系", "项目分层", "治理文档", "候审档", "ming-l",
      "新技能", "写技能", "技能包", "skill包", "skill authoring", "frontmatter",
      "体验导演", "叙事设计", "产品体验设计", "scrollytelling", "电影感网页", "沉浸式体验", "设计宪法", "storyboard",
      "沉淀", "蒸馏", "复盘", "distill", "retrospective", "经验回收", "查沉淀", "项目复盘",
      // ── skillTriggers 升格词：专属无歧义词也当域门，裸词即可开门 ──
      // （工程域在 find 顺序最末，升词纯增益；语言名/泛词不升——裸词意图模糊留 handoff）
      "六边形架构", "hexagonal", "ports and adapters", "端口适配器", "依赖倒置",
      "clean architecture", "洋葱架构", "架构边界", "ffi边界", "strangler",
      "排版", "logging", "telemetry", "security", "供应链", "supply-chain",
      "schemaVersion", "env vars", "precedence", "performance", "privacy",
      "设计域", "skill-creator", "渐进披露", "immersive", "媒介映射", "design pipeline", "设计门禁",
      "ffi", "pyo3", "v8", "v8-isolate", "isolate", "跨语言",
      // ── eval 挖出的缺门词：各元规范常用短形补齐 ──
      "埋点", "告警", "调用链", "排障", "schema", "向后兼容", "兼容性",
      "依赖边界", "模块边界", "规范归属", "电影感", "滚动叙事", "叙事页", "沉浸", "哪个域",
      // ── review 域门：消融/评审裸词意图明确可开门 ──
      "消融", "ablation", "过度设计", "over-engineering", "评审", "独立评审", "简化审查",
      // ── explore/depth 域门：发散/深度裁决裸词意图明确可开门 ──
      "发散", "brainstorm", "diverge", "verbalized sampling", "设计空间",
      "diverse", "alternatives",
      "根因", "深挖", "多深", "iceberg", "root cause", "5 whys", "层级归因",
      // ── vendor 域门：物化/vendoring 裸词意图明确可开门 ──
      "vendoring", "物化", "materialization", "lockfile", "第三方依赖", "gitlink", "孤本",
      // ── mutation-safety/classify 域门：专属无歧义词可开门（预览/分类是泛词不升） ──
      "dry-run", "whatif", "变更安全", "mutation safety", "幂等", "taxonomy", "枚举设计"
    ],
    // ── weakTriggers（replay 实测）：文档 49:11、日志 8:0、配置 8:0、安全 4:1、
    //    ci 7:0——泛词裸命中全误派（查日志/编辑器配置/整理文档/CI 随口一提都被派工）。
    //    单独命中降级 ask；与强词同现仍照常计分派工。
    weakTriggers: ["文档", "日志", "配置", "安全", "ci"],
    qualityGateTriggers: [
      "质量门禁", "门禁", "git hooks", "pre-commit", "pre-push", "ci/cd", "runner",
      "影响面", "affected", "sbom", "sca", "freshness", "制品门禁"
    ],
    negatives: [
      "脱壳", "反编译", "ida pro", "gdb", "rop", "pwn"
    ],
    defaultRecipe: "engineering-meta-catalog",
    skillTriggers: {
      "docs-core-paradigm": ["文档", "diataxis", "adr", "docs-as-code"],
      "docs-presentation-idiom": ["排版", "readme", "动线"],
      "obs-core-paradigm": ["日志", "可观测", "observability", "logging", "telemetry", "宽事件", "相关id"],
      "sec-core-paradigm": ["安全", "security", "供应链", "supply-chain", "最小权限", "ast10"],
      "contract-core-paradigm": ["数据契约", "字段演进", "schema-evolution", "schemaVersion", "tolerant-reader", "data-contract"],
      "config-core-paradigm": ["配置", "配置归一化", "环境变量", "env vars", "特性开关", "feature flag", "i18n", "config", "precedence"],
      "overlay-core-paradigm": ["性能", "performance", "隐私", "privacy", "韧性", "可移植", "上下文成本", "overlay"],
      "arch-core-paradigm": ["六边形架构", "hexagonal", "ports and adapters", "端口适配器", "依赖倒置", "clean architecture", "洋葱架构", "架构边界", "ffi边界", "strangler"],
      "vendor-paradigm": ["vendor", "vendoring", "物化", "materialization", "lockfile", "第三方依赖", "依赖入库", "third_party", "gitlink", "submodule", "孤本", "orphan", "sourceGone"],
      "review-core-paradigm": ["消融", "ablation", "过度设计", "over-engineering", "简化审查", "精简代码", "删减抽象", "yagni", "评审", "独立评审", "fresh context", "critic"],
      "explore-core-paradigm": ["发散", "探索", "brainstorm", "diverge", "verbalized sampling", "设计空间", "alternatives", "diverse", "形态学", "premortem", "tree of thoughts"],
      "depth-core-paradigm": ["根因", "深挖", "下潜", "冰山", "iceberg", "root cause", "5 whys", "多深", "层级归因", "临界", "分界"],
      "mutation-safety-paradigm": ["dry-run", "whatif", "预览", "变更安全", "mutation safety", "idempotent", "幂等", "confirm", "回滚", "plan artifact", "shouldprocess", "check_mode"],
      "classify-core-paradigm": ["分类", "taxonomy", "枚举设计", "分面", "facet", "mece", "命名空间", "前缀冲突", "分类体系", "enum", "状态机", "kind 字段", "词表"],
      "ming-l-paradigm": ["项目分层", "规范体系", "治理文档", "候审档", "ming-l", "domain", "设计域"],
      "ming-skill-forge": ["新技能", "写技能", "技能包", "skill包", "skill authoring", "skill-creator", "frontmatter", "渐进披露"],
      "ming-experience-direction": ["体验导演", "叙事设计", "产品体验设计", "scrollytelling", "电影感网页", "沉浸式体验", "immersive", "设计宪法", "storyboard", "设计门禁", "媒介映射", "design pipeline"],
      "testing-scenario-embed-ffi": ["v8", "v8-isolate", "pyo3", "ffi", "跨语言", "嵌入", "isolate"],
      "testing-rust-idiom": ["rust", "rustc", "cargo", "miri", "proptest"],
      "testing-python-idiom": ["python", "pytest", "pyo3", "hypothesis"],
      "testing-js-idiom": ["javascript", "typescript", "node.js", "event loop", "页面事件"],
      "ming-distiller": ["沉淀", "蒸馏", "distill", "复盘", "retrospective", "经验回收", "查沉淀", "项目复盘"],
      "ming-boundary": ["项目图", "project graph", "事实提取", "fact extraction", "边界契约", "boundary contract", "依赖审计", "孤儿符号", "orphan detection", "断链检测", "dead link", "boundaries.yaml", "应然边", "接缝核验"]
    }
  }
};

// 预定义标准装配配方 (Recipes)
const RECIPES = {
  "testing-review": {
    domain: "testing",
    description: "Read-only testing review; load language, scene and quality references as needed",
    skills: ["testing-core-oracle"]
  },
  "ui-oracle-trace": {
    domain: "protocol",
    description: "Protocol evidence references; execution requires a separate scope decision",
    skills: ["ui-oracle-protocol", "xfqtrace-kit"]
  },
  "engineering-meta-catalog": {
    domain: "engineering",
    description: "软件工程元规范综合装配 (文档内容+表现 + 可观测 + 安全 + 契约 + B级质量Overlay)",
    skills: [
      "docs-core-paradigm",
      "docs-presentation-idiom",
      "obs-core-paradigm",
      "sec-core-paradigm",
      "contract-core-paradigm",
      "config-core-paradigm",
      "overlay-core-paradigm"
    ]
  },
  "quality-gate-governance": {
    domain: "engineering",
    description: "质量门禁治理配方 (测试 Oracle + CLI Runner + 制品契约 + 失败事件 + 供应链与质量 Overlay)",
    skills: [
      "testing-core-oracle",
      "testing-scenario-cli",
      "contract-core-paradigm",
      "obs-core-paradigm",
      "sec-core-paradigm",
      "overlay-core-paradigm"
    ]
  },
  "runtime-ffi-quality-gate": {
    domain: "engineering",
    description: "V8/PyO3/FFI runtime quality gates with the standard governance baseline",
    skills: [
      "testing-core-oracle",
      "testing-scenario-cli",
      "testing-scenario-embed-ffi",
      "contract-core-paradigm",
      "obs-core-paradigm",
      "sec-core-paradigm",
      "overlay-core-paradigm"
    ]
  },
  "testing-overview-catalog": {
    domain: "testing",
    description: "测试规范族全局盘点与覆盖设计配方 (Oracle + 双Workflow + 性质变异)",
    skills: ["testing-core-oracle", "testing-workflow-spec", "testing-workflow-characterize", "testing-property-mutation"]
  },
  "spec-driven-greenfield": {
    domain: "testing",
    description: "绿场规格驱动开发标准配方 (Oracle + Spec驱动 + 语言地道测试)",
    skills: ["testing-core-oracle", "testing-workflow-spec"]
  },
  "cli-tool-spec": {
    domain: "testing",
    description: "CLI 命令行工具链与运维脚本规范测试配方 (Oracle + CLI场景 + Spec驱动)",
    skills: ["testing-core-oracle", "testing-scenario-cli", "testing-workflow-spec"]
  },
  "characterization-brownfield": {
    domain: "testing",
    description: "棕场遗留系统表征锁定配方 (Oracle + 表征测试 + 语言地道测试)",
    skills: ["testing-core-oracle", "testing-workflow-characterize"]
  },
  "cli-tool-characterize": {
    domain: "testing",
    description: "CLI characterization with language selected from task evidence",
    skills: ["testing-core-oracle", "testing-scenario-cli", "testing-workflow-characterize"]
  },
  "embed-ffi-greenfield": {
    domain: "testing",
    description: "嵌入式与跨语言 FFI 契约测试配方 (Rust+V8+PyO3+JS补丁)",
    skills: ["testing-core-oracle", "testing-scenario-embed-ffi", "testing-workflow-spec"]
  },
  "scraper-pipeline": {
    domain: "testing",
    description: "数据采集与管道清洗离线测试配方",
    skills: ["testing-core-oracle", "testing-scenario-scraper", "testing-workflow-spec"]
  },
  "reverse-general": {
    domain: "reverse",
    description: "逆向工程标准分流 (交给 reverse 领域子路由)",
    skills: ["reverse-skill-router"]
  },
  "ui-design-standard": {
    domain: "ui",
    description: "UI/UX 设计范式标准配方",
    skills: ["ui-design-paradigms"]
  }
};

function parseSkillFrontmatter(text) {
  const source = text.replace(/^\uFEFF/, '');
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name = frontmatter?.[1].match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1];
  let description = frontmatter?.[1].match(/^description:[\t ]*([^\r\n]*)/m)?.[1].trim() || '';
  if (/^[>|]/.test(description)) {
    description = frontmatter[1].match(/^description:[^\r\n]*\r?\n((?:[\t ]+[^\r\n]*(?:\r?\n|$))+)/m)?.[1].trim() || '';
  } else {
    description = description.replace(/^(["'])(.*)\1$/, '$2').trim();
  }
  return { name, description };
}

// 作者期校验：DOMAIN_DEFS/RECIPES 是策展常量表——内部引用错名应在构建时失败，
// 而非让消费侧路由时以 invalid_recipe_definition 全灭或静默生成死触发器。
export function validateRouterDefs(defs = DOMAIN_DEFS, recipes = RECIPES) {
  const routable = new Set(Object.values(defs).flatMap(info => info.skills));
  for (const [domain, info] of Object.entries(defs)) {
    for (const skill of Object.keys(info.skillTriggers || {})) {
      if (!routable.has(skill)) throw new Error(`orphan_skill_trigger: ${domain}/${skill}`);
    }
  }
  for (const [name, recipe] of Object.entries(recipes)) {
    if (!defs[recipe.domain]) throw new Error(`unknown_recipe_domain: ${name}`);
    for (const skill of recipe.skills) {
      if (!routable.has(skill)) throw new Error(`orphan_recipe_skill: ${name}/${skill}`);
    }
  }
}

export function buildRouterManifest({ repoRoot = ROOT_DIR, registry, write = false, generatedAt = new Date().toISOString() } = {}) {
  validateRouterDefs();
  registry ??= JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File',
    path.join(ROOT_DIR, 'scripts/read-registry.ps1'), '-RegistryPath', path.join(repoRoot, 'registry.yaml')],
  // 30s→120s：pwsh 冷启动+大 registry YAML 解析在负载/AV 扫描下实测 ETIMEDOUT flake
  { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }).replace(/^\uFEFF/, ''));
  const units = new Map();
  for (const base of registry.base || []) {
    for (const [name, clients] of Object.entries(base.modules || {})) {
      units.set(name, { path: `${base.path}/skills/${name}`, enabled: base.enabled === true && clients.length > 0 });
    }
  }
  for (const section of ['vertical', 'deployable', 'private']) {
    for (const item of registry[section] || []) {
      if (section === 'vertical' && !Object.values(item.deploy || {}).some(Boolean)) continue;
      if (units.has(item.name)) throw new Error(`duplicate_skill: ${item.name}`);
      units.set(item.name, { path: item.path, enabled: item.enabled === true && Object.values(item.deploy || {}).some(value => value === true) });
    }
  }
  const availability = {};
  const skillMeta = new Map();
  for (const name of [...new Set(Object.values(DOMAIN_DEFS).flatMap(info => info.skills))].sort()) {
    const unit = units.get(name);
    if (!unit) { availability[name] = 'unregistered'; continue; }
    if (!unit.enabled) { availability[name] = 'disabled'; continue; }
    const source = path.resolve(repoRoot, unit.path, 'SKILL.md');
    const relative = path.relative(path.resolve(repoRoot), source);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`invalid_skill_path: ${name}`);
    if (!fs.existsSync(source)) { availability[name] = 'missing'; continue; }
    const meta = parseSkillFrontmatter(fs.readFileSync(source, 'utf8'));
    skillMeta.set(name, meta);
    availability[name] = meta.name === name && meta.description ? 'ready' : 'invalid';
  }
  // S3 词法层文档：name + description + skillTriggers 三合（ADR-0007）
  // description 复用 availability 检查期的 frontmatter 提取结果——单读缓存保一致性
  const skillTriggerMap = {};
  for (const info of Object.values(DOMAIN_DEFS)) {
    for (const [skill, terms] of Object.entries(info.skillTriggers || {})) {
      skillTriggerMap[skill] = terms;
    }
  }
  const skillDocs = {};
  for (const [name, state] of Object.entries(availability)) {
    if (state !== 'ready') continue;
    skillDocs[name] = { name, description: skillMeta.get(name).description, triggers: skillTriggerMap[name] || [] };
  }
  const manifest = {
    version: '2.0.0', generatedAt,
    domains: structuredClone(DOMAIN_DEFS), recipes: structuredClone(RECIPES), availability,
    skillDocs
  };
  if (write) {
    for (const relative of ['config/router-manifest.json', 'private/ming-skills-router/config/router-manifest.json']) {
      const output = path.join(repoRoot, relative);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      const temporary = `${output}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        fs.renameSync(temporary, output);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const startedAt = process.hrtime.bigint();
  const emit = (spec) => {
    try { emitEvent(createOperationalEvent({ ...spec, duration: Number(process.hrtime.bigint() - startedAt) / 1e6 })); } catch { /* optional diagnostics must not change the build result */ }
  };
  try {
    const check = process.argv[2] === '--check';
    if (process.argv.length > 3 || (process.argv[2] && !check)) throw new Error('usage: build-router-manifest.mjs [--check]');
    const manifest = buildRouterManifest({ write: !check });
    if (check) {
      for (const file of [MANIFEST_PATH, path.join(ROOT_DIR, 'private/ming-skills-router/config/router-manifest.json')]) {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (JSON.stringify({ ...existing, generatedAt: null }) !== JSON.stringify({ ...manifest, generatedAt: null })) {
          throw new Error(`stale_manifest: ${path.relative(ROOT_DIR, file)}`);
        }
      }
    }
    emit({
      event: 'manifest.built',
      fields: {
        domains_count: Object.keys(manifest.domains).length,
        recipes_count: Object.keys(manifest.recipes).length,
        ready_skill_count: Object.values(manifest.availability).filter(value => value === 'ready').length,
        output_path: check ? null : 'config/router-manifest.json',
        check_only: check
      }
    });
    console.log(check ? 'manifest_checked' : 'manifest_built');
  } catch (error) {
    emit({ event: 'manifest.failed', ok: false, errorCode: 'manifest_failed', fields: { error_type: error?.constructor?.name } });
    console.error(error.message);
    process.exitCode = 1;
  }
}
