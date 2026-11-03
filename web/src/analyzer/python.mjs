// Python MCP 서버 분석(core.mjs의 extractTree가 부른다):
//   등록 도구와 명세(설명·인자), 도구 함수에서 시작한 호출 그래프, 도구 밖의 MCP 기능(서버·리소스·프롬프트), SDK 버전과 지원 규격.
// 호출은 이름과 import로 잇는다. 객체를 알 수 없는 메서드 호출(x.run())과 동적 호출(getattr, 콜백 등록)은 따라가지 않는다.
// 저장소 밖 호출은 import한 모듈 이름으로 남긴다(subprocess.run, requests.get 등). 서버별 규칙이나 정한 목록은 두지 않는다.

const field = (n, name) => n.childForFieldName(name);
const line = n => n.startPosition.row + 1;
const byLoc = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);
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

/**
 * x.tool, 또는 mcp·fastmcp에서 import한 tool. list_tools·call_tool 같은 저수준 핸들러는 아니다.
 * 그냥 tool은 LangChain 등 다른 라이브러리의 @tool일 수 있어 import한 곳을 본다
 */
function isToolAttr(expr, imp) {
  if (!expr) return false;
  if (expr.type === 'attribute') return field(expr, 'attribute')?.text === 'tool';
  return expr.type === 'identifier' && expr.text === 'tool' && fromMcp(expr, imp);
}

/**
 * 이름이 어느 모듈에서 왔는가: Tool → mcp.types(from mcp.types import Tool), types.Tool → mcp.types(from mcp import types),
 * fm.FastMCP → mcp.server.fastmcp(import mcp.server.fastmcp as fm). import하지 않은 이름이면 ''
 */
function moduleOf(f, imp) {
  const parts = f.text.split('.');
  const from = imp.names.get(parts[0]);
  if (parts.length === 1) return from?.[0] ?? '';
  const head = from ? `${from[0]}.${from[1]}` : imp.modules.get(parts[0]);
  return head ? [head, ...parts.slice(1, -1)].join('.') : '';
}
const fromMcp = (f, imp) => /^(mcp|fastmcp)(\.|$)/.test(moduleOf(f, imp));

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
function stringResolver({ trees, imports, fileSet }) {
  const consts = new Map(); // 파일 → (이름 → 값 노드). 같은 이름을 다시 대입하면 마지막 것
  for (const [path, tree] of trees) {
    const m = new Map();
    for (const st of tree.rootNode.namedChildren) {
      const a = st.type === 'expression_statement' ? st.namedChildren[0] : null;
      if (a?.type === 'assignment' && field(a, 'left')?.type === 'identifier' && field(a, 'right')) m.set(field(a, 'left').text, field(a, 'right'));
    }
    consts.set(path, m);
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

/** call의 키워드 인자 key=…의 값 노드 */
function keywordArg(call, key) {
  const a = argNodes(call).find(a => a.type === 'keyword_argument' && field(a, 'name')?.text === key);
  return a ? field(a, 'value') : null;
}

/** call의 키워드 인자 key=…가 문자열로 정해지면 그 값 */
function keywordStr(call, key, str) {
  const v = keywordArg(call, key);
  return v ? str(v) : null;
}

/** tool(name="x") 또는 tool("x")의 이름. str은 문자열 값을 읽는 함수(stringResolver) */
function explicitName(call, str, keywordsOnly = false) {
  const named = keywordStr(call, 'name', str);
  if (named !== null || keywordsOnly) return named;
  const first = positional(call)[0];
  return first ? str(first) : null;
}

/**
 * 도구 설명 description=…: {description, description_expr}. 값을 읽지 못하면(f-string 등) description은 null,
 * description_expr에 코드를 남긴다. 이때 FastMCP는 docstring을 쓰지 않으므로 docstring으로 채우지 않는다
 */
function descriptionOf(call, str) {
  const v = call ? keywordArg(call, 'description') : null;
  if (!v) return { description: null };
  const description = str(v);
  return description !== null ? { description } : { description: null, description_expr: snippet(v) };
}

function calleeName(f) {
  if (f?.type === 'attribute') return field(f, 'attribute')?.text ?? null;
  if (f?.type === 'identifier') return f.text;
  return null;
}

/**
 * 파이썬 리터럴(딕셔너리·리스트·문자열·숫자·True/False/None) → JSON 값. 실행해야 정해지는 값이 섞이면 undefined.
 * 키워드 인자만 쓴 ToolAnnotations(…)·dict(…)는 딕셔너리로 본다
 */
function jsonLiteral(n, str) {
  switch (n?.type) {
    case 'call': {
      if (!/^(ToolAnnotations|dict)$/.test(calleeName(field(n, 'function')) ?? '')) return undefined;
      const out = {};
      for (const a of argNodes(n)) {
        const v = a.type === 'keyword_argument' ? jsonLiteral(field(a, 'value'), str) : undefined;
        if (v === undefined) return undefined;
        out[field(a, 'name').text] = v;
      }
      return out;
    }
    case 'dictionary': {
      const out = {};
      for (const p of n.namedChildren) {
        if (p.type === 'comment') continue;
        const k = p.type === 'pair' ? str(field(p, 'key')) : null;
        const v = k !== null ? jsonLiteral(field(p, 'value'), str) : undefined;
        if (v === undefined) return undefined;
        out[k] = v;
      }
      return out;
    }
    case 'list': case 'tuple': {
      const out = [];
      for (const c of n.namedChildren) {
        if (c.type === 'comment') continue;
        const v = jsonLiteral(c, str);
        if (v === undefined) return undefined;
        out.push(v);
      }
      return out;
    }
    case 'integer': case 'float': return Number.isFinite(Number(n.text)) ? Number(n.text) : undefined;
    case 'unary_operator': { const v = jsonLiteral(n.namedChildren[0], str); return n.text.startsWith('-') && typeof v === 'number' ? -v : undefined; }
    case 'true': return true;
    case 'false': return false;
    case 'none': return null;
    default: return str(n) ?? undefined;
  }
}

// JSON으로 읽는 등록 인자 → 결과 이름. 저수준 Tool은 inputSchema·outputSchema, fastmcp는 output_schema다
const JSON_ARGS = [['annotations', 'annotations'], ['inputSchema', 'input_schema'], ['outputSchema', 'output_schema'], ['output_schema', 'output_schema']];

/**
 * 도구 등록 코드의 키워드 인자: description(descriptionOf), title, structured_output(MCP SDK, 코드 그대로)과 JSON_ARGS.
 * JSON_ARGS는 리터럴(annotations=ToolAnnotations(…)·딕셔너리, 스키마 딕셔너리, None이면 null)로 읽고,
 * 같은 파일의 모듈 수준 변수(RO = ToolAnnotations(…))는 consts로 따라간다. 코드만으로 못 읽으면 *_expr에 코드를 남긴다
 */
function toolArgs(call, str, consts) {
  if (!call) return { description: null };
  const out = descriptionOf(call, str);
  const title = keywordStr(call, 'title', str);
  if (title !== null) out.title = title;
  const so = keywordArg(call, 'structured_output');
  if (so) out.structured_output = so.text;
  for (const [key, name] of JSON_ARGS) {
    const arg = keywordArg(call, key);
    if (!arg) continue;
    const json = jsonLiteral((arg.type === 'identifier' && consts.get(arg.text)) || arg, str);
    if (json !== undefined) out[name] = json;
    else out[`${name}_expr`] = snippet(arg);
  }
  return out;
}

/** 모듈 수준의 x = 값 대입: 이름 → 값 노드 */
function moduleAssigns(root) {
  const m = new Map();
  for (const st of root.namedChildren) {
    const a = st.type === 'expression_statement' ? st.namedChildren[0] : null;
    if (a?.type === 'assignment' && field(a, 'left')?.type === 'identifier' && field(a, 'right')) m.set(field(a, 'left').text, field(a, 'right'));
  }
  return m;
}

/**
 * 등록 방식: @x.tool 데코레이터, x.add_tool(f), x.tool()(f), 저수준 SDK의 Tool(name=…)(mcp에서 import한 것만). reg는 등록한 코드 한 줄이다.
 * 등록 코드의 키워드 인자(description, title, annotations, 스키마)도 읽는다(toolArgs).
 * 코드만 보고 함수를 정할 수 없는 등록(반복문 안의 x.tool()(변수) 등)은 dynamic으로 따로 둔다
 */
function findTools({ trees, imports }, value) {
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
    const imp = imports.get(path);
    const consts = moduleAssigns(tree.rootNode);
    const args = call => toolArgs(call, str, consts);
    for (const n of walk(tree.rootNode)) {
      if (n.type === 'function_definition') {
        if (n.parent?.type !== 'decorated_definition') continue;
        for (const dec of n.parent.namedChildren.filter(c => c.type === 'decorator')) {
          const expr = dec.namedChildren.find(c => c.type !== 'comment');
          const isCall = expr?.type === 'call';
          if (isToolAttr(isCall ? field(expr, 'function') : expr, imp)) {
            tools.push({
              name: (isCall ? explicitName(expr, str) : null) ?? field(n, 'name').text, path, line: line(n), reg: snippet(dec),
              ...args(isCall ? expr : null),
            });
            break;
          }
        }
      } else if (n.type === 'call') {
        const f = field(n, 'function');
        let fn = null, name = null, desc = null;
        if (f?.type === 'attribute' && field(f, 'attribute')?.text === 'add_tool' && positional(n).length) {
          fn = positional(n)[0]; name = explicitName(n, str, true); desc = args(n);
        } else if (f?.type === 'call' && isToolAttr(field(f, 'function'), imp) && positional(n).length) {
          fn = positional(n)[0]; name = explicitName(f, str); desc = args(f);
        } else if (calleeName(f) === 'Tool' && fromMcp(f, imp)) {
          // 저수준 SDK의 Tool(name=…). LangChain 등 다른 라이브러리의 Tool은 import한 곳으로 거른다
          const toolName = explicitName(n, str);
          if (toolName !== null) tools.push({ name: toolName, path, line: line(n), reg: snippet(n), ...args(n) });
          continue;
        }
        if (!fn) continue;
        const loc = fn.type === 'identifier' ? resolve(fn.text, path) : null;
        if (loc) tools.push({ name: name ?? fn.text, path: loc[0], line: loc[1], reg: snippet(n), ...desc });
        else dynamic.push({ path, line: line(n) });
      }
    }
  }
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

const isFieldCall = n => n?.type === 'call' && /Field$/.test(calleeName(field(n, 'function')) ?? '');

/**
 * 파라미터·모델 필드 하나의 타입 표시(typeNode)와 기본값(valueNode): {type, default, required, description}.
 * x: int = Field(5, description=…)이면 Field 안의 기본값과 설명을 쓴다. default_factory도 기본값으로 본다.
 * Field(...)나 기본값 없는 Field는 필수다
 */
function fieldInfo(typeNode, valueNode, str) {
  let description = null;
  for (const n of [typeNode, valueNode]) {
    for (const c of n ? walk(n) : []) if (isFieldCall(c)) description ??= keywordStr(c, 'description', str);
  }
  let dflt = valueNode ? snippet(valueNode, 40) : null;
  if (isFieldCall(valueNode)) {
    const d = keywordArg(valueNode, 'default');
    const factory = keywordArg(valueNode, 'default_factory');
    const first = positional(valueNode)[0];
    dflt = d ? snippet(d, 40) : factory ? `${snippet(factory, 36)}()` : first && first.type !== 'ellipsis' ? snippet(first, 40) : null;
  }
  return { type: typeNode ? baseType(typeNode.text.replace(/\s+/g, ' ')) : null, default: dflt, required: dflt === null, description };
}

/**
 * 도구 파라미터: {name, type, default, required, description}. MCP 클라이언트가 보는 스키마의 바탕이다.
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
    out.push({ name, ...fieldInfo(type, field(p, 'value'), str) });
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
function buildGraph({ trees, imports, fileSet }, tools, value) {
  const funcs = new Map(); // "path:line" → {key, name, path, line, end, node, calls}
  const byName = new Map(); // 이름 → [key]
  const byFileName = new Map(); // path + '\0' + 이름 → [key]
  const classFiles = new Map(); // 클래스 이름 → [파일]
  const classDefs = new Map(); // 클래스 이름 → [{node, path}]. 반환 모델의 필드를 읽는 데 쓴다
  const returnTypes = new Map(); // 함수 이름 → 반환 형식에 나오는 첫 이름
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

  for (const [path, tree] of trees) {
    for (const n of walk(tree.rootNode)) {
      if (n.type === 'class_definition') {
        push(classFiles, field(n, 'name').text, path);
        push(classDefs, field(n, 'name').text, { node: n, path });
      }
      else if (n.type === 'function_definition') {
        const rt = field(n, 'return_type')?.text.match(/[A-Za-z_]\w*/g)?.find(x => !['Optional', 'None'].includes(x));
        if (rt) returnTypes.set(field(n, 'name').text, rt);
      }
    }
  }

  const bindsByFile = new Map();
  // call 노드 하나 → {callee, base, module, objFile}. 이름·import·변수에 담은 객체로 어디를 부르는지 정한다
  const callRecord = (c, path) => {
    const imp = imports.get(path);
    const binds = bindsByFile.get(path);
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
    return callee ? { callee, base, module, objFile } : null;
  };

  for (const [path, tree] of trees) {
    bindsByFile.set(path, bindingsOf(tree.rootNode, imports.get(path), path, classFiles, returnTypes, fileSet));
    for (const fn of walk(tree.rootNode)) {
      if (fn.type !== 'function_definition') continue;
      const name = field(fn, 'name').text;
      const key = `${path}:${line(fn)}`;
      const calls = [];
      for (const c of walk(fn)) {
        if (c.type !== 'call') continue;
        const rec = callRecord(c, path);
        if (rec) calls.push({ ...rec, line: line(c) });
      }
      funcs.set(key, { key, name, path, line: line(fn), end: fn.endPosition.row + 1, node: fn, calls });
      push(byName, name, key);
      push(byFileName, path + '\0' + name, key);
    }
  }

  // file에 정의된 name. 없으면 그 파일이 다시 내보내는 import(from .x import name, from .x import *)를 따라간다
  const definedIn = (file, name, depth = 0) => {
    const own = byFileName.get(file + '\0' + name);
    if (own || depth > 3) return own ?? [];
    const imp = imports.get(file);
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

  // ── 리턴 정보 ──

  // 이름 하나 → 저장소 안 클래스 정의(리턴 모델). 같은 파일, import한 파일, 하나뿐인 정의 순으로 찾는다
  const classDef = (name, path) => {
    const defs = classDefs.get(name) ?? [];
    const from = imports.get(path)?.names.get(name);
    const file = from && moduleFile(from[0], path, fileSet);
    return defs.find(d => d.path === path) ?? defs.find(d => d.path === file) ?? (defs.length === 1 ? defs[0] : null);
  };

  // 모델 클래스의 필드: 클래스 본문의 x: T = 기본값. 저장소 안 부모 클래스의 필드를 앞에 둔다. _로 시작하는 것과 ClassVar는 뺀다
  const modelFields = ({ node, path }, depth = 0) => {
    const str = n => value(n, path);
    const inherited = depth > 3 ? [] : (field(node, 'superclasses')?.namedChildren ?? [])
      .filter(b => b.type === 'identifier')
      .flatMap(b => { const d = classDef(b.text, path); return d ? modelFields(d, depth + 1) : []; });
    const own = [];
    for (const st of field(node, 'body')?.namedChildren ?? []) {
      const a = st.type === 'expression_statement' ? st.namedChildren[0] : null;
      const left = a?.type === 'assignment' ? field(a, 'left') : null;
      const type = a && field(a, 'type');
      if (left?.type !== 'identifier' || !type || left.text.startsWith('_') || /\bClassVar\b/.test(type.text)) continue;
      own.push({ name: left.text, ...fieldInfo(type, field(a, 'right'), str) });
    }
    const names = new Set(own.map(f => f.name));
    return [...inherited.filter(f => !names.has(f.name)), ...own];
  };

  // 함수 본문의 return 식(안쪽 함수·lambda의 return은 빼고)
  const returnExprs = fn => {
    const out = [];
    const q = [field(fn, 'body')];
    while (q.length) {
      const n = q.pop();
      if (!n || n.type === 'function_definition' || n.type === 'lambda') continue;
      if (n.type === 'return_statement') out.push(n.namedChildren[0] ?? null);
      else q.push(...n.namedChildren);
    }
    return out;
  };

  // 값 식 하나로 짐작하는 타입과 리터럴 값: str "success", int, list … 정할 수 없으면 식 코드.
  // 리터럴 값은 "success"·"error"처럼 짧은 코드 값만 남긴다(긴 안내 문장은 타입만)
  const LITERAL_TYPES = { integer: 'int', float: 'float', true: 'bool', false: 'bool', none: 'None', list: 'list', list_comprehension: 'list', dictionary: 'dict', dictionary_comprehension: 'dict', tuple: 'tuple', set: 'set' };
  const CALL_TYPES = { len: 'int', int: 'int', float: 'float', str: 'str', bool: 'bool', list: 'list', sorted: 'list', dict: 'dict', tuple: 'tuple', set: 'set', round: 'float' };
  const valueHint = (n, fn, path) => {
    if (!n) return {};
    if (n.type === 'parenthesized_expression' || n.type === 'await') return valueHint(n.namedChildren.find(c => c.type !== 'comment'), fn, path);
    if (n.type === 'conditional_expression') {
      // a if c else b: 두 갈래가 모두 타입이 있으면 합친다
      const parts = n.namedChildren.filter(c => c.type !== 'comment');
      const a = valueHint(parts[0], fn, path), b = valueHint(parts[2], fn, path);
      if (a.type && b.type) return { type: a.type === b.type ? a.type : `${a.type} | ${b.type}` };
      return { expr: snippet(n, 30) };
    }
    if (n.type === 'string' || n.type === 'concatenated_string') {
      const v = value(n, path);
      return v !== null && /^[\w.:-]{1,24}$/.test(v) ? { type: 'str', literal: JSON.stringify(v) } : { type: 'str' };
    }
    if (n.type === 'identifier') {
      // 함수 파라미터면 그 타입 표시(def tool_response(tc_id: str, …))
      const p = (field(fn, 'parameters')?.namedChildren ?? []).find(p =>
        (p.type === 'typed_parameter' && p.namedChildren.find(c => c.type === 'identifier')?.text === n.text) ||
        (p.type === 'typed_default_parameter' && field(p, 'name')?.text === n.text));
      if (p) return { type: baseType(field(p, 'type').text.replace(/\s+/g, ' ')) };
    }
    if (LITERAL_TYPES[n.type]) {
      const type = LITERAL_TYPES[n.type];
      return /^(int|float|bool|None)$/.test(type) ? { type, literal: n.text } : { type };
    }
    if (n.type === 'call' && CALL_TYPES[field(n, 'function')?.text]) return { type: CALL_TYPES[field(n, 'function').text] };
    if (n.type === 'identifier' && n.text === 'None') return { type: 'None', literal: 'None' };
    return { expr: snippet(n, 30) };
  };

  /**
   * 식 하나가 만드는 딕셔너리의 키: {keys: Map(키 → {types, literals, expr}), partial}. partial은 코드만으로 다 정할 수 없는 부분이 있다는 뜻이다.
   * 딕셔너리 리터럴, dict(a=…), 변수에 담은 딕셔너리와 그 뒤의 x["k"] = …, 저장소 안 함수(공통 응답 함수 등)의 리턴을 따라간다
   */
  const dictKeys = (n, fn, path, depth = 0) => {
    const keys = new Map();
    let partial = false;
    const put = (k, valueNode, vpath = path) => {
      // 값 식은 지금 읽는 함수(fn) 안에 있다
      if (!keys.has(k)) keys.set(k, { types: new Set(), literals: new Set(), expr: null });
      const info = keys.get(k), hint = valueHint(valueNode, fn, vpath);
      if (hint.type) info.types.add(hint.type);
      if (hint.literal && info.literals.size < 4) info.literals.add(hint.literal);
      if (hint.expr && !hint.type) info.expr ??= hint.expr;
    };
    const add = r => {
      for (const [k, v] of r.keys) {
        if (!keys.has(k)) keys.set(k, { types: new Set(), literals: new Set(), expr: null });
        const info = keys.get(k);
        v.types.forEach(t => info.types.add(t));
        v.literals.forEach(l => info.literals.size < 4 && info.literals.add(l));
        info.expr ??= v.expr;
      }
      partial ||= r.partial;
    };
    if (!n || depth > 4) return { keys, partial: true };
    if (n.type === 'parenthesized_expression' || n.type === 'await') return dictKeys(n.namedChildren.find(c => c.type !== 'comment'), fn, path, depth);
    if (n.type === 'conditional_expression' || n.type === 'boolean_operator') {
      const parts = n.namedChildren.filter(c => c.type !== 'comment');
      for (const part of n.type === 'conditional_expression' ? [parts[0], parts[2]] : parts) add(dictKeys(part, fn, path, depth));
      return { keys, partial };
    }
    if (n.type === 'dictionary') {
      for (const c of n.namedChildren) {
        if (c.type === 'pair') {
          const k = value(field(c, 'key'), path);
          if (k === null) partial = true; else put(k, field(c, 'value'));
        } else if (c.type === 'dictionary_splat') {
          add(dictKeys(c.namedChildren[0], fn, path, depth + 1));
        } else if (c.type !== 'comment') partial = true;
      }
      return { keys, partial };
    }
    if (n.type === 'identifier') {
      // 앞선 마지막 대입 x = …과 그 뒤의 x["k"] = …, x.update({…})
      let last = null;
      for (const a of walk(fn)) {
        if (a.type === 'assignment' && field(a, 'left')?.text === n.text && a.startIndex < n.startIndex && (!last || a.startIndex > last.startIndex)) last = a;
      }
      if (!last) return { keys, partial: true };
      add(dictKeys(field(last, 'right'), fn, path, depth + 1));
      for (const a of walk(fn)) {
        if (a.startIndex <= last.startIndex || a.startIndex > n.startIndex) continue;
        const left = a.type === 'assignment' ? field(a, 'left') : null;
        if (left?.type === 'subscript' && field(left, 'value')?.text === n.text) {
          const k = value(field(left, 'subscript'), path);
          if (k === null) partial = true; else put(k, field(a, 'right'));
        }
        if (a.type === 'call' && field(a, 'function')?.text === `${n.text}.update`) add(dictKeys(positional(a)[0], fn, path, depth + 1));
      }
      return { keys, partial };
    }
    if (n.type === 'call') {
      const f = field(n, 'function');
      if (f?.type === 'identifier' && f.text === 'dict') {
        for (const a of argNodes(n)) {
          if (a.type === 'keyword_argument') put(field(a, 'name').text, field(a, 'value'));
          else add(dictKeys(a.type === 'dictionary_splat' ? a.namedChildren[0] : a, fn, path, depth + 1));
        }
        return { keys, partial };
      }
      const rec = callRecord(n, path);
      const ks = rec ? targets(rec, path) : [];
      if (ks.length !== 1) return { keys, partial: true };
      const def = funcs.get(ks[0]);
      for (const r of returnExprs(def.node)) add(dictKeys(r, def.node, def.path, depth + 1));
      return { keys, partial };
    }
    return { keys, partial: true };
  };

  /**
   * 도구의 리턴: {type, model?, list?, fields?, keys?, partial?}.
   * type은 리턴 타입 표시, 저장소 안 모델(Pydantic·TypedDict·dataclass 등)이면 그 필드, 딕셔너리를 돌려주면 키를 모은다.
   * keys[i] = {name, type, values, expr}: type은 값으로 짐작한 타입, values는 리터럴 값(최대 4개), expr은 타입을 모를 때 값 코드
   */
  const returnsOf = (fn, path) => {
    const typeNode = field(fn, 'return_type');
    const type = typeNode ? baseType(typeNode.text.replace(/\s+/g, ' ')) : null;
    // 타입에 나오는 저장소 안 클래스(list[Model], Optional[Model]도)
    const names = type?.match(/[A-Za-z_]\w*/g) ?? [];
    for (const name of names) {
      const def = classDef(name, path);
      if (def) return { type, model: name, list: /^(list|List|Sequence|tuple|Tuple)\b/.test(type), fields: modelFields(def) };
    }
    if (type && !/^(dict|Dict|Mapping|MutableMapping|Any|object)\b/.test(type)) return { type };
    // 리턴 식마다 모은 키를 합친다. 키마다 짐작한 타입(여럿이면 |)과 리터럴 값, 정할 수 없으면 식 코드
    const merged = new Map();
    let partial = false;
    for (const r of returnExprs(fn)) {
      const got = dictKeys(r, fn, path);
      partial ||= got.partial;
      for (const [k, v] of got.keys) {
        const m = merged.get(k) ?? { types: new Set(), literals: new Set(), expr: null };
        v.types.forEach(t => m.types.add(t));
        v.literals.forEach(l => m.literals.size < 4 && m.literals.add(l));
        m.expr ??= v.expr;
        merged.set(k, m);
      }
    }
    if (!merged.size) return { type };
    const keys = [...merged].map(([name, m]) => ({
      name, type: m.types.size ? [...m.types].join(' | ') : null, values: [...m.literals], expr: m.types.size ? null : m.expr,
    }));
    return { type, keys, partial };
  };

  // 도구 함수에서 너비 우선으로 따라가 호출되는 함수만 남긴다
  const reached = new Set();
  for (const t of tools) {
    const start = funcs.get(`${t.path}:${t.line}`);
    t.params = start ? paramsOf(start.node, n => value(n, start.path)) : [];
    if (start) t.returns = returnsOf(start.node, start.path);
    if (!t.description_expr) t.description ??= start ? docstring(start.node) : null; // FastMCP는 description이 없으면 docstring을 쓴다
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
  const flowsOf = paramFlows(funcs, targets, callRecord, fileSet);
  for (const t of tools) {
    const id = idOf.get(`${t.path}:${t.line}`);
    if (id === undefined) continue;
    t.fn = id;
    t.flows = flowsOf(`${t.path}:${t.line}`, t.params.map(p => p.name)).map(({ key, ...f }) => ({ ...f, fn: idOf.get(key) }));
  }
  return { functions };
}

// ── 도구 인자 흐름 ──

// 인자가 닿으면 남기는 저장소 밖 호출(graph의 ext 이름)과 종류
const FLOW_SINKS = [
  [/^subprocess\.(run|Popen|call|check_call|check_output|getoutput|getstatusoutput)$|^os\.(system|popen|exec\w*|spawn\w*)$|^asyncio\.create_subprocess_(exec|shell)$/, 'exec'],
  [/^(open|io\.open|codecs\.open|gzip\.open|bz2\.open|lzma\.open)$/, 'open'],
  [/^shutil\.(copy|copy2|copyfile|copytree|move|rmtree)$|^os\.(remove|unlink|rename|replace|rmdir|removedirs|makedirs|mkdir|truncate|chmod)$/, 'fs'],
  [/^sqlite3\.connect$/, 'sqlite'],
  [/^(requests|httpx)\.\w+$|^urllib\.request\.urlopen$|^socket\.create_connection$/, 'net'],
  [/^(eval|exec|pickle\.loads?|marshal\.loads?)$/, 'eval'],
];
const FLOW_DEPTH = 3; // 도구 함수에서 몇 번 호출을 건너 따라가는가
// 인자를 넣으면 그 객체도 인자 값을 담는 메서드: cmd.append(path)
const COLLECT_METHODS = new Set(['append', 'extend', 'insert', 'add', 'update', 'appendleft']);

/** 식 안의 변수 이름. x.attr의 attr, f(k=…)의 k처럼 변수가 아닌 이름은 뺀다 */
function varNames(n) {
  const out = new Set();
  if (!n) return out;
  for (const c of walk(n)) {
    if (c.type !== 'identifier') continue;
    const p = c.parent;
    if (p?.type === 'attribute' && field(p, 'attribute')?.startIndex === c.startIndex) continue;
    if (p?.type === 'keyword_argument' && field(p, 'name')?.startIndex === c.startIndex) continue;
    out.add(c.text);
  }
  return out;
}

/** 대입받는 변수 이름. self.x = …, x[k] = …는 따라가지 않는다 */
function targetNames(n) {
  if (!n) return [];
  if (n.type === 'identifier') return [n.text];
  if (/pattern|^(tuple|list|expression_list|parenthesized_expression)$/.test(n.type)) return n.namedChildren.flatMap(targetNames);
  return [];
}

/** 함수 정의의 매개변수 이름(위치 순). *args 같은 자리는 null */
function paramNames(fn) {
  return (field(fn, 'parameters')?.namedChildren ?? []).map(p =>
    p.type === 'identifier' ? p.text
      : p.type === 'typed_parameter' ? p.namedChildren.find(c => c.type === 'identifier')?.text ?? null
        : p.type === 'default_parameter' || p.type === 'typed_default_parameter' ? field(p, 'name')?.text ?? null
          : null);
}

/** open(…)의 모드: 'r'(읽기), 'w'(쓰기·추가·생성·갱신), '?'(코드만으로 못 정함) */
function openMode(call) {
  const m = positional(call)[1] ?? keywordArg(call, 'mode');
  if (!m) return 'r';
  const s = strConst(m);
  return s === null ? '?' : /[wax+]/.test(s) ? 'w' : 'r';
}

/**
 * 도구 인자 흐름을 구하는 함수를 만든다. 반환 함수(key, params)는 도구 함수(funcs의 key)와 인자 이름을 받아
 * [{param, kind, call, mode?, key, line}]을 돌려준다: 인자 param의 값이 key 함수 line 줄의 저장소 밖 호출 call(종류 kind)의 인자로 들어간다.
 * 값은 변수 이름으로 따라간다: 대입(x = f(p)), for·with·:=, cmd.append(p), 저장소 안 함수 호출의 인자 → 매개변수(FLOW_DEPTH번까지).
 * 이름이 같으면 같은 값으로 보므로 실제보다 넓게 잡힐 수 있고, 어느 객체인지 모르는 메서드 호출(path.open())은 따라가지 않는다
 */
function paramFlows(funcs, targets, callRecord, fileSet) {
  // 함수마다 한 번 만든다: 값이 옮겨 가는 곳 [{from, to}]과 호출 [{node, rec, args: [{names, pos?, kw?}]}]
  const facts = new Map();
  const factsOf = key => {
    if (facts.has(key)) return facts.get(key);
    const { node, path } = funcs.get(key);
    const moves = [], calls = [];
    for (const n of walk(field(node, 'body'))) {
      if (n.type === 'assignment' || n.type === 'augmented_assignment' || n.type === 'for_statement' || n.type === 'for_in_clause') {
        const right = field(n, 'right');
        if (right) moves.push({ from: varNames(right), to: targetNames(field(n, 'left')) });
      } else if (n.type === 'named_expression') {
        moves.push({ from: varNames(field(n, 'value')), to: targetNames(field(n, 'name')) });
      } else if (n.type === 'as_pattern') {
        moves.push({ from: varNames(n.namedChildren[0]), to: targetNames(field(n, 'alias')?.namedChildren[0] ?? field(n, 'alias')) });
      } else if (n.type === 'call') {
        const args = [];
        let pos = 0;
        for (const a of argNodes(n)) {
          if (a.type === 'keyword_argument') args.push({ names: varNames(field(a, 'value')), kw: field(a, 'name').text });
          else if (a.type === 'list_splat' || a.type === 'dictionary_splat') args.push({ names: varNames(a) });
          else args.push({ names: varNames(a), pos: pos++ });
        }
        const f = field(n, 'function');
        if (f?.type === 'attribute' && field(f, 'object').type === 'identifier' && COLLECT_METHODS.has(field(f, 'attribute').text)) {
          moves.push({ from: new Set(args.flatMap(a => [...a.names])), to: [field(f, 'object').text] });
        }
        calls.push({ node: n, rec: callRecord(n, path), args });
      }
    }
    const out = { moves, calls, path };
    facts.set(key, out);
    return out;
  };

  return (start, params) => {
    const out = new Map();
    for (const param of params) {
      const seen = new Set();
      const visit = (key, names, depth) => {
        const mark = `${key}|${[...names].sort().join(',')}`;
        if (seen.has(mark)) return;
        seen.add(mark);
        const { moves, calls, path } = factsOf(key);
        const tainted = new Set(names);
        for (let changed = true; changed;) {
          changed = false;
          for (const m of moves) {
            if (![...m.from].some(x => tainted.has(x))) continue;
            for (const t of m.to) if (!tainted.has(t)) { tainted.add(t); changed = true; }
          }
        }
        for (const { node, rec, args } of calls) {
          const hit = args.filter(a => [...a.names].some(x => tainted.has(x)));
          if (!hit.length || !rec) continue;
          const to = targets(rec, path);
          if (to.length) {
            if (depth >= FLOW_DEPTH) continue;
            for (const k of to) {
              const ps = paramNames(funcs.get(k).node);
              // obj.method(…)로 부르면 첫 매개변수(self·cls)는 obj다
              const skip = rec.base && (ps[0] === 'self' || ps[0] === 'cls') ? 1 : 0;
              const next = new Set(hit.map(a => (a.kw ?? (a.pos !== undefined ? ps[a.pos + skip] : null))).filter(Boolean));
              if (next.size) visit(k, next, depth + 1);
            }
            continue;
          }
          const ext = rec.module && !moduleFile(rec.module, path, fileSet) ? `${rec.module}.${rec.callee}`
            : !rec.module && !rec.base && BUILTIN_CALLS.has(rec.callee) ? rec.callee : null;
          const kind = ext && FLOW_SINKS.find(([re]) => re.test(ext))?.[1];
          if (!kind) continue;
          const flow = { param, kind, call: ext, ...(kind === 'open' && { mode: openMode(node) }), key, line: line(node) };
          out.set(`${param}|${key}|${flow.line}|${ext}|${flow.mode ?? ''}`, flow);
        }
      };
      visit(start, new Set([param]), 0);
    }
    return [...out.values()];
  };
}

// ── 도구 밖의 MCP 기능: 서버, 리소스, 프롬프트 ──

// 서버 객체를 만드는 클래스 → 화면 표기. 같은 이름이라도 import한 모듈로 구분한다
const SERVER_CLASSES = [
  ['FastMCP', /^fastmcp(\.|$)/, 'FastMCP'],
  ['FastMCP', /^mcp\.server\.fastmcp/, 'FastMCP (MCP SDK)'],
  ['MCPServer', /^mcp\./, 'MCPServer (MCP SDK)'],
  ['Server', /^mcp\.server(\.lowlevel)?(\.|$)/, 'MCP SDK 저수준'],
];
// 전송 방식: run(transport=…)가 없으면 stdio. 아래 메서드는 이름으로 방식을 정한다
const TRANSPORT_METHODS = {
  run_stdio_async: 'stdio', sse_app: 'sse', run_sse_async: 'sse',
  streamable_http_app: 'streamable-http', run_streamable_http_async: 'streamable-http', http_app: 'http',
};
/**
 * 도구 밖의 MCP 기능:
 *   servers    서버 객체 {name, sdk, path, line, instructions}. instructions는 클라이언트 모델이 받는 서버 설명이다
 *   transports 전송 방식
 *   resources  @x.resource(uri) {uri, name, description, mime, template, params, path, line, end}
 *   prompts    @x.prompt() {name, description, params, path, line, end}
 * 모두 코드에 쓰인 대로 읽는다
 */
function mcpFeatures({ trees, imports }, value) {
  const servers = [], resources = [], prompts = [], transports = new Set();
  const vars = new Set(); // 서버 객체를 담은 변수 이름
  for (const [path, tree] of trees) {
    const imp = imports.get(path);
    const str = n => value(n, path);
    for (const n of walk(tree.rootNode)) {
      if (n.type !== 'call') continue;
      const f = field(n, 'function');
      const cls = calleeName(f);
      const from = f ? moduleOf(f, imp) : '';
      const kind = SERVER_CLASSES.find(([c, mod]) => c === cls && mod.test(from));
      if (!kind) continue;
      const inst = keywordArg(n, 'instructions');
      const instructions = inst ? str(inst) : null;
      servers.push({
        name: explicitName(n, str), sdk: kind[2], path, line: line(n), instructions,
        ...(inst && instructions === null && { instructions_expr: snippet(inst) }),
      });
      const left = n.parent?.type === 'assignment' ? field(n.parent, 'left') : null;
      if (left?.type === 'identifier') vars.add(left.text);
    }
  }
  for (const [path, tree] of trees) {
    const str = n => value(n, path);
    // from app import mcp as mcp_server. 함수 안에서 import하는 경우도 있어 파일 전체에서 별칭을 모은다
    const alias = new Map();
    for (const n of walk(tree.rootNode)) if (n.type === 'aliased_import') alias.set(field(n, 'alias').text, field(n, 'name').text.split('.').pop());
    const isServer = name => vars.has(name) || vars.has(alias.get(name));
    for (const n of walk(tree.rootNode)) {
      if (n.type === 'decorated_definition') {
        const fn = n.namedChildren.find(c => c.type === 'function_definition');
        for (const dec of n.namedChildren.filter(c => c.type === 'decorator')) {
          const expr = dec.namedChildren.find(c => c.type !== 'comment');
          const call = expr?.type === 'call' ? expr : null;
          const f = call ? field(call, 'function') : expr;
          const attr = f?.type === 'attribute' ? field(f, 'attribute').text : null;
          if (!fn || (attr !== 'resource' && attr !== 'prompt')) continue;
          const desc = descriptionOf(call, str);
          if (!desc.description_expr) desc.description ??= docstring(fn);
          const common = { ...desc, params: paramsOf(fn, str), path, line: line(fn), end: fn.endPosition.row + 1 };
          if (attr === 'prompt') {
            prompts.push({ name: (call ? explicitName(call, str) : null) ?? field(fn, 'name').text, ...common });
          } else {
            const uri = call ? (keywordStr(call, 'uri', str) ?? (positional(call)[0] ? str(positional(call)[0]) : null)) : null;
            resources.push({
              uri, name: (call ? keywordStr(call, 'name', str) : null) ?? field(fn, 'name').text,
              mime: call ? keywordStr(call, 'mime_type', str) : null, template: /\{[^}]+\}/.test(uri ?? ''), ...common,
            });
          }
        }
      }
      if (n.type !== 'call') continue;
      const f = field(n, 'function');
      if (f?.type !== 'attribute') continue;
      const callee = field(f, 'attribute').text;
      const obj = field(f, 'object');
      if (isServer(obj.text)) {
        if (callee === 'run' || callee === 'run_async') {
          const t = keywordArg(n, 'transport');
          transports.add(t ? str(t) ?? snippet(t, 30) : 'stdio');
        } else if (TRANSPORT_METHODS[callee]) transports.add(TRANSPORT_METHODS[callee]);
      }
    }
  }
  return { servers, transports: [...transports].sort(), resources: resources.sort(byLoc), prompts: prompts.sort(byLoc) };
}

// ── MCP SDK 버전과 규격 ──

// mcp 패키지 버전 → 그 버전이 지원하는 가장 새 MCP 규격. PyPI 배포 파일의 LATEST_PROTOCOL_VERSION(1.x는 mcp,
// 2.x는 mcp-types 패키지)에서 확인했다. 새 SDK가 새 규격을 지원하면 여기에 더한다
const OLDEST_PROTOCOL = '2024-11-05'; // 모든 릴리스가 지원하는 가장 오래된 규격(2.x의 OLDEST_SUPPORTED_VERSION)
const MCP_SDK_PROTOCOLS = [
  ['0', '2024-11-05'],
  ['1.9.0', '2025-03-26'],
  ['1.10.0', '2025-06-18'],
  ['1.23.1', '2025-11-25'],
  ['2.0.0', '2026-07-28'],
];
// fastmcp 버전 → 요구하는 가장 낮은 mcp 버전(requires_dist). 3.3부터는 fastmcp-slim이 요구한다
const FASTMCP_MCP = [
  ['2.0.0', '1.6.0'],
  ['3.0.0', '1.24.0'],
  ['4.0.0', '2.0.0'],
];

/** "1.23.1" → 비교용 {nums: 릴리스 숫자, pre: 시험판(rc·dev 등)인가} */
function versionKey(v) {
  const [, release = '', rest = ''] = String(v).match(/^\s*v?(\d+(?:\.\d+)*)(.*)$/) ?? [];
  return { nums: release ? release.split('.').map(Number) : [], pre: /^[-_.]?(a|b|c|rc|alpha|beta|pre|preview|dev)\d*/i.test(rest) };
}
// 1.2.0.2처럼 자리 수가 달라도 빈 자리는 0으로 본다. 1.0rc1은 1.0보다 낮다
export const versionAtLeast = (v, min) => {
  const a = versionKey(v), b = versionKey(min);
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const x = a.nums[i] ?? 0, y = b.nums[i] ?? 0;
    if (x !== y) return x > y;
  }
  return !a.pre || b.pre;
};
const lookup = (table, v) => table.filter(([min]) => versionAtLeast(v, min)).pop()?.[1] ?? null;

const range = latest => (latest ? { oldest: OLDEST_PROTOCOL, latest } : { oldest: null, latest: null });

/** 버전 조건(">=1.0.0", "==1.27.2", "^1.2", ">=1.28,<2")에서 가장 낮은 버전. "<2"처럼 하한이 없으면 null */
const lowerBound = spec =>
  (spec.match(/(?:>=|===|==|~=|\^|~)\s*(\d[\w.]*)/) ?? spec.match(/^\s*(\d[\w.]*)\s*$/))?.[1] ?? null;

// 패키지 이름 뒤에 올 수 있는 것: 끝, 공백, [extras], 버전 조건, 환경 표시(;). mcp-server-git 같은 다른 이름을 거른다
const SDK_NAME = /^\s*(mcp|fastmcp)(?=$|[\s[<>=~!;(])(?:\[[^\]]*\])?\s*([^;#]*)/;
// 모든 패키지 이름과 조건(readDeps가 쓴다)
const ANY_NAME = /^\s*([A-Za-z0-9][\w.-]*)(?:\[[^\]]*\])?\s*([^;#]*)/;

/**
 * pyproject.toml의 의존성에서 nameRe에 맞는 패키지 조건: [{pkg, spec, main}]. main은 실행용 의존성(dev·optional이 아님).
 * [project] dependencies, [project.optional-dependencies], [dependency-groups], tool.uv의 dev-dependencies,
 * poetry의 [tool.poetry.dependencies]·group·dev-dependencies만 본다. keywords 같은 다른 배열은 보지 않는다
 */
function pyprojectDeps(text, nameRe = SDK_NAME) {
  const out = [];
  let table = '', array = null; // array: 지금 읽는 의존성 배열이 실행용이면 true, dev·optional이면 false, 의존성이 아니면 'skip'
  const take = (str, main) => {
    const m = str.match(nameRe);
    if (m) out.push({ pkg: m[1], spec: m[2].trim(), main });
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (array !== null) {
      if (array !== 'skip') for (const m of line.matchAll(/["']([^"']*)["']/g)) take(m[1], array);
      if (line.includes(']')) array = null;
      continue;
    }
    const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) { table = header[1].trim(); continue; }
    const assign = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!assign) continue;
    const [, key, rest] = assign;
    if (rest.startsWith('[')) {
      const kind = table === 'project' && key === 'dependencies' ? true
        : table === 'project.optional-dependencies' || table === 'dependency-groups' || (table === 'tool.uv' && key === 'dev-dependencies') ? false
        : 'skip';
      if (kind !== 'skip') for (const m of rest.matchAll(/["']([^"']*)["']/g)) take(m[1], kind);
      if (!rest.includes(']')) array = kind;
    } else if (/^tool\.poetry\.(dependencies|dev-dependencies|group\.[^.]+\.dependencies)$/.test(table) && key !== 'python' && nameRe.test(key)) {
      // mcp = "^1.2" 또는 mcp = { version = "^1.2", extras = [...] }
      const spec = rest.match(/^["']([^"']*)["']/)?.[1] ?? rest.match(/version\s*=\s*["']([^"']*)["']/)?.[1] ?? '';
      out.push({ pkg: key, spec, main: table === 'tool.poetry.dependencies' });
    }
  }
  return out;
}

/** 의존성 파일을 얕은 경로부터(같으면 경로 순) */
const byDepth = depFiles => {
  const depth = p => p.split('/').length;
  return [...depFiles].sort((a, b) => depth(a[0]) - depth(b[0]) || (a[0] < b[0] ? -1 : 1));
};

/** pyproject.toml·requirements*.txt에서 nameRe에 맞는 패키지 조건: [{pkg, spec, main}]. requirements-dev.txt·requirements-test.txt는 개발용으로 본다 */
function declaredDeps(path, text, nameRe) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base === 'pyproject.toml') return pyprojectDeps(text, nameRe);
  return text.split('\n').flatMap(l => {
    const m = l.match(nameRe);
    // pip-compile --generate-hashes의 줄 끝 \는 조건이 아니다
    return m ? [{ pkg: m[1], spec: m[2].replace(/\\\s*$/, '').trim(), main: !/dev|test/i.test(base) }] : [];
  });
}

/**
 * 의존성 파일에서 MCP SDK(mcp 또는 fastmcp) 버전을 읽고 지원하는 규격을 정한다.
 * lock 파일(uv.lock, poetry.lock)에 있으면 그 버전(exact), 아니면 pyproject.toml·requirements*.txt의 조건에서
 * 가장 낮은 버전(atLeast: 설치할 때 더 새 버전이 들어올 수 있다). fastmcp만 적혀 있으면 fastmcp가 요구하는 mcp로 바꿔 본다.
 * 결과: {package, version, spec, source, exact, atLeast, oldest, latest, via, pinned} 또는 null(의존성 파일에 없음).
 * pinned는 패키지마다 정확히 아는 버전(lock 파일, == 조건)이다. fastmcp 서버도 lock 파일에는 mcp가 함께 있어 package는 mcp가 된다
 * oldest~latest가 지원하는 규격 범위다. 실제 통신 규격은 이 안에서 클라이언트가 요청한 것으로 정해진다
 */
export function readSdk(depFiles) {
  const locked = {}, declared = {};
  for (const [path, text] of byDepth(depFiles)) {
    if (path.endsWith('.lock')) {
      for (const p of lockPackages(text)) {
        if ((p.name === 'mcp' || p.name === 'fastmcp') && p.version && !locked[p.name]) locked[p.name] = { version: p.version, source: path };
      }
      continue;
    }
    // 실행용 의존성을 개발용보다 먼저 쓴다
    for (const { pkg, spec, main } of declaredDeps(path, text, SDK_NAME)) {
      if (!declared[pkg] || (main && !declared[pkg].main)) declared[pkg] = { spec, source: path, main };
    }
  }
  const pinned = {};
  for (const pkg of ['mcp', 'fastmcp']) {
    const pin = locked[pkg]?.version ?? declared[pkg]?.spec.match(/^==\s*([\d.]+)$/)?.[1];
    if (pin) pinned[pkg] = pin;
  }
  // 실제 규격을 구현하는 것은 mcp 패키지라 mcp를 먼저 본다
  for (const pkg of ['mcp', 'fastmcp']) {
    const l = locked[pkg];
    if (!l) continue;
    const mcpMin = pkg === 'fastmcp' ? lookup(FASTMCP_MCP, l.version) : l.version;
    return {
      package: pkg, version: l.version, spec: null, source: l.source, exact: pkg === 'mcp', atLeast: pkg !== 'mcp',
      ...range(mcpMin && lookup(MCP_SDK_PROTOCOLS, mcpMin)), ...(pkg === 'fastmcp' && { via: `mcp ${mcpMin} 이상` }), pinned,
    };
  }
  // 선언만 있으면 실행용 의존성을 먼저, 그다음 mcp를 본다
  for (const pkg of ['mcp', 'fastmcp'].filter(p => declared[p]).sort((x, y) => declared[y].main - declared[x].main)) {
    const d = declared[pkg];
    const low = d.spec ? lowerBound(d.spec) : null;
    const mcpMin = low && (pkg === 'fastmcp' ? lookup(FASTMCP_MCP, low) : low);
    const exact = pkg === 'mcp' && /^==\s*[\d.]+$/.test(d.spec);
    return {
      package: pkg, version: exact ? low : null, spec: d.spec, source: d.source, exact, atLeast: !exact,
      ...range(mcpMin ? lookup(MCP_SDK_PROTOCOLS, mcpMin) : null), ...(pkg === 'fastmcp' && mcpMin && { via: `mcp ${mcpMin} 이상` }), pinned,
    };
  }
  return null;
}

// PyPI 이름 정규화(PEP 503): Foo_Bar.baz → foo-bar-baz
export const normName = n => n.toLowerCase().replace(/[-_.]+/g, '-');
// 개발용으로 보는 묶음 이름(optional-dependencies의 dev, dependency-groups의 test 등)
const DEV_GROUP = /^(dev|devel|develop|test|tests|testing|lint|linting|typing|docs?|ci)$/i;

/**
 * lock 파일의 [[package]] 블록을 읽는다(uv.lock·poetry.lock 공통).
 * 결과: [{name, version, source, deps, optional, groups}].
 * source는 uv의 source 종류(registry·editable·virtual·git·path·directory·url)나 poetry의 [package.source] type.
 * deps·optional[묶음]·groups[묶음]은 [{name, version, extra}] (uv.lock만. poetry.lock은 category를 groups 대신 쓴다)
 */
function lockPackages(text) {
  const out = [];
  for (const block of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const pkg = { name: null, version: null, source: 'registry', category: null, deps: [], optional: {}, groups: {} };
    let table = '', key = null, buf = '';
    const flush = () => {
      // 항목 안에 source = { … }가 있을 수 있어 중괄호 한 겹까지 받는다
      const entries = [...buf.matchAll(/\{\s*name\s*=\s*"([^"]+)"((?:[^{}]|\{[^{}]*\})*)\}/g)].map(([, name, rest]) => ({
        name: normName(name),
        version: rest.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? null,
        extra: [...(rest.match(/extra\s*=\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]),
      }));
      if (table === '' && key === 'dependencies') pkg.deps = entries;
      else if (table === 'package.optional-dependencies') pkg.optional[key] = entries;
      else if (table === 'package.dev-dependencies') pkg.groups[key] = entries;
      key = null;
      buf = '';
    };
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (key !== null) {
        if (line === ']') flush();
        else buf += line + '\n';
        continue;
      }
      const header = line.match(/^\[([^\]]+)\]$/);
      if (header) { table = header[1].trim(); continue; }
      const assign = line.match(/^"?([\w.-]+)"?\s*=\s*(.*)$/);
      if (!assign) continue;
      const [, k, rest] = assign;
      if (table === '' && k === 'name') pkg.name = normName(rest.replace(/"/g, ''));
      else if (table === '' && k === 'version') pkg.version = rest.replace(/"/g, '');
      else if (table === '' && k === 'category') pkg.category = rest.replace(/"/g, '');
      else if (table === '' && k === 'source') pkg.source = rest.match(/^\{\s*(\w+)/)?.[1] ?? 'registry';
      else if (table === 'package.source' && k === 'type') pkg.source = rest.replace(/"/g, '');
      else if (rest.startsWith('[')) {
        key = k;
        buf = rest.slice(1);
        if (rest.trimEnd().endsWith(']')) { buf = buf.replace(/\]\s*$/, ''); flush(); }
      }
    }
    if (pkg.name) out.push(pkg);
  }
  return out;
}

/**
 * uv.lock 패키지마다 쓰임을 정한다: 프로젝트(editable·virtual)의 dependencies에서 닿으면 main,
 * 개발용이 아닌 optional-dependencies에서만 닿으면 extra(그 묶음 이름을 group에), 개발용 묶음에서만 닿으면 dev.
 * 어디서도 닿지 않으면 null
 */
function uvScopes(pkgs) {
  const byName = new Map();
  for (const p of pkgs) {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(p);
  }
  const scope = new Map(); // 패키지 → {scope, group}. main → extra → dev 순서로 따라가서 처음 정한 것을 쓴다
  const visited = new Set();
  // 의존성 항목 하나가 가리키는 패키지들. 같은 이름이 여러 버전이면 version으로 고른다
  const matches = e => (byName.get(e.name) ?? []).filter(p => !e.version || p.version === e.version);
  const spread = (seeds, s, group) => {
    const queue = [...seeds];
    for (let i = 0; i < queue.length; i++) {
      const e = queue[i];
      for (const p of matches(e)) {
        if (!scope.has(p)) scope.set(p, { scope: s, group });
        // 같은 패키지라도 extra를 달리 요구하면 그 extra의 의존성을 더 따라간다
        const mark = `${p.name}@${p.version}[${e.extra.join(',')}]`;
        if (visited.has(mark)) continue;
        visited.add(mark);
        queue.push(...p.deps, ...e.extra.flatMap(x => p.optional[x] ?? []));
      }
    }
  };
  const roots = pkgs.filter(p => p.source === 'editable' || p.source === 'virtual');
  for (const r of roots) scope.set(r, { scope: 'main', group: null });
  spread(roots.flatMap(r => r.deps), 'main', null);
  for (const r of roots) {
    for (const [g, entries] of Object.entries(r.optional)) if (!DEV_GROUP.test(g)) spread(entries, 'extra', g);
  }
  for (const r of roots) {
    for (const [g, entries] of Object.entries(r.optional)) if (DEV_GROUP.test(g)) spread(entries, 'dev', g);
    for (const [g, entries] of Object.entries(r.groups)) spread(entries, 'dev', g);
  }
  return scope;
}

/**
 * 의존성 파일에서 서버가 쓰는 패키지와 정확한 버전을 읽는다. 취약점 조회(osv.mjs)에 넘긴다.
 * lock 파일(uv.lock, poetry.lock)이 있으면 가장 얕은 lock 파일 하나만 쓴다. 없으면 requirements*.txt의 == 고정 버전을 쓴다.
 * 결과: {source, packages, skipped, unpinned} 또는 null(의존성 파일 없음).
 *   packages  [{name, version, scope, group}]. scope는 main(실행용)·extra(선택 설치)·dev(개발용)·null(구분 못함)
 *   skipped   PyPI 패키지가 아니라 조회하지 않는 것: [{name, version, reason}](git·경로 설치 등)
 *   unpinned  버전이 정해지지 않아 조회하지 않는 것: [{name, spec, source}]
 */
export function readDeps(depFiles) {
  const depth = p => p.split('/').length;
  const files = byDepth(depFiles);
  // 같은 깊이에 둘 다 있으면 uv.lock을 쓴다
  const locks = files.filter(([p]) => p.endsWith('.lock'));
  const lock = locks.find(([p]) => p.endsWith('uv.lock') && depth(p) === depth(locks[0][0])) ?? locks[0];
  if (lock) {
    const [path, text] = lock;
    const pkgs = lockPackages(text);
    const scopes = path.endsWith('uv.lock') ? uvScopes(pkgs) : null;
    const packages = [], skipped = [];
    for (const p of pkgs) {
      if (p.source === 'editable' || p.source === 'virtual') continue; // 프로젝트 자신
      if (!p.version || !['registry', 'legacy'].includes(p.source)) {
        skipped.push({ name: p.name, version: p.version, reason: p.source });
        continue;
      }
      const s = scopes?.get(p);
      const scope = scopes ? s?.scope ?? null : p.category === 'main' ? 'main' : p.category === 'dev' ? 'dev' : null;
      packages.push({ name: p.name, version: p.version, scope, group: s?.group ?? null });
    }
    return { source: path, packages, skipped, unpinned: [] };
  }
  if (!files.length) return null;
  const packages = [], unpinned = [];
  for (const [path, text] of files) {
    // URL·경로 설치(pkg @ git+…, git+https://…)는 건너뛴다. -r·-e 같은 옵션 줄은 ANY_NAME에 맞지 않는다
    for (const { pkg, spec, main } of declaredDeps(path, text, ANY_NAME).filter(d => !/@|:\/\//.test(d.spec))) {
      const name = normName(pkg);
      const pin = spec.match(/^===?\s*([\w.+!-]+)$/)?.[1];
      if (pin && !packages.some(p => p.name === name && p.version === pin)) {
        packages.push({ name, version: pin, scope: main ? 'main' : 'dev', group: null });
      } else if (!pin && !unpinned.some(u => u.name === name)) {
        unpinned.push({ name, spec, source: path });
      }
    }
  }
  return { source: files.map(([p]) => p).join(', '), packages, skipped: [], unpinned: unpinned.filter(u => !packages.some(p => p.name === u.name)) };
}

/** files: [경로, 내용] 목록(경로 순). parser: Python 문법을 넣은 web-tree-sitter Parser */
export function extractPython(files, parser) {
  const trees = [];
  try {
    for (const [path, text] of files) {
      const tree = parser.parse(text);
      if (tree) trees.push([path, tree]);
    }
    // 파일마다 import와 저장소 파일 목록은 한 번만 만들어 함께 쓴다
    const src = { trees, imports: new Map(trees.map(([p, t]) => [p, importsOf(t.rootNode)])), fileSet: new Set(trees.map(([p]) => p)) };
    const value = stringResolver(src);
    const { tools, dynamic } = findTools(src, value);
    return { tools, dynamic, graph: buildGraph(src, tools, value), mcp: mcpFeatures(src, value) };
  } finally {
    for (const [, tree] of trees) tree.delete();
  }
}
