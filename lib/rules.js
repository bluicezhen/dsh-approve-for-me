import path from 'node:path';
import { splitCommand, tokenizeSimpleSegment } from './lexer.js';

export const PROTECTED_PROGRAMS = new Set([
  'rm', 'dd', 'mkfs', 'mkfs.ext4', 'shutdown', 'reboot', 'poweroff',
  'sudo', 'su', 'chmod', 'chown', 'git push', 'git reset', 'npm publish',
  'pnpm publish', 'yarn publish', 'cargo publish', 'curl', 'wget', 'nc',
]);

export const PROTECTED_PATH_PATTERNS = [
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.dsh(\/|$)/,
  /(^|\/)\.gnupg(\/|$)/,
  /(^|\/)\.env(?:\.|$)/,
];

export const DEFAULT_RULES = [
  ...['pwd', 'ls', 'printf', 'echo', 'date', 'whoami', 'which', 'file', 'wc', 'du', 'df'].map((program) => ({
    id: `default-${program}`, effect: 'allow', program, args: [{ kind: 'any' }], scope: 'default',
  })),
  ...['head', 'tail', 'cat', 'grep', 'rg', 'find', 'sort', 'uniq', 'diff'].map((program) => ({
    id: `default-${program}`, effect: 'allow', program, args: [{ kind: 'pathWithinWorkspace' }, { kind: 'rest' }], scope: 'default',
  })),
  ...['status', 'log', 'diff', 'show', 'branch', 'rev-parse'].map((subcommand) => ({
    id: `default-git-${subcommand}`, effect: 'allow', program: 'git', args: [subcommand, { kind: 'rest' }], scope: 'default',
  })),
];

export function evaluateCommand(command, context = {}) {
  const split = splitCommand(command, { maxDepth: context.maxDepth ?? 3 });
  if (!split.ok) {
    return { verdict: 'pending', reason: split.reason, segments: split.segments ?? [], command };
  }

  const segments = split.segments.map((text) => {
    const tokenized = tokenizeSimpleSegment(text);
    if (!tokenized.ok) return { text, argv: [], verdict: 'pending', reason: tokenized.reason };
    return evaluateSegment(text, tokenized.argv, context);
  });

  const blocked = segments.find((segment) => segment.verdict !== 'auto-allow');
  return {
    verdict: blocked ? blocked.verdict : 'auto-allow',
    reason: blocked?.reason,
    command,
    segments,
  };
}

export function evaluateSegment(text, argv, context = {}) {
  const [program, ...args] = argv;
  if (!program) return { text, argv, verdict: 'pending', reason: '命令段为空' };
  if (containsProtectedPath(args, context)) {
    return { text, argv, verdict: 'pending', reason: '命令段指向受保护路径，需要人工审批' };
  }

  const rules = [...(context.rules ?? []), ...DEFAULT_RULES];
  const denied = rules.find((rule) => rule.effect === 'deny' && matchesRule(rule, program, args, context));
  if (denied) return { text, argv, verdict: 'denied', reason: `命中拒绝规则：${denied.id}`, ruleId: denied.id };

  const allowed = rules.find((rule) => rule.effect === 'allow' && matchesRule(rule, program, args, context));
  if (!allowed) return { text, argv, verdict: 'pending', reason: '命令段没有命中放行规则' };

  if (isProtectedProgram(program, args) && !hasArgumentConstraint(allowed)) {
    return { text, argv, verdict: 'pending', reason: '受保护程序不能仅按程序名自动放行', ruleId: allowed.id };
  }
  return { text, argv, verdict: 'auto-allow', ruleId: allowed.id };
}

export function matchesRule(rule, program, args, context = {}) {
  if (rule.program !== program) return false;
  if (!Array.isArray(rule.args)) return args.length === 0;
  return matchArgs(rule.args, args, context);
}

function matchArgs(patterns, args, context) {
  let ai = 0;
  for (const pattern of patterns) {
    if (pattern?.kind === 'rest') return true;
    if (pattern?.kind === 'any') { if (ai >= args.length) return false; ai += 1; continue; }
    if (pattern?.kind === 'literal') { if (args[ai] !== pattern.value) return false; ai += 1; continue; }
    if (typeof pattern === 'string') { if (args[ai] !== pattern) return false; ai += 1; continue; }
    if (pattern?.kind === 'enum') { if (!pattern.values?.includes(args[ai])) return false; ai += 1; continue; }
    if (pattern?.kind === 'pathWithinWorkspace') {
      if (ai >= args.length || !isPathWithinWorkspace(args[ai], context.workspace)) return false;
      ai += 1;
      continue;
    }
    return false;
  }
  return ai === args.length;
}

function hasArgumentConstraint(rule) {
  return Array.isArray(rule.args) && rule.args.length > 0;
}

function isProtectedProgram(program, args) {
  if (PROTECTED_PROGRAMS.has(program)) return true;
  if (program === 'git' && (args[0] === 'push' || args[0] === 'reset')) return true;
  return false;
}

function containsProtectedPath(args, context) {
  return args.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.replaceAll('\\', '/');
    if (PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
    return context.rulesDirectory && path.resolve(value).startsWith(path.resolve(context.rulesDirectory));
  });
}

function isPathWithinWorkspace(value, workspace) {
  if (!workspace || !value || value.includes('$') || value.includes('~') || value.includes('*') || value.includes('..')) return false;
  const resolvedWorkspace = path.resolve(workspace);
  const resolved = path.resolve(workspace, value);
  return resolved === resolvedWorkspace || resolved.startsWith(`${resolvedWorkspace}${path.sep}`);
}
