const SEPARATORS = [
  '&&', '||', ';;', ';&', '|&', '|', ';', '&', '\n',
];

const OPAQUE_TOKENS = new Set(['$', '`', '<', '>']);

function isRedirectionBoundary(command, index) {
  if (index >= command.length) return true;
  return /[\s|&;()<>]/.test(command[index]);
}

function trailingFdLength(out) {
  const match = /(\d+)$/.exec(out);
  if (!match) return 0;
  const start = out.length - match[1].length;
  if (start === 0 || /[\s|&;()<>]/.test(out[start - 1])) return match[1].length;
  return 0;
}

/**
 * Recognizes output redirections that have no filesystem side effect:
 * fd duplication (2>&1) and redirection to /dev/null.
 * Everything else stays opaque.
 */
function matchSafeRedirection(command, index, out) {
  const char = command[index];
  const length = command.length;

  if (char === '&') {
    if (command[index + 1] !== '>') return null;
    const opLength = command[index + 2] === '>' ? 2 : 1;
    let cursor = index + 1 + opLength;
    while (cursor < length && (command[cursor] === ' ' || command[cursor] === '\t')) cursor += 1;
    const target = '/dev/null';
    if (command.startsWith(target, cursor) && isRedirectionBoundary(command, cursor + target.length)) {
      return { length: cursor + target.length - index, removeFd: 0 };
    }
    return null;
  }

  if (char !== '>') return null;
  const removeFd = trailingFdLength(out);
  const opLength = command[index + 1] === '>' ? 2 : 1;
  let cursor = index + opLength;

  if (command[cursor] === '&') {
    let target = cursor + 1;
    while (target < length && (command[target] === ' ' || command[target] === '\t')) target += 1;
    const match = /^(?:\d+|-)/.exec(command.slice(target));
    if (match) {
      const end = target + match[0].length;
      if (isRedirectionBoundary(command, end)) return { length: end - index, removeFd };
    }
    return null;
  }

  while (cursor < length && (command[cursor] === ' ' || command[cursor] === '\t')) cursor += 1;
  const target = '/dev/null';
  if (command.startsWith(target, cursor) && isRedirectionBoundary(command, cursor + target.length)) {
    return { length: cursor + target.length - index, removeFd };
  }
  return null;
}

/**
 * Removes safe output redirections before tokenizing, so common forms like
 * `cmd 2>&1` and `cmd >/dev/null` do not force a manual approval every time.
 * File redirections and input redirections are intentionally left untouched.
 */
export function stripSafeRedirections(command) {
  let out = '';
  let quote;
  let index = 0;
  while (index < command.length) {
    const char = command[index];
    if (quote) {
      out += char;
      if (char === quote) quote = undefined;
      index += 1;
      continue;
    }
    if (char === '\\') {
      out += char;
      if (index + 1 < command.length) {
        out += command[index + 1];
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === '>' || char === '&') {
      const match = matchSafeRedirection(command, index, out);
      if (match) {
        if (match.removeFd > 0) out = out.slice(0, out.length - match.removeFd);
        if (out && !/\s$/.test(out)) out += ' ';
        index += match.length;
        continue;
      }
    }
    out += char;
    index += 1;
  }
  return out;
}

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

  const normalized = stripSafeRedirections(command);
  const result = splitLevel(normalized, 0, maxDepth);
  return result;
}

function isSafeExitCodeExpansion(command, index) {
  if (command[index] !== '$') return false;
  return command.startsWith('$?', index) || command.startsWith('${?}', index);
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
      if (quote === '"' && (char === '`' || (char === '$' && !isSafeExitCodeExpansion(command, i)))) {
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

    if (char === '`' || (char === '$' && !isSafeExitCodeExpansion(command, i))) {
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
