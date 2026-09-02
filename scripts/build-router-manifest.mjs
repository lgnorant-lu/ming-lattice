// scripts/build-router-manifest.mjs
// 编译机读路由清单 (RouterManifest): 从 registry.yaml 与技能元数据中提取领域桶、Triggers、Negatives 与 Recipes
// 输出: config/router-manifest.json

import fs from 'node:fs';
import path from 'node:path';

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
      "proptest", "test framework", "oracle", "golden test", "spec test"
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
      "patch-diff-exploit", "binary-diff", "go-rust-reverse", "macos-reverse"
    ],
    triggers: [
      "逆向", "反编译", "脱壳", "frida", "hook", "ida", "ghidra", "radare2", "jadx",
      "smali", "apk逆向", "jsvmp", "补环境", "混淆还原", "ast解混淆", "抓包分析",
      "协议分析", "私有协议", "签名算法", "sign算法", "so逆向", "rop", "pwn", "固件提取"
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
      "ui-oracle", "timestamper", "xfqtrace", "流量窗口切片", "重放判官", "无痕hook"
    ],
    negatives: [
      "单元测试规范", "覆盖设计"
    ],
    defaultRecipe: "ui-oracle-trace"
  }
};

// 预定义标准装配配方 (Recipes)
const RECIPES = {
  "spec-driven-greenfield": {
    domain: "testing",
    description: "绿场规格驱动开发标准配方 (Oracle + Spec驱动 + 语言地道测试)",
    skills: ["testing-core-oracle", "testing-workflow-spec"]
  },
  "characterization-brownfield": {
    domain: "testing",
    description: "棕场遗留系统表征锁定配方 (Oracle + 表征测试 + 语言地道测试)",
    skills: ["testing-core-oracle", "testing-workflow-characterize"]
  },
  "embed-ffi-greenfield": {
    domain: "testing",
    description: "嵌入式与跨语言 FFI 契约测试配方 (Rust+V8+PyO3+JS补丁)",
    skills: ["testing-core-oracle", "testing-scenario-embed-ffi", "testing-rust-idiom"]
  },
  "scraper-pipeline": {
    domain: "testing",
    description: "数据采集与管道清洗离线测试配方",
    skills: ["testing-core-oracle", "testing-scenario-scraper", "testing-python-idiom"]
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

export function buildRouterManifest() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const manifest = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    domains: DOMAIN_DEFS,
    recipes: RECIPES
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[build-router-manifest] 成功生成机读清单: ${path.relative(ROOT_DIR, MANIFEST_PATH)}`);
  return manifest;
}

// CLI 执行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'))) {
  buildRouterManifest();
}
