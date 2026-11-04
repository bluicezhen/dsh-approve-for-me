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

  decide(id, decision, scope = 'once', metadata = {}) {
    const entry = this.pending.get(id);
    if (!entry || !['allow', 'deny'].includes(decision)) return false;
    this.pending.delete(id);
    const record = { ...entry, resolve: undefined, decision, scope, ...metadata, decidedAt: new Date().toISOString() };
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
    return outcome;
  };

  const draftRulesFor = (entry) => {
    const segments = (entry.decision?.segments ?? []).filter((s) => s.verdict !== 'auto-allow');
    const now = Date.now();
    return segments
      .filter((segment) => segment.argv?.[0])
      .map((segment, index) => ({
        id: `human-${now}-${index + 1}`,
        effect: 'allow',
        program: segment.argv[0],
        args: segment.argv.slice(1).map((value) => ({ kind: 'literal', value })),
        scope: 'human',
      }));
  };

  const normalizeRules = (rules) => {
    if (!Array.isArray(rules) || rules.length === 0) throw new Error('至少需要一条规则');
    return rules.map((rule, index) => {
      const program = typeof rule?.program === 'string' ? rule.program.trim() : '';
      if (!program) throw new Error(`第 ${index + 1} 条规则缺少程序`);
      const effect = rule?.effect === 'deny' ? 'deny' : 'allow';
      const args = (Array.isArray(rule?.args) ? rule.args : []).map((arg) => {
        if (typeof arg === 'string') return { kind: 'literal', value: arg };
        if (arg && typeof arg === 'object' && typeof arg.kind === 'string') return arg;
        return null;
      }).filter(Boolean);
      return {
        id: typeof rule?.id === 'string' && rule.id ? rule.id : `human-${Date.now()}-${index + 1}`,
        effect,
        program,
        args,
        scope: 'human',
      };
    });
  };

  const describeDraftError = (entry) => {
    const segments = entry.decision?.segments ?? [];
    const reason = entry.decision?.reason;
    if (segments.some((segment) => typeof segment === 'string')) {
      return `该命令无法生成长期放行规则：${reason ?? '命令包含无法静态判定的构造'}。请使用「仅此次」或「本会话」放行，或改写命令后重试。`;
    }
    return '没有可生成的待审批命令段';
  };

  const createPermanentGrant = async (entry, providedRules, requestedTarget) => {
    const target = requestedTarget === 'global' ? 'global' : 'workspace';
    const store = await storeFor(target === 'global' ? undefined : entry.workspace);
    const generatedRules = providedRules === undefined ? draftRulesFor(entry) : normalizeRules(providedRules);
    if (!generatedRules.length) throw new Error(describeDraftError(entry));
    await store.save([...store.state.rules, ...generatedRules]);
    const confirmedState = await store.confirm();
    return { generatedRules, confirmedState, target };
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
            return { ...snap, workspace: store.workspace, path: store.path };
          });
          return sendJson(res, 200, { queue: queue.snapshot(), stores: snapshots });
        }
        if (req.method === 'POST' && suffix === '/preview') {
          const body = await readBody(req);
          const entry = queue.pending.get(body.id);
          if (!entry) return sendJson(res, 404, { ok: false, error: 'approval-not-found' });
          const rules = draftRulesFor(entry);
          if (!rules.length) return sendJson(res, 400, { ok: false, error: describeDraftError(entry) });
          return sendJson(res, 200, { ok: true, workspace: entry.workspace, defaultTarget: 'workspace', targets: ['workspace', 'global'], rules });
        }
        if (req.method === 'POST' && suffix === '/decision') {
          const body = await readBody(req);
          const entry = queue.pending.get(body.id);
          if (!entry) return sendJson(res, 404, { ok: false, error: 'approval-not-found' });
          if (body.decision === 'allow' && body.scope === 'permanent') {
            try {
              const grant = await createPermanentGrant(entry, body.rules, body.target);
              const ok = queue.decide(body.id, 'allow', 'permanent', { generatedRules: grant.generatedRules, rulesConfirmed: true, target: grant.target });
              return sendJson(res, ok ? 200 : 409, { ok, generatedRules: grant.generatedRules, rulesConfirmed: true, workspace: entry.workspace, target: grant.target });
            } catch (error) {
              return sendJson(res, 500, { ok: false, error: `规则生成或确认失败：${error.message}` });
            }
          }
          const ok = queue.decide(body.id, body.decision, body.scope);
          return sendJson(res, ok ? 200 : 400, { ok });
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
        if (req.method === 'POST' && suffix === '/rules/delete') {
          const body = await readBody(req);
          const store = await storeFor(body.workspace);
          const next = store.state.rules.filter((rule) => rule.id !== body.id);
          if (next.length === store.state.rules.length) return sendJson(res, 404, { ok: false, error: 'rule-not-found' });
          return sendJson(res, 200, { ok: true, state: await store.save(next) });
        }
        return sendJson(res, 404, { error: 'not-found' });
      } catch (error) { return sendJson(res, 400, { error: error.message }); }
    },
  }), 'approve-for-me web API');
}
