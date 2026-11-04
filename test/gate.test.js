import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function makeCtx() {
  const listeners = {};
  let routeHandler;
  return {
    ctx: {
      on: (event, fn) => { listeners[event] = fn; return () => {}; },
      effect: (fn) => { fn(); return () => {}; },
      inject: () => {},
      webServer: { register: (opts) => { routeHandler = opts.handler; return () => {}; } },
    },
    listeners,
    getRoute: () => routeHandler,
  };
}

function callRoute(handler, method, url, body) {
  return new Promise((resolve, reject) => {
    const chunks = body === undefined ? [] : [JSON.stringify(body)];
    const req = {
      method,
      url,
      setEncoding() {},
      on(event, cb) {
        if (event === 'data') chunks.forEach((chunk) => cb(chunk));
        if (event === 'end') cb();
        if (event === 'error') { /* noop */ }
      },
    };
    const res = {
      statusCode: 0,
      setHeader() {},
      end(payload) { resolve({ status: this.statusCode, body: JSON.parse(payload) }); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

test('permanent grant saves and confirms a rule in one action', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afm-gate-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  try {
    const { apply } = await import('../index.js');
    const { ctx, listeners, getRoute } = makeCtx();
    await apply(ctx, {});

    const preExecute = listeners['tools/pre-execute'];
    assert.equal(typeof preExecute, 'function');

    const exec = {
      name: 'bash',
      callId: 'call-1',
      arguments: { command: 'node ./build.js', workdir: '/tmp/project' },
      signal: new AbortController().signal,
    };

    let nextCalled = false;
    const gatePromise = preExecute(exec, async () => { nextCalled = true; return { kind: 'allow' }; });

    // The command should be parked as a pending approval.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stateRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    assert.equal(stateRes.status, 200);
    const pending = stateRes.body.queue.pending;
    assert.equal(pending.length, 1);
    const approvalId = pending[0].id;

    // Approve as a standing (permanent) grant.
    const decisionRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/decision', { id: approvalId, decision: 'allow', scope: 'permanent' });
    assert.equal(decisionRes.status, 200);
    assert.equal(decisionRes.body.ok, true);
    assert.ok(Array.isArray(decisionRes.body.generatedRules));
    assert.equal(decisionRes.body.generatedRules.length, 1);
    assert.equal(decisionRes.body.generatedRules[0].program, 'node');

    await gatePromise;
    assert.equal(nextCalled, true, 'command should be allowed after the grant');

    // The rule must be persisted AND confirmed (no second manual confirmation).
    const afterRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const workspaceStore = afterRes.body.stores.find((store) => store.workspace === '/tmp/project');
    assert.ok(workspaceStore, 'workspace store should be present');
    assert.equal(workspaceStore.confirmed, true, 'generated rules should already be confirmed');
    assert.ok(workspaceStore.rules.some((rule) => rule.program === 'node'), 'generated rule should be persisted');
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
});

test('permanent grant previews rules and writes the edited result', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afm-gate-preview-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  try {
    const { apply } = await import('../index.js');
    const { ctx, listeners, getRoute } = makeCtx();
    await apply(ctx, {});

    const preExecute = listeners['tools/pre-execute'];
    const exec = {
      name: 'bash',
      callId: 'call-preview-1',
      arguments: { command: 'node ./build.js', workdir: '/tmp/project-preview' },
      signal: new AbortController().signal,
    };
    let nextCalled = false;
    const gatePromise = preExecute(exec, async () => { nextCalled = true; return { kind: 'allow' }; });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const stateRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const approvalId = stateRes.body.queue.pending[0].id;

    const previewRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/preview', { id: approvalId });
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.body.ok, true);
    assert.equal(previewRes.body.rules.length, 1);
    assert.equal(previewRes.body.rules[0].program, 'node');
    assert.deepEqual(previewRes.body.rules[0].args, [{ kind: 'literal', value: './build.js' }]);

    // Preview must not persist anything.
    const beforeWrite = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const storeBefore = beforeWrite.body.stores.find((store) => store.workspace === '/tmp/project-preview');
    assert.ok(storeBefore);
    assert.equal(storeBefore.rules.some((rule) => rule.program === 'node'), false, 'preview should not write rules');

    const editedRules = [{ id: 'custom-1', effect: 'allow', program: 'node', args: [{ kind: 'literal', value: './other.js' }] }];
    const decisionRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/decision', { id: approvalId, decision: 'allow', scope: 'permanent', rules: editedRules });
    assert.equal(decisionRes.status, 200);
    assert.equal(decisionRes.body.ok, true);
    assert.equal(decisionRes.body.generatedRules[0].id, 'custom-1');
    assert.deepEqual(decisionRes.body.generatedRules[0].args, [{ kind: 'literal', value: './other.js' }]);

    await gatePromise;
    assert.equal(nextCalled, true);

    const afterRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const storeAfter = afterRes.body.stores.find((store) => store.workspace === '/tmp/project-preview');
    assert.ok(storeAfter.rules.some((rule) => rule.id === 'custom-1' && rule.args[0].value === './other.js'), 'edited rule should be written');
    assert.equal(storeAfter.confirmed, true);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
});

test('permanent grant can target the global rule store', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afm-gate-global-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  try {
    const { apply } = await import('../index.js');
    const { ctx, listeners, getRoute } = makeCtx();
    await apply(ctx, {});

    const preExecute = listeners['tools/pre-execute'];
    const exec = {
      name: 'bash',
      callId: 'call-global-1',
      arguments: { command: 'node ./build.js', workdir: '/tmp/project-global-target' },
      signal: new AbortController().signal,
    };
    const gatePromise = preExecute(exec, async () => ({ kind: 'allow' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    const stateRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const approvalId = stateRes.body.queue.pending[0].id;

    const previewRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/preview', { id: approvalId });
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.body.defaultTarget, 'workspace');
    assert.deepEqual(previewRes.body.targets, ['workspace', 'global']);

    const globalRules = [{ id: 'global-1', effect: 'allow', program: 'node', args: [{ kind: 'literal', value: './build.js' }] }];
    const decisionRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/decision', { id: approvalId, decision: 'allow', scope: 'permanent', target: 'global', rules: globalRules });
    assert.equal(decisionRes.status, 200);
    assert.equal(decisionRes.body.target, 'global');
    assert.equal(decisionRes.body.generatedRules[0].id, 'global-1');

    await gatePromise;

    const afterRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const globalStore = afterRes.body.stores.find((store) => !store.workspace);
    const workspaceStore = afterRes.body.stores.find((store) => store.workspace === '/tmp/project-global-target');
    assert.ok(globalStore, 'global store should be present');
    assert.ok(globalStore.rules.some((rule) => rule.id === 'global-1'), 'rule should be written to the global store');
    assert.equal(globalStore.confirmed, true);
    assert.ok(workspaceStore, 'workspace store should still be present');
    assert.equal(workspaceStore.rules.some((rule) => rule.id === 'global-1'), false, 'global rule should not be written to the workspace store');
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
});

test('deleting a rule removes it and marks the rule store unconfirmed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afm-gate-delete-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  try {
    const { apply } = await import('../index.js');
    const { ctx, listeners, getRoute } = makeCtx();
    await apply(ctx, {});

    const preExecute = listeners['tools/pre-execute'];
    const exec = {
      name: 'bash',
      callId: 'call-delete-1',
      arguments: { command: 'node ./build.js', workdir: '/tmp/project-delete' },
      signal: new AbortController().signal,
    };
    const gatePromise = preExecute(exec, async () => ({ kind: 'allow' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    const stateRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const approvalId = stateRes.body.queue.pending[0].id;

    const grantRules = [{ id: 'delete-me', effect: 'allow', program: 'node', args: [{ kind: 'literal', value: './build.js' }] }];
    const decisionRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/decision', { id: approvalId, decision: 'allow', scope: 'permanent', target: 'workspace', rules: grantRules });
    assert.equal(decisionRes.status, 200);
    await gatePromise;

    const deleteRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/rules/delete', { workspace: '/tmp/project-delete', id: 'delete-me' });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.ok, true);
    assert.equal(deleteRes.body.state.rules.some((rule) => rule.id === 'delete-me'), false, 'rule should be removed');
    assert.equal(deleteRes.body.state.confirmed, false, 'deleting a rule should require re-confirmation');

    const confirmRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/rules/confirm', { workspace: '/tmp/project-delete' });
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.state.confirmed, true);

    const missingRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/rules/delete', { workspace: '/tmp/project-delete', id: 'not-there' });
    assert.equal(missingRes.status, 404);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
});

test('preview ignores common safe output redirections when generating rules', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afm-gate-redirect-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  try {
    const { apply } = await import('../index.js');
    const { ctx, listeners, getRoute } = makeCtx();
    await apply(ctx, {});

    const preExecute = listeners['tools/pre-execute'];
    const exec = {
      name: 'bash',
      callId: 'call-redirect-1',
      arguments: { command: 'node ./build.js 2>&1 >/dev/null', workdir: '/tmp/project-redirect' },
      signal: new AbortController().signal,
    };
    const gatePromise = preExecute(exec, async () => ({ kind: 'allow' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    const stateRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const approvalId = stateRes.body.queue.pending[0].id;

    const previewRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/preview', { id: approvalId });
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.body.rules.length, 1);
    assert.equal(previewRes.body.rules[0].program, 'node');
    assert.deepEqual(previewRes.body.rules[0].args, [{ kind: 'literal', value: './build.js' }]);

    const decisionRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/decision', { id: approvalId, decision: 'deny', scope: 'once' });
    assert.equal(decisionRes.status, 200);
    await gatePromise;
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
});

test('preview explains why an opaque command cannot become a standing rule', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afm-gate-opaque-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  try {
    const { apply } = await import('../index.js');
    const { ctx, listeners, getRoute } = makeCtx();
    await apply(ctx, {});

    const preExecute = listeners['tools/pre-execute'];
    const exec = {
      name: 'bash',
      callId: 'call-opaque-1',
      arguments: { command: 'node ./build.js > out.log', workdir: '/tmp/project-opaque' },
      signal: new AbortController().signal,
    };
    const gatePromise = preExecute(exec, async () => ({ kind: 'allow' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    const stateRes = await callRoute(getRoute(), 'GET', '/api/approve-for-me/state');
    const approvalId = stateRes.body.queue.pending[0].id;

    const previewRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/preview', { id: approvalId });
    assert.equal(previewRes.status, 400);
    assert.match(previewRes.body.error, /无法静态判定|无法生成长期放行规则/);

    const decisionRes = await callRoute(getRoute(), 'POST', '/api/approve-for-me/decision', { id: approvalId, decision: 'deny', scope: 'once' });
    assert.equal(decisionRes.status, 200);
    await gatePromise;
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
});
