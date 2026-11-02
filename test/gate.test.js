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
