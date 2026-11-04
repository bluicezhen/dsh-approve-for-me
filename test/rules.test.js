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

test('keeps per-segment verdicts so the UI can explain the blocker', () => {
  const result = evaluateCommand(
    "ls aliyun/.terraform/service-contacts.json 2>/dev/null && sed -n '1,60p' aliyun/scripts/read_contact_map.py && echo done",
    { workspace: process.cwd() },
  );
  assert.equal(result.verdict, 'pending');
  const [lsSegment, sedSegment, echoSegment] = result.segments;
  assert.equal(lsSegment.verdict, 'auto-allow');
  assert.equal(sedSegment.verdict, 'pending');
  assert.match(sedSegment.reason, /没有命中放行规则/);
  assert.equal(echoSegment.verdict, 'auto-allow');
});

test('empty args means no arguments, not a wildcard', () => {
  const rule = { id: 'cd-empty', effect: 'allow', program: 'cd', args: [] };
  assert.equal(evaluateSegment('cd', ['cd'], { rules: [rule] }).verdict, 'auto-allow');
  assert.equal(evaluateSegment('cd /tmp', ['cd', '/tmp'], { rules: [rule] }).verdict, 'pending');
});

test('rest args matches arbitrary arguments', () => {
  const rule = { id: 'cd-any', effect: 'allow', program: 'cd', args: [{ kind: 'rest' }] };
  assert.equal(evaluateSegment('cd /tmp', ['cd', '/tmp'], { rules: [rule] }).verdict, 'auto-allow');
  assert.equal(evaluateSegment('cd', ['cd'], { rules: [rule] }).verdict, 'auto-allow');
});

test('allows commands that read the exit-code variable', () => {
  assert.equal(evaluateCommand('echo exit=$?', { workspace: process.cwd() }).verdict, 'auto-allow');
  assert.equal(evaluateCommand('echo "exit=$?"', { workspace: process.cwd() }).verdict, 'auto-allow');
});

test('still blocks commands that use other variables', () => {
  const result = evaluateCommand('echo $HOME', { workspace: process.cwd() });
  assert.equal(result.verdict, 'pending');
  assert.match(result.reason, /变量|命令替换/);
});
