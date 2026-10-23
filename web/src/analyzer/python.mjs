// Python MCP 서버 분석: 등록 도구를 찾고, 도구 함수에서 시작해 저장소 안의 함수 호출을 따라간다(core.mjs의 extractTree가 부른다).
// 호출은 이름과 import로 잇는다. 객체를 알 수 없는 메서드 호출(x.run())과 동적 호출(getattr, 콜백 등록)은 따라가지 않는다.
// 저장소 밖 호출은 import한 모듈 이름으로 남긴다(subprocess.run, requests.get 등). 서버별 규칙이나 정한 목록은 두지 않는다.

const field = (n, name) => n.childForFieldName(name);
const line = n => n.startPosition.row + 1;
// 화면에 보일 등록 코드 한 줄. 길면 자른다
const snippet = (n, max = 60) => {
  const t = n.text.replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};

function* walk(root) {
  // 너비 우선. 같은 파일에 같은 이름의 함수가 여럿이면 앞에 나온 것을 고른다
  const q = [root];
  for (let i = 0; i < q.length; i++) {
    yield q[i];
    for (const c of q[i].namedChildren) q.push(c);
  }
}

// ── 등록 도구 ──

/** x.tool 또는 tool. list_tools·call_tool 같은 저수준 핸들러는 아니다 */
function isToolAttr(expr) {
  if (!expr) return false;
  if (expr.type === 'attribute') return field(expr, 'attribute')?.text === 'tool';
  return expr.type === 'identifier' && expr.text === 'tool';
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '\n': '' };

/** 고정된 str 리터럴의 값. "a" "b"처럼 이어 쓴 것과 괄호로 감싼 것도 읽는다. f-string·bytes는 아니다 */
function strConst(n) {
  if (n?.type === 'parenthesized_expression') return strConst(n.namedChildren.find(c => c.type !== 'comment'));
  if (n?.type === 'concatenated_string') {
    const parts = n.namedChildren.filter(c => c.type !== 'comment').map(strConst);
    return parts.every(x => x !== null) ? parts.join('') : null;
  }
  if (!n || n.type !== 'string') return null;
  if (n.namedChildren.some(c => c.type === 'interpolation')) return null;
  const start = n.namedChildren.find(c => c.type === 'string_start');
  const end = n.namedChildren.find(c => c.type === 'string_end');
  if (!start || !end || /b/i.test(start.text)) return null;
  const raw = n.text.slice(start.endIndex - n.startIndex, end.startIndex - n.startIndex);
  return /r/i.test(start.text) ? raw : raw.replace(/\\(n|t|r|\\|'|"|\n)/g, (_, c) => ESCAPES[c]);
}

/**
 * 문자열 값을 읽는 함수를 만든다. 리터럴에 더해, 이름이면 모듈 수준 상수를 따라간다:
 * 같은 파일의 DESC = "…", from .texts import DESC로 가져온 상수, "a" + DESC 같은 + 연결.
 * f-string, 함수 호출 결과(textwrap.dedent 등), 실행 중에 바뀌는 값은 읽지 않는다
 */
function stringResolver(trees) {
  const fileSet = new Set(trees.map(([p]) => p));
  const consts = new Map(); // 파일 → (이름 → 값 노드). 같은 이름을 다시 대입하면 마지막 것
  const imports = new Map();
  for (const [path, tree] of trees) {
    const m = new Map();
    for (const st of tree.rootNode.namedChildren) {
      const a = st.type === 'expression_statement' ? st.namedChildren[0] : null;
      if (a?.type === 'assignment' && field(a, 'left')?.type === 'identifier' && field(a, 'right')) m.set(field(a, 'left').text, field(a, 'right'));
    }
    consts.set(path, m);
    imports.set(path, importsOf(tree.rootNode));
  }
  const value = (n, path, depth = 0) => {
    if (!n || depth > 5) return null;
    if (n.type === 'identifier') {
      const own = consts.get(path).get(n.text);
      if (own) return value(own, path, depth + 1);
      const from = imports.get(path).names.get(n.text);
      const file = from && moduleFile(from[0], path, fileSet);
      const node = file && consts.get(file).get(from[1]);
      return node ? value(node, file, depth + 1) : null;
    }
    if (n.type === 'binary_operator' && n.childForFieldName('operator')?.text === '+') {
      const l = value(field(n, 'left'), path, depth + 1);
      const r = l === null ? null : value(field(n, 'right'), path, depth + 1);
      return r === null ? null : l + r;
    }
    if (n.type === 'parenthesized_expression') return value(n.namedChildren.find(c => c.type !== 'comment'), path, depth);
    return strConst(n);
  };
  return value;
}

const argNodes = call => (field(call, 'arguments')?.namedChildren ?? []).filter(c => c.type !== 'comment');
const positional = call => argNodes(call).filter(c => c.type !== 'keyword_argument' && c.type !== 'dictionary_splat');

/** tool(name="x") 또는 tool("x")의 이름. str은 문자열 값을 읽는 함수(stringResolver) */
function explicitName(call, str, keywordsOnly = false) {
  for (const a of argNodes(call)) {
    if (a.type === 'keyword_argument' && field(a, 'name')?.text === 'name') {
      const v = str(field(a, 'value'));
      if (v !== null) return v;
    }
  }
  if (keywordsOnly) return null;
  const first = positional(call)[0];
  return first ? str(first) : null;
}

/** call의 키워드 인자 key=…가 문자열로 정해지면 그 값 */
function keywordStr(call, key, str) {
  const a = argNodes(call).find(a => a.type === 'keyword_argument' && field(a, 'name')?.text === key);
  return a ? str(field(a, 'value')) : null;
}

/**
 * 도구 설명 description=…: {description, description_expr}. 값을 읽지 못하면(f-string 등) description은 null,
 * description_expr에 코드를 남긴다. 이때 FastMCP는 docstring을 쓰지 않으므로 docstring으로 채우지 않는다
 */
function descriptionOf(call, str) {
  const a = call && argNodes(call).find(a => a.type === 'keyword_argument' && field(a, 'name')?.text === 'description');
  if (!a) return { description: null };
  const description = str(field(a, 'value'));
  return description !== null ? { description } : { description: null, description_expr: snippet(field(a, 'value')) };
}

function calleeName(f) {
  if (f?.type === 'attribute') return field(f, 'attribute')?.text ?? null;
  if (f?.type === 'identifier') return f.text;
  return null;
}

/**
 * 등록 방식: @x.tool 데코레이터, x.add_tool(f), x.tool()(f), 저수준 SDK의 Tool(name=…). reg는 등록한 코드 한 줄이다.
 * 코드만 보고 함수를 정할 수 없는 등록(반복문 안의 x.tool()(변수) 등)은 dynamic으로 따로 둔다
 */
function findTools(trees, value) {
  const defs = new Map(); // 함수 이름 → [[path, line]]. add_tool(f)의 f를 찾는 데 쓴다
  for (const [path, tree] of trees) {
    for (const n of walk(tree.rootNode)) {
      if (n.type !== 'function_definition') continue;
      const name = field(n, 'name').text;
      if (!defs.has(name)) defs.set(name, []);
      defs.get(name).push([path, line(n)]);
    }
  }
  const resolve = (name, path) => {
    const cands = defs.get(name) ?? [];
    return cands.find(c => c[0] === path) ?? (cands.length === 1 ? cands[0] : null);
  };

  const tools = [];
  const dynamic = [];
  for (const [path, tree] of trees) {
    const str = n => value(n, path);
    for (const n of walk(tree.rootNode)) {
      if (n.type === 'function_definition') {
        if (n.parent?.type !== 'decorated_definition') continue;
        for (const dec of n.parent.namedChildren.filter(c => c.type === 'decorator')) {
          const expr = dec.namedChildren.find(c => c.type !== 'comment');
          const isCall = expr?.type === 'call';
          if (isToolAttr(isCall ? field(expr, 'function') : expr)) {
            tools.push({
              name: (isCall ? explicitName(expr, str) : null) ?? field(n, 'name').text, path, line: line(n), reg: snippet(dec),
              ...descriptionOf(isCall ? expr : null, str),
            });
            break;
          }
        }
      } else if (n.type === 'call') {
        const f = field(n, 'function');
        let fn = null, name = null, desc = null;
        if (f?.type === 'attribute' && field(f, 'attribute')?.text === 'add_tool' && positional(n).length) {
          fn = positional(n)[0]; name = explicitName(n, str, true); desc = descriptionOf(n, str);
        } else if (f?.type === 'call' && isToolAttr(field(f, 'function')) && positional(n).length) {
          fn = positional(n)[0]; name = explicitName(f, str); desc = descriptionOf(f, str);
        } else if (calleeName(f) === 'Tool') {
          const toolName = explicitName(n, str);
          if (toolName !== null) tools.push({ name: toolName, path, line: line(n), reg: snippet(n), ...descriptionOf(n, str) });
          continue;
        }
        if (!fn) continue;
        const loc = fn.type === 'identifier' ? resolve(fn.text, path) : null;
        if (loc) tools.push({ name: name ?? fn.text, path: loc[0], line: loc[1], reg: snippet(n), ...desc });
        else dynamic.push({ path, line: line(n) });
      }
    }
  }
  const byLoc = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);
  return { tools: tools.sort(byLoc), dynamic: dynamic.sort(byLoc) };
}

// ── 호출 잇기 ──

// 그래프에 저장소 밖 호출로 남기는 내장 함수
const BUILTIN_CALLS = new Set(['open', 'eval', 'exec', 'compile', '__import__']);
// 파이썬 내장 이름. 같은 파일에 정의하거나 import하지 않았으면 저장소의 같은 이름 함수로 잇지 않는다
const PY_BUILTINS = new Set([
  'abs', 'all', 'any', 'bool', 'bytes', 'callable', 'chr', 'compile', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec',
  'filter', 'float', 'format', 'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int',
  'isinstance', 'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max', 'min', 'next', 'object', 'oct', 'open', 'ord',
  'pow', 'print', 'property', 'range', 'repr', 'reversed', 'round', 'set', 'setattr', 'slice', 'sorted', 'str', 'sum',
  'super', 'tuple', 'type', 'vars', 'zip', '__import__',
]);

/** 별칭 → 모듈(import a.b as x), 이름 → [모듈, 원래 이름](from a import b as y), from a import *의 모듈 */
function importsOf(root) {
  const modules = new Map();
  const names = new Map();
  const star = [];
  for (const n of root.namedChildren) {
    if (n.type === 'import_statement') {
      for (const c of n.namedChildren) {
        if (c.type === 'dotted_name') modules.set(c.text.split('.')[0], c.text.split('.')[0]);
        else if (c.type === 'aliased_import') modules.set(field(c, 'alias').text, field(c, 'name').text);
      }
    } else if (n.type === 'import_from_statement') {
      const mod = field(n, 'module_name')?.text ?? '';
      if (n.namedChildren.some(c => c.type === 'wildcard_import')) star.push(mod);
      for (const c of n.childrenForFieldName('name')) {
        if (c.type === 'dotted_name') names.set(c.text, [mod, c.text]);
        else if (c.type === 'aliased_import') names.set(field(c, 'alias').text, [mod, field(c, 'name').text]);
      }
    }
  }
  return { modules, names, star };
}

/** 모듈 이름을 저장소 안의 파일로. 상대 import(.x)는 부르는 파일의 패키지 기준이다 */
function moduleFile(mod, fromPath, fileSet) {
  const dots = mod.match(/^\.*/)[0].length;
  const parts = dots
    ? [...fromPath.split('/').slice(0, -dots), ...mod.slice(dots).split('.').filter(Boolean)]
    : mod.split('.');
  const tail = parts.join('/');
  for (const cand of [`${tail}.py`, `${tail}/__init__.py`]) {
    if (fileSet.has(cand)) return cand;
    for (const f of fileSet) if (f.endsWith('/' + cand)) return f;
  }
  return null;
}

/** Annotated[X, …]의 X. 아니면 그대로 */
function baseType(text) {
  const m = text.match(/^(?:typing\.)?Annotated\[/);
  if (!m) return text;
  let depth = 0;
  for (let i = m[0].length; i < text.length; i++) {
    const ch = text[i];
    if ('[('.includes(ch)) depth++;
    else if ('])'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) return text.slice(m[0].length, i).trim();
  }
  return text;
}

/**
 * 도구 인자: {name, type, default, required, description}. MCP 클라이언트가 보는 스키마의 바탕이다.
 * description은 Field(description="…")에서 읽는다. self·cls·*args·**kwargs와 프레임워크가 넣는 Context 인자는 뺀다
 */
function paramsOf(fn, str) {
  const out = [];
  for (const p of field(fn, 'parameters')?.namedChildren ?? []) {
    let name = null;
    if (p.type === 'identifier') name = p.text;
    else if (p.type === 'typed_parameter') name = p.namedChildren.find(c => c.type === 'identifier')?.text;
    else if (p.type === 'default_parameter' || p.type === 'typed_default_parameter') name = field(p, 'name')?.text;
    if (!name || name === 'self' || name === 'cls') continue;
    const type = field(p, 'type');
    if (type && /\bContext\b/.test(type.text)) continue;
    let value = field(p, 'value');
    let description = null;
    for (const n of [type, value]) {
      for (const c of n ? walk(n) : []) {
        if (c.type === 'call' && /Field$/.test(calleeName(field(c, 'function')) ?? '')) description ??= keywordStr(c, 'description', str);
      }
    }
    // x: int = Field(5, description=…)이면 Field 안의 기본값을 쓴다. Field(...)나 기본값 없는 Field는 필수다
    if (value?.type === 'call' && /Field$/.test(calleeName(field(value, 'function')) ?? '')) {
      const d = argNodes(value).find(a => a.type === 'keyword_argument' && field(a, 'name')?.text === 'default');
      const first = positional(value)[0];
      value = d ? field(d, 'value') : first && first.type !== 'ellipsis' ? first : null;
    }
    out.push({
      name,
      type: type ? baseType(type.text.replace(/\s+/g, ' ')) : null,
      default: value ? snippet(value, 40) : null,
      required: !value,
      description,
    });
  }
  return out;
}

/** 함수 docstring. 들여쓰기를 걷어 낸다 */
function docstring(fn) {
  const first = field(fn, 'body')?.namedChildren.find(c => c.type !== 'comment');
  const s = first?.type === 'expression_statement' ? strConst(first.namedChildren[0]) : null;
  if (!s) return null;
  const lines = s.split('\n');
  const indent = Math.min(...lines.slice(1).filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return lines.map((l, i) => (i && Number.isFinite(indent) ? l.slice(indent) : l)).join('\n').trim() || null;
}

/**
 * 변수에 담은 객체가 어디서 왔는지: x = Foo(…), self.x = Foo(…), x = get_foo()(반환 형식이 Foo).
 * 저장소 안의 클래스면 그 파일({file}), 외부 클래스면 모듈.클래스({module})를 가리킨다. 함수 범위는 나누지 않고 파일 단위로 본다
 */
function bindingsOf(root, imp, path, classFiles, returnTypes, fileSet) {
  const out = new Map();
  const classFile = name => {
    const files = classFiles.get(name) ?? [];
    if (files.includes(path)) return path;
    const from = imp.names.get(name);
    const f = from && moduleFile(from[0], path, fileSet);
    if (f && files.includes(f)) return f;
    return files.length === 1 ? files[0] : null;
  };
  for (const n of walk(root)) {
    if (n.type !== 'assignment') continue;
    const left = field(n, 'left');
    const right = field(n, 'right');
    if (!left || right?.type !== 'call' || !/^(self\.)?\w+$/.test(left.text)) continue;
    const f = field(right, 'function');
    if (f?.type !== 'identifier') continue;
    const name = imp.names.get(f.text)?.[1] ?? f.text;
    const cls = classFile(name) ?? (returnTypes.get(name) ? classFile(returnTypes.get(name)) : null);
    const from = imp.names.get(f.text);
    const fromFile = from && moduleFile(from[0], path, fileSet);
    if (cls || fromFile) out.set(left.text, { file: cls ?? fromFile });
    else if (from) out.set(left.text, { module: from.join('.') });
  }
  return out;
}

/**
 * 도구가 호출하는 함수의 호출 그래프.
 * functions[i] = {name, path, line, end, calls: [{line, to?, ext?}]}. to는 저장소 안 함수 번호, ext는 저장소 밖 호출이다
 */
function buildGraph(trees, tools, value) {
  const fileSet = new Set(trees.map(([p]) => p));
  const funcs = new Map(); // "path:line" → {key, name, path, line, end, params, doc, calls}
  const byName = new Map(); // 이름 → [key]
  const byFileName = new Map(); // path + '\0' + 이름 → [key]
  const classFiles = new Map(); // 클래스 이름 → [파일]
  const returnTypes = new Map(); // 함수 이름 → 반환 형식에 나오는 첫 이름
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

  for (const [path, tree] of trees) {
    for (const n of walk(tree.rootNode)) {
      if (n.type === 'class_definition') push(classFiles, field(n, 'name').text, path);
      else if (n.type === 'function_definition') {
        const rt = field(n, 'return_type')?.text.match(/[A-Za-z_]\w*/g)?.find(x => !['Optional', 'None'].includes(x));
        if (rt) returnTypes.set(field(n, 'name').text, rt);
      }
    }
  }

  const importsByFile = new Map(trees.map(([path, tree]) => [path, importsOf(tree.rootNode)]));
  for (const [path, tree] of trees) {
    const imp = importsByFile.get(path);
    const binds = bindingsOf(tree.rootNode, imp, path, classFiles, returnTypes, fileSet);
    const str = n => value(n, path);
    for (const fn of walk(tree.rootNode)) {
      if (fn.type !== 'function_definition') continue;
      const name = field(fn, 'name').text;
      const key = `${path}:${line(fn)}`;
      const calls = [];
      for (const c of walk(fn)) {
        if (c.type !== 'call') continue;
        const f = field(c, 'function');
        let base = null, callee = null, module = null, objFile = null;
        if (f?.type === 'identifier') {
          callee = f.text;
          const from = imp.names.get(callee);
          if (from) { module = from[0]; callee = from[1]; }
        } else if (f?.type === 'attribute') {
          callee = field(f, 'attribute').text;
          const obj = field(f, 'object');
          base = obj.text;
          const head = base.split('.')[0];
          const bound = binds.get(base);
          if (/^[\w.]+$/.test(base) && imp.modules.has(head)) module = imp.modules.get(head) + base.slice(head.length);
          else if (bound?.module) module = bound.module;
          else if (bound?.file) objFile = bound.file;
          else if (obj.type === 'identifier' && imp.names.has(base)) {
            // from a import b: b가 하위 모듈이면 그 파일, 아니면 b를 정의한 모듈 파일(모듈 수준 객체)
            const [mod, orig] = imp.names.get(base);
            objFile = moduleFile(`${mod}.${orig}`, path, fileSet) ?? moduleFile(mod, path, fileSet);
            if (!objFile) module = `${mod}.${orig}`;
          }
        }
        if (callee) calls.push({ callee, base, module, objFile, line: line(c) });
      }
      funcs.set(key, { key, name, path, line: line(fn), end: fn.endPosition.row + 1, params: paramsOf(fn, str), doc: docstring(fn), calls });
      push(byName, name, key);
      push(byFileName, path + '\0' + name, key);
    }
  }

  // file에 정의된 name. 없으면 그 파일이 다시 내보내는 import(from .x import name, from .x import *)를 따라간다
  const definedIn = (file, name, depth = 0) => {
    const own = byFileName.get(file + '\0' + name);
    if (own || depth > 3) return own ?? [];
    const imp = importsByFile.get(file);
    const from = imp?.names.get(name);
    const mods = from ? [[from[0], from[1]]] : (imp?.star ?? []).map(m => [m, name]);
    for (const [mod, orig] of mods) {
      const f = moduleFile(mod, file, fileSet);
      const found = f && f !== file ? definedIn(f, orig, depth + 1) : [];
      if (found.length) return found;
    }
    return [];
  };

  // 호출 하나가 가리키는 저장소 안의 함수. 어느 객체인지 모르는 메서드 호출은 잇지 않는다
  const targets = (call, path) => {
    const { callee, base, module, objFile } = call;
    if (objFile) return definedIn(objFile, callee);
    if (module) {
      const file = moduleFile(module, path, fileSet);
      return file ? definedIn(file, callee) : [];
    }
    if (base === 'self' || base === 'cls') return byFileName.get(path + '\0' + callee) ?? [];
    if (base) return [];
    const same = byFileName.get(path + '\0' + callee);
    if (same) return same;
    if (PY_BUILTINS.has(callee)) return [];
    const all = byName.get(callee) ?? [];
    return all.length === 1 ? all : [];
  };

  // 도구 함수에서 너비 우선으로 따라가 호출되는 함수만 남긴다
  const reached = new Set();
  for (const t of tools) {
    const start = funcs.get(`${t.path}:${t.line}`);
    t.params = start?.params ?? [];
    if (!t.description_expr) t.description ??= start?.doc ?? null; // FastMCP는 description이 없으면 docstring을 쓴다
    if (!start) continue; // 저수준 Tool(name=…) 등록은 함수가 없다
    const queue = [start.key];
    reached.add(start.key);
    for (let i = 0; i < queue.length; i++) {
      const fn = funcs.get(queue[i]);
      for (const c of fn.calls) {
        for (const k of targets(c, fn.path)) if (!reached.has(k)) { reached.add(k); queue.push(k); }
      }
    }
  }

  const keys = [...reached].sort((a, b) => {
    const fa = funcs.get(a), fb = funcs.get(b);
    return fa.path < fb.path ? -1 : fa.path > fb.path ? 1 : fa.line - fb.line;
  });
  const idOf = new Map(keys.map((k, i) => [k, i]));
  const functions = keys.map(k => {
    const fn = funcs.get(k);
    const calls = [];
    for (const c of fn.calls) {
      const to = targets(c, fn.path).map(x => idOf.get(x));
      let ext = null;
      if (!to.length && c.module && !moduleFile(c.module, fn.path, fileSet)) ext = `${c.module}.${c.callee}`;
      else if (!to.length && !c.module && !c.base && BUILTIN_CALLS.has(c.callee)) ext = c.callee;
      if (to.length || ext) calls.push({ line: c.line, ...(to.length && { to }), ...(ext && { ext }) });
    }
    return { name: fn.name, path: fn.path, line: fn.line, end: fn.end, calls };
  });
  for (const t of tools) {
    const id = idOf.get(`${t.path}:${t.line}`);
    if (id !== undefined) t.fn = id;
  }
  return { functions };
}

/** files: [경로, 내용] 목록(경로 순). parser: Python 문법을 넣은 web-tree-sitter Parser */
export function extractPython(files, parser) {
  const trees = [];
  try {
    for (const [path, text] of files) {
      const tree = parser.parse(text);
      if (tree) trees.push([path, tree]);
    }
    const value = stringResolver(trees);
    const { tools, dynamic } = findTools(trees, value);
    return { tools, dynamic, graph: buildGraph(trees, tools, value) };
  } finally {
    for (const [, tree] of trees) tree.delete();
  }
}
