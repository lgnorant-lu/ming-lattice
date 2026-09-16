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
      "proptest", "test framework", "oracle", "golden test", "spec test", "unit test", "testing", "property-based", "mutation testing"
    ],
    negatives: [
      "脱壳", "反编译", "ida pro", "gdb", "rop", "pwn", "hook_installed", "抓包", "绕过frida"
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
      "headless检测", "bot detection", "fingerprint"
    ],
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
      "界面风格", "tailwind", "shadcn", "design tokens", "视觉规范", "色彩体系"
    ],
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
      "什么时候生成", "何时生成"
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
      "overlay-core-paradigm",
      "arch-core-paradigm"
    ],
    triggers: [
      "文档", "文档体系", "仓库文档", "readme",
      "文档体裁", "diataxis", "adr", "docs-as-code", "架构决策记录",
      "文档排版", "readme排版", "去emoji", "去疲劳", "动线", "docs-presentation",
      "可观测", "日志", "observability", "structured logging", "wide events", "宽事件", "相关id",
      "安全元规则", "ast10", "agentic-skills", "supply-chain", "最小权限",
      "数据契约", "schema-evolution", "tolerant-reader", "data-contract", "字段演进",
      "性能", "安全", "隐私", "韧性", "上下文成本", "可移植", "overlay"
    ],
    qualityGateTriggers: [
      "质量门禁", "门禁", "git hooks", "pre-commit", "pre-push", "ci", "ci/cd", "runner",
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
      "overlay-core-paradigm": ["性能", "performance", "隐私", "privacy", "韧性", "可移植", "上下文成本", "overlay"],
      "arch-core-paradigm": ["六边形架构", "hexagonal", "ports and adapters", "端口适配器", "依赖倒置", "clean architecture", "洋葱架构", "架构边界", "ffi边界", "strangler"],
      "testing-scenario-embed-ffi": ["v8", "v8-isolate", "pyo3", "ffi", "跨语言", "嵌入", "isolate"],
      "testing-rust-idiom": ["rust", "rustc", "cargo", "miri", "proptest"],
      "testing-python-idiom": ["python", "pytest", "pyo3", "hypothesis"],
      "testing-js-idiom": ["javascript", "typescript", "node.js", "event loop", "页面事件"]
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

export function buildRouterManifest({ repoRoot = ROOT_DIR, registry, write = false, generatedAt = new Date().toISOString() } = {}) {
  registry ??= JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File',
    path.join(ROOT_DIR, 'scripts/read-registry.ps1'), '-RegistryPath', path.join(repoRoot, 'registry.yaml')],
  { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
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
  for (const name of [...new Set(Object.values(DOMAIN_DEFS).flatMap(info => info.skills))].sort()) {
    const unit = units.get(name);
    if (!unit) { availability[name] = 'unregistered'; continue; }
    if (!unit.enabled) { availability[name] = 'disabled'; continue; }
    const source = path.resolve(repoRoot, unit.path, 'SKILL.md');
    const relative = path.relative(path.resolve(repoRoot), source);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`invalid_skill_path: ${name}`);
    if (!fs.existsSync(source)) { availability[name] = 'missing'; continue; }
    const text = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const actualName = frontmatter?.[1].match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1];
    let description = frontmatter?.[1].match(/^description:[\t ]*([^\r\n]*)/m)?.[1].trim() || '';
    if (/^[>|]/.test(description)) {
      description = frontmatter[1].match(/^description:[^\r\n]*\r?\n((?:[\t ]+[^\r\n]*(?:\r?\n|$))+)/m)?.[1].trim() || '';
    } else {
      description = description.replace(/^(["'])(.*)\1$/, '$2').trim();
    }
    availability[name] = actualName === name && description ? 'ready' : 'invalid';
  }
  const manifest = {
    version: '2.0.0', generatedAt,
    domains: structuredClone(DOMAIN_DEFS), recipes: structuredClone(RECIPES), availability
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
