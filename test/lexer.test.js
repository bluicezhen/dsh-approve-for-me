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
