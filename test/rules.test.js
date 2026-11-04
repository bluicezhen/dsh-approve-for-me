import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommand, evaluateSegment } from '../lib/rules.js';

test('blocks a dangerous second segment even when the first is safe', () => {
  const result = evaluateCommand('echo hello && rm -rf ~/Documents', { workspace: process.cwd() });
  assert.notEqual(result.verdict, 'auto-allow');
  assert.equal(result.segments.at(-1).argv[0], 'rm');
});

test('allows a workspace-scoped read command', () => {
  const result = evaluateCommand('cat README.md', { workspace: process.cwd() });
  assert.equal(result.verdict, 'auto-allow');
});

test('blocks protected paths before allow rules', () => {
  const result = evaluateCommand('cat ~/.ssh/id_rsa', { workspace: process.cwd() });
  assert.equal(result.verdict, 'pending');
  assert.match(result.reason, /受保护路径/);
});

test('deny rule wins over allow rule', () => {
  const result = evaluateSegment('git push', ['git', 'push'], {
    rules: [
      { id: 'allow-git', effect: 'allow', program: 'git', args: [{ kind: 'any' }] },
      { id: 'deny-push', effect: 'deny', program: 'git', args: ['push'] },
    ],
  });
  assert.equal(result.verdict, 'denied');
  assert.equal(result.ruleId, 'deny-push');
});

test('auto-allows commands with common safe output redirections', () => {
  assert.equal(evaluateCommand('echo hello 2>&1', { workspace: process.cwd() }).verdict, 'auto-allow');
  assert.equal(evaluateCommand('git diff >/dev/null', { workspace: process.cwd() }).verdict, 'auto-allow');
  assert.equal(evaluateCommand('cat README.md 2>/dev/null', { workspace: process.cwd() }).verdict, 'auto-allow');
});

test('still blocks file redirection', () => {
  const result = evaluateCommand('echo hello > out.txt', { workspace: process.cwd() });
  assert.equal(result.verdict, 'pending');
  assert.match(result.reason, /重定向/);
});
