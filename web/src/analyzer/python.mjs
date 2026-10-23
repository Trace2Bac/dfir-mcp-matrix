// Python MCP 서버 분석: 등록 도구를 찾고, 도구 함수에서 시작해 저장소 안의 함수 호출을 따라간다(core.mjs의 extractTree가 부른다).
// 호출은 이름과 import로 잇는다. 객체를 알 수 없는 메서드 호출(x.run())과 동적 호출(getattr, 콜백 등록)은 따라가지 않는다.
// 저장소 밖 호출은 import한 모듈 이름으로 남긴다(subprocess.run, requests.get 등). 서버별 규칙이나 정한 목록은 두지 않는다.

const field = (n, name) => n.childForFieldName(name);
const line = n => n.startPosition.row + 1;

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

/** 따옴표 안이 고정된 str 리터럴이면 그 값. f-string·bytes는 아니다 */
function strConst(n) {
  if (!n || n.type !== 'string') return null;
  if (n.namedChildren.some(c => c.type === 'interpolation')) return null;
  const start = n.namedChildren.find(c => c.type === 'string_start');
  const end = n.namedChildren.find(c => c.type === 'string_end');
  if (!start || !end || /b/i.test(start.text)) return null;
  return n.text.slice(start.endIndex - n.startIndex, end.startIndex - n.startIndex);
}

const argNodes = call => (field(call, 'arguments')?.namedChildren ?? []).filter(c => c.type !== 'comment');
const positional = call => argNodes(call).filter(c => c.type !== 'keyword_argument' && c.type !== 'dictionary_splat');

/** tool(name="x") 또는 tool("x")의 이름 */
function explicitName(call, keywordsOnly = false) {
  for (const a of argNodes(call)) {
    if (a.type === 'keyword_argument' && field(a, 'name')?.text === 'name') {
      const v = strConst(field(a, 'value'));
      if (v !== null) return v;
    }
  }
  if (keywordsOnly) return null;
  const first = positional(call)[0];
  return first ? strConst(first) : null;
}

function calleeName(f) {
  if (f?.type === 'attribute') return field(f, 'attribute')?.text ?? null;
  if (f?.type === 'identifier') return f.text;
  return null;
}

/**
 * 등록 방식(how): decorator(@x.tool), add_tool(x.add_tool(f)), call(x.tool()(f)), Tool(저수준 SDK의 Tool(name=…)).
 * 코드만 보고 함수를 정할 수 없는 등록(반복문 안의 x.tool()(변수) 등)은 dynamic으로 따로 둔다
 */
function findTools(trees) {
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
    for (const n of walk(tree.rootNode)) {
      if (n.type === 'function_definition') {
        if (n.parent?.type !== 'decorated_definition') continue;
        for (const dec of n.parent.namedChildren.filter(c => c.type === 'decorator')) {
          const expr = dec.namedChildren.find(c => c.type !== 'comment');
          const isCall = expr?.type === 'call';
          if (isToolAttr(isCall ? field(expr, 'function') : expr)) {
            tools.push({ name: (isCall ? explicitName(expr) : null) ?? field(n, 'name').text, path, line: line(n), how: 'decorator' });
            break;
          }
        }
      } else if (n.type === 'call') {
        const f = field(n, 'function');
        let how = null, fn = null, name = null;
        if (f?.type === 'attribute' && field(f, 'attribute')?.text === 'add_tool' && positional(n).length) {
          how = 'add_tool'; fn = positional(n)[0]; name = explicitName(n, true);
        } else if (f?.type === 'call' && isToolAttr(field(f, 'function')) && positional(n).length) {
          how = 'call'; fn = positional(n)[0]; name = explicitName(f);
        } else if (calleeName(f) === 'Tool') {
          const toolName = explicitName(n);
          if (toolName !== null) tools.push({ name: toolName, path, line: line(n), how: 'Tool' });
          continue;
        }
        if (!fn) continue;
        const loc = fn.type === 'identifier' ? resolve(fn.text, path) : null;
        if (loc) tools.push({ name: name ?? fn.text, path: loc[0], line: loc[1], how });
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

function paramNames(fn) {
  const out = [];
  for (const p of field(fn, 'parameters')?.namedChildren ?? []) {
    let name = null;
    if (p.type === 'identifier') name = p.text;
    else if (p.type === 'typed_parameter') name = p.namedChildren.find(c => c.type === 'identifier')?.text;
    else if (p.type === 'default_parameter' || p.type === 'typed_default_parameter') name = field(p, 'name')?.text;
    if (name && name !== 'self' && name !== 'cls') out.push(name);
  }
  return out;
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
 * 도구에서 닿는 함수의 호출 그래프.
 * functions[i] = {name, path, line, end, calls: [{line, to?, ext?}]}. to는 저장소 안 함수 번호, ext는 저장소 밖 호출이다
 */
function buildGraph(trees, tools) {
  const fileSet = new Set(trees.map(([p]) => p));
  const funcs = new Map(); // "path:line" → {key, name, path, line, end, params, calls}
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
      funcs.set(key, { key, name, path, line: line(fn), end: fn.endPosition.row + 1, params: paramNames(fn), calls });
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

  // 도구 함수에서 너비 우선으로 닿는 함수만 남긴다
  const reached = new Set();
  for (const t of tools) {
    const start = funcs.get(`${t.path}:${t.line}`);
    t.params = start?.params ?? [];
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
  return { functions, total_functions: funcs.size, total_files: fileSet.size };
}

/** files: [경로, 내용] 목록(경로 순). parser: Python 문법을 넣은 web-tree-sitter Parser */
export function extractPython(files, parser) {
  const trees = [];
  try {
    for (const [path, text] of files) {
      const tree = parser.parse(text);
      if (tree) trees.push([path, tree]);
    }
    const { tools, dynamic } = findTools(trees);
    return { tools, dynamic, graph: buildGraph(trees, tools) };
  } finally {
    for (const [, tree] of trees) tree.delete();
  }
}
