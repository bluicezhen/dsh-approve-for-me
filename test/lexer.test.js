import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCommand, tokenizeSimpleSegment } from '../lib/lexer.js';

test('splits compound commands without splitting quoted separators', () => {
  const result = splitCommand('echo "a;b" && printf ok; pwd');
  assert.equal(result.ok, true);
  assert.deepEqual(result.segments, ['echo "a;b"', 'printf ok', 'pwd']);
});

test('fails closed for command substitution and redirection', () => {
  assert.equal(splitCommand('echo "$(cat ~/.ssh/id_rsa)"').ok, false);
  assert.equal(splitCommand('echo hello > out.txt').ok, false);
});

test('fails closed for unclosed quotes', () => {
  const result = splitCommand('echo "hello');
  assert.equal(result.ok, false);
  assert.match(result.reason, /未闭合/);
});

test('tokenizes quoted argv values', () => {
  assert.deepEqual(tokenizeSimpleSegment('printf "hello world"'), { ok: true, argv: ['printf', 'hello world'] });
});

test('treats common output redirections as safe', () => {
  assert.deepEqual(splitCommand('echo hi 2>&1'), { ok: true, segments: ['echo hi'] });
  assert.deepEqual(splitCommand('git status 2>/dev/null'), { ok: true, segments: ['git status'] });
  assert.deepEqual(splitCommand('echo hi >/dev/null 2>&1'), { ok: true, segments: ['echo hi'] });
  assert.deepEqual(splitCommand('echo hi &>/dev/null'), { ok: true, segments: ['echo hi'] });
});

test('still treats file and input redirections as opaque', () => {
  assert.equal(splitCommand('echo hi > out.txt').ok, false);
  assert.equal(splitCommand('echo hi 2> err.log').ok, false);
  assert.equal(splitCommand('cat < input.txt').ok, false);
});

test('does not strip redirections inside quotes', () => {
  assert.deepEqual(splitCommand('echo "2>&1 >/dev/null"'), { ok: true, segments: ['echo "2>&1 >/dev/null"'] });
});
