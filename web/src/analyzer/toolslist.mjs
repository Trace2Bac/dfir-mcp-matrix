// MCP 클라이언트가 tools/list로 받을 도구 항목의 추정. 분석 화면(components/Analyze)이 쓴다.
// 코드에서 읽은 이름·제목·설명·인자·리턴·힌트로 만든다. 실제 스키마는 SDK가 Pydantic으로 만들므로 title, $defs 같은 세부는 다를 수 있다.
//
// inputSchema: 코드에 직접 쓴 스키마(저수준 Tool)가 있으면 그것, 없으면 인자로 만든다.
// outputSchema: SDK가 리턴 타입으로 만드는 규칙을 따른다. 규칙은 SDK 배포 파일에서 확인했다.
//   MCP SDK  mcp/server/{fastmcp,mcpserver}/utilities/func_metadata.py. 1.9에는 없고 1.10부터 만든다
//   fastmcp  fastmcp/tools/tool.py, function_parsing.py. 2.9에는 없고 2.10부터 만든다
//   실제 SDK(mcp 1.12.4·2.3.0, fastmcp 2.12.4·3.0.0·3.2.0·4.1.3)가 만든 tools/list와 맞춰 보았다(title과 $defs는 빼고).
//   fastmcp는 판마다 다르다: 3부터 inputSchema에 additionalProperties: false, 4부터 감싼 스키마의 description이 빠지고
//   항목 타입 없는 list 리턴에는 스키마를 만들지 않는다. 버전을 모르면 최신 판의 규칙을 쓴다.
//   SDK 버전마다 갈리는 경우(콘텐츠 블록, CallToolResult 등)와 코드만으로 정할 수 없는 경우는 스키마 대신 이유를 돌려준다.

import { versionAtLeast } from './python.mjs';

// 대괄호 밖의 sep로 나눈다: "Dict[str, int], str" → ["Dict[str, int]", "str"]
function splitTop(s, sep) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']') depth--;
    else if (s[i] === sep && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  return [...out, s.slice(start).trim()];
}

// 파이썬 리터럴 → JSON 값. 읽지 못하면 undefined
function literal(code) {
  if (/^-?\d+(\.\d+)?$/.test(code)) return Number(code);
  if (/^(['"]).*\1$/s.test(code) && !code.startsWith('"""')) return code.slice(1, -1);
  return { True: true, False: false, None: null }[code];
}

const JSON_TYPES = {
  str: 'string', int: 'integer', float: 'number', bool: 'boolean',
  list: 'array', List: 'array', tuple: 'array', Tuple: 'array', set: 'array', Set: 'array', Sequence: 'array',
  dict: 'object', Dict: 'object', Mapping: 'object',
};

// 타입 표시를 나눈다: "Optional[list[str]]" → {base: "Optional", args: ["list[str]"]}. typing.과 문자열 따옴표는 벗긴다
function parseType(type) {
  const t = type.trim().replace(/^(['"])(.*)\1$/s, '$2').replace(/^typing\./, '');
  const m = t.match(/^(\w+)\[(.*)\]$/s);
  return { t, base: m ? m[1] : t, args: m ? splitTop(m[2], ',') : [] };
}

// Literal 값이 모두 같은 JSON 타입이면 그 타입(Pydantic이 enum에 붙인다)
const enumType = values => {
  const types = new Set(values.map(v => (v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v)));
  const [t] = types;
  return types.size === 1 ? { string: 'string', integer: 'integer', number: 'number', boolean: 'boolean' }[t] : undefined;
};

/**
 * 타입 표시 → JSON Schema. Pydantic처럼 X | None과 Optional[X]은 anyOf에 null을 둔다. 모르는 타입은 빈 스키마다.
 * models: 저장소 안 모델 이름 → 스키마(리턴 모델)
 */
function schemaOf(type, models = {}) {
  if (!type) return {};
  const whole = parseType(type).t;
  const arms = splitTop(whole, '|');
  if (arms.length > 1) return { anyOf: arms.map(a => schemaOf(a, models)) };
  const { t, base, args } = parseType(whole);
  if (t === 'None') return { type: 'null' };
  if (models[t]) return models[t];
  if (base === 'Annotated') return schemaOf(args[0], models);
  if (base === 'Optional') return schemaOf(`${args[0]} | None`, models);
  if (base === 'Union') return schemaOf(args.join(' | '), models);
  if (base === 'Literal') {
    const values = args.map(literal);
    if (!values.every(v => v !== undefined)) return {};
    const type = enumType(values);
    return { enum: values, ...(type && { type }) };
  }
  const json = JSON_TYPES[base];
  if (!json) return {};
  if (json === 'array' && args[0] && base !== 'tuple' && base !== 'Tuple') return { type: json, items: schemaOf(args[0], models) };
  if (json === 'object' && args.length === 2) {
    const v = schemaOf(args[1], models);
    return { type: json, additionalProperties: Object.keys(v).length ? v : true };
  }
  return { type: json };
}

// 인자·필드 목록 → 객체 스키마. closed면 additionalProperties: false(fastmcp 3 이상의 inputSchema)
function objectSchema(params, closed = false) {
  const properties = {};
  for (const p of params) {
    const def = p.required || p.default === null ? undefined : literal(p.default);
    properties[p.name] = {
      ...schemaOf(p.type),
      ...(p.description && { description: p.description }),
      ...(def !== undefined && { default: def }),
    };
  }
  const required = params.filter(p => p.required).map(p => p.name);
  return { type: 'object', properties, ...(required.length && { required }), ...(closed && { additionalProperties: false }) };
}

// SDK가 MCP 콘텐츠로 돌려보내는 타입. outputSchema를 만들지 않거나(fastmcp, MCP SDK 2.x 후반) 버전마다 다르다(MCP SDK)
const CONTENT_TYPES = /\b(CallToolResult|ToolResult|ContentBlock|TextContent|ImageContent|AudioContent|EmbeddedResource|ResourceLink|Image|Audio|File)\b/;

/**
 * 서버가 쓰는 SDK. 서버 객체가 fastmcp의 FastMCP면 fastmcp, 아니면 MCP SDK다. 서버 객체를 못 찾으면 의존성 파일로 정한다.
 * version은 lock 파일이나 == 조건으로 정확히 안 버전만 쓴다(조건의 가장 낮은 버전은 실제 설치 버전이 아니다)
 */
export function sdkOf(mcp) {
  const fast = mcp.servers.length
    ? mcp.servers.some(s => s.sdk === 'FastMCP')
    : mcp.sdk?.package === 'fastmcp' || !!mcp.sdk?.pinned?.fastmcp;
  const framework = fast ? 'fastmcp' : 'mcp';
  return { framework, version: mcp.sdk?.pinned?.[framework] ?? null };
}

// fastmcp 판의 첫 숫자. 모르면 최신 판으로 본다
const fastMajor = version => (version ? Number(version.split('.')[0]) : Infinity);

/**
 * outputSchema 추정: {schema} | {none: 이유}(SDK가 만들지 않음) | {unknown: 이유}(코드만으로 정할 수 없음).
 * MCP SDK와 fastmcp는 리턴 타입이 객체 스키마가 아니면 {"result": …}로 감싼다(fastmcp는 x-fastmcp-wrap-result 표시를 단다)
 */
export function outputSchemaOf(tool, { framework, version }) {
  const fast = framework === 'fastmcp';
  if (tool.output_schema === null) return { none: 'output_schema=None' };
  if (tool.output_schema !== undefined) return { schema: tool.output_schema };
  if (tool.output_schema_expr) return { unknown: `실행 시 결정: ${tool.output_schema_expr}` };
  if (tool.fn === undefined) return { none: '저수준 Tool에 outputSchema가 없다' };
  if (tool.structured_output === 'False') return { none: 'structured_output=False' };
  if (tool.structured_output && tool.structured_output !== 'True') return { unknown: `실행 시 결정: structured_output=${tool.structured_output}` };
  if (version && !versionAtLeast(version, fast ? '2.10.0' : '1.10.0')) {
    return { none: `${framework} ${version}은 outputSchema를 만들지 않는다(${fast ? '2.10' : '1.10'}부터 만든다)` };
  }
  const r = tool.returns;
  if (!r?.type) return { none: '리턴 타입 표시가 없다' };

  // 저장소 안 모델: 필드가 있으면 객체 스키마. 필드가 없는 클래스(Enum 등)는 MCP SDK가 스키마를 만들지 않는다
  const models = {};
  if (r.model) {
    if (r.fields?.length) models[r.model] = objectSchema(r.fields);
    else if (!fast && parseType(r.type).t === r.model) return { none: `필드 타입 표시가 없는 클래스 ${r.model}` };
    else return { unknown: `필드 타입 표시가 없는 클래스 ${r.model}` };
  }
  const { t, base, args } = parseType(r.type);
  if (!r.model && CONTENT_TYPES.test(t)) {
    return fast ? { none: '콘텐츠 블록을 돌려준다' } : { unknown: 'MCP 콘텐츠·CallToolResult 리턴은 SDK 버전마다 다르다' };
  }

  const wrap = s => ({
    ...(fast && fastMajor(version) < 4 && { description: 'Generic wrapper for non-object return types.' }),
    type: 'object', properties: { result: s }, required: ['result'], ...(fast && { 'x-fastmcp-wrap-result': true }),
  });
  if (models[t]) return { schema: models[t] };
  if (t === 'None') return fast ? { none: 'None 리턴' } : { schema: wrap({ type: 'null' }) };
  if (t === 'Any') return fast ? { none: 'Any 리턴' } : { unknown: 'Any 리턴은 Python 버전마다 다르다' };
  if (['object', 'bytes', 'Dict', 'Mapping', 'List'].includes(t)) return { unknown: `${t} 리턴은 SDK 버전마다 다르다` };
  if (t === 'dict') return fast ? { schema: { type: 'object', additionalProperties: true } } : { none: '인자 없는 dict 리턴' };
  if (t === 'list' || t === 'tuple') {
    return fast && fastMajor(version) < 4 ? { schema: wrap({ type: 'array', items: {} }) } : { none: `항목 타입이 없는 ${t} 리턴` };
  }
  if (['str', 'int', 'float', 'bool'].includes(t)) return { schema: wrap(schemaOf(t)) };

  const s = schemaOf(t, models);
  if (!Object.keys(s).length) return { unknown: `저장소 밖 타입 ${t}` };
  // dict[str, V]는 객체 스키마 그대로다. MCP SDK는 typing.Dict[…]와 str이 아닌 키를 감싼다
  if (base === 'dict' || base === 'Dict' || base === 'Mapping') {
    return { schema: fast || (base === 'dict' && args[0] === 'str') ? s : wrap(s) };
  }
  return { schema: wrap(s) };
}

/** tools/list의 도구 항목 하나와, 스키마를 만들지 못한 이유(notes) */
export function toolsListEntry(tool, sdk) {
  const out = outputSchemaOf(tool, sdk);
  const input = tool.input_schema_expr
    ? undefined
    : tool.input_schema ?? objectSchema(tool.params, sdk.framework === 'fastmcp' && fastMajor(sdk.version) >= 3);
  const entry = {
    name: tool.name,
    ...(tool.title && { title: tool.title }),
    ...(tool.description && { description: tool.description }),
    ...(input && { inputSchema: input }),
    ...(out.schema && { outputSchema: out.schema }),
    ...(tool.annotations && { annotations: tool.annotations }),
  };
  const notes = [
    tool.input_schema_expr && `inputSchema 모름: 실행 시 결정: ${tool.input_schema_expr}`,
    out.none && `outputSchema 없음: ${out.none}`,
    out.unknown && `outputSchema 모름: ${out.unknown}`,
  ].filter(Boolean);
  return { entry, notes };
}
