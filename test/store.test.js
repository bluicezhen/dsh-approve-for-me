import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RuleStore, digestRules } from '../lib/store.js';

test('rules become unconfirmed after an external edit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'approve-for-me-'));
  const store = new RuleStore({ root, workspace: '/tmp/project' });
  await store.load();
  await store.save([...store.state.rules, { id: 'human', effect: 'allow', program: 'true', args: [] }]);
  assert.equal(store.snapshot().confirmed, false);
  await store.confirm();
  assert.equal(store.snapshot().confirmed, true);
  const file = await readFile(store.path, 'utf8');
  assert.equal(JSON.parse(file).confirmedDigest, digestRules(store.state.rules));
});

test('snapshot reports added rules against the last confirmed baseline', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'approve-for-me-'));
  const store = new RuleStore({ root, workspace: '/tmp/project' });
  await store.load();
  await store.confirm();
  assert.equal(store.snapshot().changed, false);

  await store.save([...store.state.rules, { id: 'ext-1', effect: 'allow', program: 'true', args: [] }]);
  const snap = store.snapshot();
  assert.equal(snap.confirmed, false);
  assert.equal(snap.changed, true);
  assert.deepEqual(snap.added.map((rule) => rule.id), ['ext-1']);

  const reloaded = new RuleStore({ root, workspace: '/tmp/project' });
  await reloaded.load();
  assert.deepEqual(reloaded.snapshot().added.map((rule) => rule.id), ['ext-1']);
});

