const SEPARATORS = [
  '&&', '||', ';;', ';&', '|&', '|', ';', '&', '\n',
];

const OPAQUE_TOKENS = new Set(['$', '`', '<', '>']);

function isWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

function separatorAt(command, index) {
  for (const separator of SEPARATORS) {
    if (command.startsWith(separator, index)) return separator;
  }
  return undefined;
}

/**
 * Conservative shell lexer. It intentionally does not implement bash parsing.
 * Unknown constructs are opaque and therefore require a human decision.
 */
export function splitCommand(command, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  if (typeof command !== 'string' || command.trim() === '') {
    return { ok: false, reason: '命令为空或不是字符串', segments: [] };
  }

  const result = splitLevel(command, 0, maxDepth);
  return result;
}

function splitLevel(command, depth, maxDepth) {
  if (depth > maxDepth) {
    return { ok: false, reason: `shell 递归深度超过 ${maxDepth}`, segments: [] };
  }

  const segments = [];
  let current = '';
  let quote = undefined;
  let escaped = false;
  let opaque = false;
  let opaqueReason = '';

  const flush = () => {
    const text = current.trim();
    if (text) segments.push(text);
    current = '';
  };

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }

    if (quote) {
      current += char;
      if (quote === '"' && (char === '$' || char === '`')) {
        opaque = true;
        opaqueReason = char === '$' ? '命令含有变量或命令替换' : '命令含有反引号替换';
      }
      if (char === quote) quote = undefined;
      continue;
    }

    if (char === "'" || char === '"') {
      current += char;
      quote = char;
      continue;
    }

    if (char === '$' || char === '`') {
      opaque = true;
      opaqueReason = char === '$' ? '命令含有变量或命令替换' : '命令含有反引号替换';
      current += char;
      continue;
    }

    if (char === '<' || char === '>') {
      opaque = true;
      opaqueReason = '命令含有重定向或进程替换';
      current += char;
      continue;
    }

    const separator = separatorAt(command, i);
    if (separator) {
      flush();
      i += separator.length - 1;
      continue;
    }

    current += char;
  }

  if (quote) return { ok: false, reason: '命令含有未闭合引号', segments: [] };
  if (escaped) return { ok: false, reason: '命令以未完成的转义结束', segments: [] };
  flush();

  if (opaque) {
    return { ok: false, reason: opaqueReason, segments };
  }
  if (segments.length === 0) {
    return { ok: false, reason: '命令不包含可执行命令段', segments: [] };
  }

  return { ok: true, segments };
}

export function tokenizeSimpleSegment(segment) {
  if (typeof segment !== 'string' || !segment.trim()) {
    return { ok: false, reason: '命令段为空', argv: [] };
  }
  const argv = [];
  let current = '';
  let quote = undefined;
  let escaped = false;

  const flush = () => {
    if (current.length > 0) argv.push(current);
    current = '';
  };

  for (let i = 0; i < segment.length; i += 1) {
    const char = segment[i];
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = undefined; else current += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (isWhitespace(char)) { flush(); continue; }
    current += char;
  }
  if (quote || escaped) return { ok: false, reason: '命令段含有未完成的引用', argv: [] };
  flush();
  return argv.length ? { ok: true, argv } : { ok: false, reason: '命令段为空', argv: [] };
}
