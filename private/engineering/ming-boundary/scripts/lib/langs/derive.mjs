// lib/langs/derive.mjs — 上游金数据派生纯函数核（零网络零子进程，可单测）
// sync-langs.mjs 的 CLI 壳只负责取数与写盘；解析/派生/一致性校验全在这。
// 离线不变量：derived.provenance.rev 必须等于 upstream.yaml 里该语言 pin——
// 防"pin 升了没重生成"或"derived 被手改"两类账实不符。

// ---------- tags.scm S-expr 解析（够用即停：抽捕获归属+name 字段路径） ----------
// 产出 [{capture:'definition.class', kind, inside:[kinds], nameKind, names}]。
// 捕获标签挂在紧邻其前的节点上；inside=该节点的祖先 kind 链（外→内）。
// names=[{path:[f1,f2,..],kind}]——@name 子节点相对捕获节点的字段链
//   （field: 前缀归位：left: (identifier) → path ['left']）。此前只记
//   nameKind 丢字段约束——python assignment left:(identifier) 被丢、
//   obj.attr= 产假 decl（django 实证）；rust const/static 词表同源。
export function parseTags(scm) {
  const toks = scm.match(/\(|\)|@?[^\s()]+|"[^"]*"/g) || [];
  const out = [];
  const stack = []; // 每层 {kind, field, pendingField, nameKind, lastChild, names}
  let pending = null; // 上一个闭合项（捕获标签的宿主）
  for (const tk of toks) {
    if (tk === '(') {
      const parent = stack[stack.length - 1];
      stack.push({ kind: null, nameKind: null, names: [],
        field: parent?.pendingField || null, pendingField: null });
      if (parent) parent.pendingField = null;
      pending = null;
    } else if (tk === ')') {
      const f = stack.pop();
      if (f?.kind?.startsWith('#')) {       // 谓词帧惰性：不并 names、
        pending = null; continue;          //   不占 lastChild、不顶 pending
      }
      // 闭帧时把帧上已记的 nameKind 一并带出去（@name 可能打在子节点）
      const childName = f?.lastChild?.nameKind;
      pending = f ? { kind: f.kind, nameKind: f.nameKind || childName,
        inside: stack.map((s) => s.kind).filter(Boolean),
        field: f.field, names: f.names } : null;
      if (stack.length) {
        const top = stack[stack.length - 1];
        top.lastChild = pending;
        // 真子节点 kind 全列——[...] 交替组捕获须展开到各候选 kind
        //   （js upstream [(class)(class_declaration)] @definition.class）
        if (pending?.kind) (top.childKinds ??= []).push(pending.kind);
        // 子帧 names 加本帧 field 前缀并入父帧——深嵌名路径逐跳上浮
        //   （call function:(attribute attribute:(identifier)@name)
        //   → attribute 帧收 ['attribute']，闭帧并给 call 成
        //   ['function','attribute']）；交替组内按子 kind 分桶归 names——
        //   展开时各候选只带自己的名路径，不互相借
        for (const n of pending.names || []) {
          const pref = { path: [pending.field, ...n.path], kind: n.kind };
          top.names.push(pref);
          if (top.kind === '[' && pending?.kind)
            ((top.byKind ??= new Map()).get(pending.kind)
              ?? top.byKind.set(pending.kind, []).get(pending.kind))
              .push(pref);
        }
      }
    } else if (tk.startsWith('@')) {
      const cap = tk.slice(1);
      // @name 记到**外围帧**上（name: (identifier) @name 的宿主是子节点，
      // 但 name 字段属于外层 decl 节点）；谓词帧内的 @name 参数不记
      const top = stack[stack.length - 1];
      const host = pending || (top && top.lastChild);
      if (cap === 'name') {
        if (top && host && !top.kind?.startsWith('#')) {
          top.nameKind = host.kind;
          top.names.push({ path: [host.field || '?'], kind: host.kind });
        }
        continue;
      }
      if (!/^(definition|reference)\./.test(cap) || !host) continue;
      // 谓词帧/锚点原子宿主不产捕获（#select-adjacent!/@doc/. 伪件实证）
      if (!host.kind || host.kind.startsWith('#') || /^[*+?.]$/.test(host.kind)
        || host.inside == null) continue;
      // 交替伪帧宿主 → 展开到各候选 kind（[a b] @def 属组非单点）；
      //   各候选只带自己桶内的名路径（byKind），组共享 names 不互借
      const hosts = host.kind === '['
        ? (host.childKinds || []).map((k) => ({ kind: k, inside: host.inside,
            nameKind: host.nameKind, names: host.byKind?.get(k) || [] }))
        : [host];
      for (const h of hosts) {
        out.push({ capture: cap, kind: h.kind, inside: h.inside,
          nameKind: h.nameKind,
          // 交替伪帧会在路径里留 null 洞——滤掉（'?'=字段名不可得标记）
          names: (h.names || [])
            .map((n) => ({ path: n.path.filter((p) => p && p !== '?'),
              kind: n.kind }))
            .filter((n) => n.path.length) });
      }
      pending = host;
    } else {
      // 原子项：位置0=kind；field: 前缀不影响 kind 但要记——
      //   下一节点帧的 field 归属（left:/name:/function:）
      const top = stack[stack.length - 1];
      if (tk === '[') {
        // 交替组伪帧：field: 挂的是整组（function: [(id) @name (attr @name)]），
        // 不能被首子节点独吞——伪帧持有，组内全子节点共享，']' 归并时前缀
        stack.push({ kind: '[', nameKind: null, names: [],
          field: top?.pendingField || null, pendingField: null });
        if (top) top.pendingField = null;
        continue;
      }
      if (tk === ']') {
        const f = stack.pop();
        // 伪帧闭合成 pending——后续捕获宿主为 '[' 时展开到 childKinds；
        //   同时 names 带伪帧 field 前缀并入父帧（捕获落父级的路径）
        pending = f ? { kind: '[', inside: stack.map((s) => s.kind)
            .filter(Boolean), childKinds: f.childKinds || [],
            // 桶内/聚合 names 均补伪帧 field 首跳（function:[...] 情形）
            byKind: f.byKind ? new Map([...f.byKind].map(([k, arr]) =>
              [k, arr.map((n) => ({ path: [f.field, ...n.path],
                kind: n.kind }))])) : undefined,
            names: (f.names || []).map((n) => ({ path: [f.field, ...n.path],
              kind: n.kind })) }
          : null;
        if (stack.length) {
          const par = stack[stack.length - 1];
          par.lastChild = pending;
          for (const n of f?.names || [])
            par.names.push({ path: [f.field, ...n.path], kind: n.kind });
          // 伪帧本身不算真子 kind（childKinds 不录 '['）
        }
        continue;
      }
      if (tk.endsWith(':') && top) { top.pendingField = tk.slice(0, -1); continue; }
      // 量词/锚点原子（* + ? .）非节点——不占 kind/lastChild/pending
      if (/^[*+?.]$/.test(tk)) continue;
      const fld = top?.pendingField || null;
      if (top) top.pendingField = null;
      if (top && top.kind === null && !tk.startsWith('"'))
        top.kind = tk;
      if (top && top.kind !== null)
        top.lastChild = { kind: tk, inside: null, field: fld };
      else pending = { kind: tk, inside: null, field: fld };
    }
  }
  return out;
}

// ---------- linguist languages.yml → exts ----------
// 只解析钉的语言块：languages.yml 结构浅——LangName: 块内 extensions: 列表
export function linguistExts(yml, langKey) {
  const lines = yml.split('\n');
  let inLang = false, inExts = false;
  const exts = [];
  for (const l of lines) {
    if (/^\S/.test(l)) {                    // 顶层键行
      inLang = l.replace(/["']/g, '').startsWith(langKey + ':');
      inExts = false;
      continue;
    }
    if (!inLang) continue;
    if (/^\s+extensions:/.test(l)) { inExts = true; continue; }
    if (/^\s+\S[^:]*:/.test(l)) { inExts = false; continue; }
    if (inExts) {
      const m = l.match(/^\s+-\s+['"]?(\.[\w.]+)/);
      if (m) exts.push(m[1]);
      else inExts = false;
    }
  }
  return exts.sort();
}

// ---------- 派生物定型 ----------
export function derive(langKey, cfg, scmText, lingYml) {
  const caps = parseTags(scmText);
  const dedup = new Map();
  for (const c of caps) {
    const k = `${c.capture}|${c.kind}|${c.inside.join('>')}`;
    if (!dedup.has(k)) dedup.set(k, { ...c, inside: c.inside,
      names: [...(c.names || [])] });
    else {
      // 同捕获位多条 pattern 的 names 归并去重（path>kind 为键）
      const e = dedup.get(k);
      const seen = new Set(e.names.map((n) => `${n.path.join('>')}|${n.kind}`));
      for (const n of c.names || []) {
        const nk = `${n.path.join('>')}|${n.kind}`;
        if (!seen.has(nk)) { seen.add(nk); e.names.push(n); }
      }
    }
  }
  const declKinds = [], refKinds = [];
  for (const c of [...dedup.values()].sort((x, y) => x.capture.localeCompare(y.capture)
    || x.kind.localeCompare(y.kind))) {
    const e = { shape: c.capture.split('.')[1], kind: c.kind,
      ...(c.inside.length ? { inside: c.inside } : {}),
      ...(c.nameKind ? { nameKind: c.nameKind } : {}),
      ...(c.names?.length ? { names: c.names } : {}) };
    (c.capture.startsWith('definition.') ? declKinds : refKinds).push(e);
  }
  return { declKinds, refKinds,
    exts: linguistExts(lingYml, cfg.linguist) };
}

// ---------- names → ast-grep has/any 规则文本（描述符共用） ----------
// derived.names[{path:[f1,f2..],kind}] 是上游 @name 捕获的字段约束链——
// 译回规则层：单名 `has:{field:f,kind:K}`；多跳嵌套 has；多名 `any:`。
// 实证组合合法：kind+any+has(field) 在 ast-grep 0.45.3 正常 AND。
export function namesRuleYaml(names) {
  // 尾段 kind '_'=上游 name:(_)@name 通配宿主——ast-grep 无 '_' 合法 kind；
  // 裸 field 位约束（has 无正项）又不合法，整条名约束退化为无（词表留
  // derived 供 M2，规则面弱化，handle 侧名抽取是兜底闸）
  const usable = (names || []).filter((n) => n.kind !== '_');
  if (!usable.length) return '';
  const hasBlock = (path, kind, pad, first = '') => {
    const lines = [`${pad}${first}has:`];
    const p2 = pad + (first ? '    ' : '  ');
    lines.push(`${p2}field: ${path[0]}`);
    if (path.length === 1) lines.push(`${p2}kind: ${kind}`);
    else lines.push(...hasBlock(path.slice(1), kind, p2));
    return lines;
  };
  const lines = [];
  if (usable.length === 1)
    lines.push(...hasBlock(usable[0].path, usable[0].kind, '  '));
  else {
    lines.push('  any:');
    for (const n of usable)
      lines.push(...hasBlock(n.path, n.kind, '    ', '- '));
  }
  return lines.join('\n') + '\n';
}

export function emitDerived(langKey, cfg, d) {
  return `// <auto-generated by sync-langs.mjs — DO NOT EDIT>
// provenance: ${cfg.grammar}@${cfg.rev} ${cfg.tags}
// 词表声明派生物：手写描述符 <lang>.mjs 消费本件组装 decl 规则；
// 边语义（边去哪）不属上游供给面，仍手写。
export const derived = ${JSON.stringify({
    lang: langKey, upstream: { grammar: cfg.grammar, rev: cfg.rev, tags: cfg.tags },
    exts: d.exts, declKinds: d.declKinds, refKinds: d.refKinds,
  }, null, 2)};
`;
}

// ---------- 离线一致性（门禁层，零网络） ----------
// upstream.yaml pin 对 derived 头注 provenance 对账。
// 返回值按语言给 {state: 'ok'|'stale'|'missing'|'orphan'}：
//   stale=pin 变了没重生成；missing=有 pin 无 derived；orphan=有 derived 无 pin
export function parseUpstreamPins(yamlText) {
  // 够用即停：langs: 节下每语言块的 rev: 字段。结构浅手解不引入 yaml 依赖；
  // 只认 langs: 节（sources.linguist.rev 是上游源 pin 非语言 pin）
  const pins = {};
  let inLangs = false, cur = null;
  for (const l of yamlText.split('\n')) {
    if (/^langs:\s*$/.test(l)) { inLangs = true; continue; }
    if (inLangs && /^\S/.test(l)) break;           // 下一个顶层节 → 出节
    if (!inLangs) continue;
    const m2 = l.match(/^ {2}(?<k>\w+)\s*:\s*$/);
    const mRev = l.match(/^ {4}rev:\s*['"]?(?<v>[0-9a-f]{7,40})['"]?\s*$/);
    if (m2) { cur = m2.groups.k; continue; }
    if (mRev && cur) pins[cur] = mRev.groups.v;
  }
  return pins;
}

export function checkDerivedConsistency(upstreamYamlText, derivedSources) {
  // derivedSources: {lang: 文件全文}
  const pins = parseUpstreamPins(upstreamYamlText);
  const out = {};
  for (const [lang, pin] of Object.entries(pins)) {
    const src = derivedSources[lang];
    if (src == null) { out[lang] = { state: 'missing', pin }; continue; }
    const m = src.match(/^\/\/ provenance: \S+@([0-9a-f]{7,40})/m);
    const rev = m?.[1] || null;
    out[lang] = { state: rev === pin ? 'ok' : 'stale', pin, rev };
  }
  for (const lang of Object.keys(derivedSources))
    if (!(lang in pins)) out[lang] = { state: 'orphan', pin: null };
  return out;
}
