import { RuleStore } from './lib/store.js';
import { evaluateCommand } from './lib/rules.js';

export const name = 'approve-for-me-gate';
export const inject = ['tools', 'webServer', 'workingDirectory'];

const API_PREFIX = '/api/approve-for-me';

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('request body too large'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

class ApprovalQueue {
  constructor() { this.pending = new Map(); this.history = []; this.sequence = 0; }

  add(item) {
    const id = `approval-${Date.now()}-${++this.sequence}`;
    let resolve;
    const result = new Promise((done) => { resolve = done; });
    const entry = { ...item, id, createdAt: new Date().toISOString(), resolve };
    this.pending.set(id, entry);
    return { id, result };
  }

  decide(id, decision, scope = 'once') {
    const entry = this.pending.get(id);
    if (!entry || !['allow', 'deny'].includes(decision)) return false;
    this.pending.delete(id);
    const record = { ...entry, resolve: undefined, decision, scope, decidedAt: new Date().toISOString() };
    this.history.unshift(record);
    this.history = this.history.slice(0, 100);
    entry.resolve({ decision, scope });
    return true;
  }

  snapshot() {
    const clean = (entry) => ({ ...entry, resolve: undefined });
    return { pending: [...this.pending.values()].map(clean), history: this.history.map(clean) };
  }
}

export async function apply(ctx, config = {}) {
  const queue = new ApprovalQueue();
  const sessionGrants = new Map();
  const stores = new Map();
  const defaultTimeoutMs = config.approvalTimeoutMs ?? 0;

  const storeFor = async (workspace) => {
    const key = workspace ?? '';
    if (!stores.has(key)) stores.set(key, new RuleStore({ workspace }));
    const store = stores.get(key);
    await store.load();
    return store;
  };

  const rulesFor = async (workspace) => {
    const global = await storeFor();
    const local = workspace ? await storeFor(workspace) : null;
    return {
      global,
      local,
      rules: [...global.state.rules, ...(local ? local.state.rules : [])],
      confirmed: global.snapshot().confirmed && (!local || local.snapshot().confirmed),
      confirmedDigests: { global: global.state.confirmedDigest, local: local?.state?.confirmedDigest },
    };
  };

  const getWorkspace = (exec) => exec.arguments?.workdir ?? config.workspace ?? process.cwd();

  const evaluate = async (exec) => {
    const command = exec.arguments?.command;
    if (exec.name !== 'bash' || typeof command !== 'string') return { verdict: 'allow' };
    const workspace = getWorkspace(exec);
    const combined = await rulesFor(workspace);
    if (!combined.confirmed) {
      return {
        verdict: 'ask',
        reason: '规则文件已变更，尚未经人确认，因此该命令需人工审批。请在「命令审批」插件的「规则」标签页中确认规则，或在「审批」标签页直接放行本次命令。',
        pendingReason: '规则未确认，请在插件「规则」页确认规则后再放行',
        workspace,
        decision: { verdict: 'pending', reason: '规则未确认，等待人工确认规则或放行本次命令', command, segments: [{ text: command, verdict: 'pending', argv: command.trim().split(/\s+/) }] },
      };
    }
    const decision = evaluateCommand(command, { workspace, rules: combined.rules });
    if (decision.verdict === 'auto-allow') return { verdict: 'allow', decision };
    if (decision.verdict === 'denied') return { verdict: 'deny', reason: decision.reason, decision };
    return { verdict: 'ask', reason: decision.reason ?? '命令未命中放行规则', decision, workspace };
  };

  const approve = async (exec, pending, signal) => {
    const workspace = pending.workspace ?? getWorkspace(exec);
    const key = `${workspace}\u0000${pending.decision.segments?.filter((s) => s.verdict !== 'auto-allow').map((s) => s.argv?.join('\u0000') ?? s.text).join('\u0001')}`;
    if (sessionGrants.has(key)) return { decision: 'allow', scope: 'session' };
    const queued = queue.add({
      callId: exec.callId,
      toolName: exec.name,
      command: exec.arguments?.command,
      workspace,
      reason: pending.reason,
      decision: pending.decision,
      rememberKey: key,
    });
    let timer;
    const aborted = new Promise((resolve) => {
      if (signal?.aborted) resolve({ decision: 'deny', scope: 'cancelled' });
      else signal?.addEventListener('abort', () => resolve({ decision: 'deny', scope: 'cancelled' }), { once: true });
    });
    const timeout = defaultTimeoutMs > 0 ? new Promise((resolve) => { timer = setTimeout(() => resolve({ decision: 'deny', scope: 'timeout' }), defaultTimeoutMs); }) : new Promise(() => {});
    const outcome = await Promise.race([queued.result, aborted, timeout]);
    if (timer) clearTimeout(timer);
    if (outcome.scope === 'cancelled' || outcome.scope === 'timeout') queue.decide(queued.id, 'deny', outcome.scope);
    if (outcome.decision === 'allow' && outcome.scope === 'session') sessionGrants.set(key, true);
    if (outcome.decision === 'allow' && outcome.scope === 'permanent') {
      const store = await storeFor(workspace);
      const segments = pending.decision.segments?.filter((s) => s.verdict !== 'auto-allow') ?? [];
      const rules = [...store.state.rules];
      for (const segment of segments) rules.push({ id: `human-${Date.now()}`, effect: 'allow', program: segment.argv?.[0], args: (segment.argv ?? []).slice(1).map((value) => ({ kind: 'literal', value })), scope: 'human' });
      await store.save(rules);
    }
    return outcome;
  };

  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      const pending = await evaluate(exec);
      if (pending.verdict === 'allow') return next();
      if (pending.verdict === 'deny') return { kind: 'deny', reason: pending.reason };
      const outcome = await approve(exec, pending, exec.signal);
      if (outcome.decision === 'allow') return next();
      const why = outcome.scope === 'timeout'
        ? '等待人工审批超时'
        : outcome.scope === 'cancelled'
          ? '命令被取消'
          : '人工审批未通过';
      const hint = pending.pendingReason ? `（${pending.pendingReason}）` : '';
      return { kind: 'deny', reason: `${why}：该命令未获放行${hint}。请向用户说明要执行的命令与原因，等待用户在「命令审批」插件中放行后再重试；不要自行重试或绕过。` };
    } catch (error) {
      return { kind: 'deny', reason: `命令审批系统错误：${error.message}` };
    }
  }, { prepend: true }), 'approve-for-me pre-execute');

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: API_PREFIX,
    handler: async (req, res) => {
      try {
        const url = new URL(String(req.url), 'http://localhost');
        const suffix = url.pathname.slice(API_PREFIX.length);
        if (req.method === 'GET' && suffix === '/state') {
          const workspaces = [...stores.values()].map((store) => store.workspace);
          const pending = [...queue.pending.values()];
          const snapshots = [...stores.values()].map((store) => {
            const snap = store.snapshot();
            const previous = store.previousConfirmedDigest ?? store.state.confirmedDigest;
            const changed = previous && previous !== digestRules(store.state.rules);
            return { ...snap, workspace: store.workspace, path: store.path, previousConfirmedDigest: previous, changed };
          });
          return sendJson(res, 200, { queue: queue.snapshot(), stores: snapshots });
        }
        if (req.method === 'POST' && suffix === '/decision') {
          const body = await readBody(req);
          const ok = queue.decide(body.id, body.decision, body.scope);
          return sendJson(res, ok ? 200 : 404, { ok });
        }
        if (req.method === 'POST' && suffix === '/dry-run') {
          const body = await readBody(req);
          const workspace = body.workspace ?? process.cwd();
          const combined = await rulesFor(workspace);
          return sendJson(res, 200, combined.confirmed ? evaluateCommand(body.command, { workspace, rules: combined.rules }) : { verdict: 'pending', reason: '规则尚未确认，请先在「规则」页确认规则后再试算（未确认时所有命令都会被拦截等待人工处理）' });
        }
        if (req.method === 'POST' && suffix === '/rules/confirm') {
          const body = await readBody(req);
          const store = await storeFor(body.workspace);
          return sendJson(res, 200, { ok: true, state: await store.confirm() });
        }
        if (req.method === 'POST' && suffix === '/rules/save') {
          const body = await readBody(req);
          const store = await storeFor(body.workspace);
          return sendJson(res, 200, { ok: true, state: await store.save(body.rules ?? []) });
        }
        return sendJson(res, 404, { error: 'not-found' });
      } catch (error) { return sendJson(res, 400, { error: error.message }); }
    },
  }), 'approve-for-me web API');
}
