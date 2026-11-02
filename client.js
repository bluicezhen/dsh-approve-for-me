window.__ModuleLoader__.load({
  id: 'dsh-approve-for-me',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'approve-for-me';
    const API = '/api/approve-for-me';

    function Button({ children, onClick, disabled }) {
      return h('button', { type: 'button', disabled, onClick, style: styles.button }, children);
    }

    function ApprovalCard({ item, decide }) {
      return h('article', { style: styles.card },
        h('code', { style: styles.command }, item.command),
        h('p', null, item.reason),
        h('small', null, `未命中的命令段：${(item.decision?.segments ?? []).filter((s) => s.verdict !== 'auto-allow').map((s) => s.text).join('；')}`),
        h('div', { style: styles.actions },
          h(Button, { onClick: () => decide(item.id, 'allow', 'once') }, '仅此次'),
          h(Button, { onClick: () => decide(item.id, 'allow', 'session') }, '本会话'),
          h(Button, { onClick: () => decide(item.id, 'allow', 'permanent') }, '长期并写入规则'),
          h(Button, { onClick: () => decide(item.id, 'deny', 'once') }, '拒绝'),
        ),
      );
    }

    function RuleRow({ rule }) {
      return h('div', { style: styles.ruleRow },
        h('div', { style: styles.ruleHeader },
          h('strong', null, rule.id ?? '未命名规则'),
          h('span', { style: rule.effect === 'deny' ? styles.denyTag : styles.allowTag }, rule.effect === 'deny' ? '拒绝' : '放行'),
        ),
        h('div', { style: styles.ruleDetails },
          h('span', null, `程序：${rule.program ?? '*'}`),
          h('span', null, `参数：${formatArgs(rule.args)}`),
          h('span', null, `作用域：${rule.scope ?? '默认'}`),
        ),
      );
    }

    function formatArgs(args) {
      if (!Array.isArray(args) || args.length === 0) return '任意';
      return args.map((arg) => typeof arg === 'string' ? arg : `${arg.kind ?? '匹配'}${arg.value ? `=${arg.value}` : ''}`).join(' ');
    }

    function Page() {
      const [tab, setTab] = React.useState('approvals');
      const [state, setState] = React.useState({ queue: { pending: [], history: [] }, stores: [] });
      const [command, setCommand] = React.useState('');
      const [preview, setPreview] = React.useState(null);
      const refresh = React.useCallback(() => fetch(`${API}/state`).then((r) => r.json()).then(setState).catch(() => {}), []);
      React.useEffect(() => { refresh(); const timer = setInterval(refresh, 500); return () => clearInterval(timer); }, [refresh]);
      const decide = (id, decision, scope) => fetch(`${API}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision, scope }) }).then(refresh);
      const confirmRules = (workspace) => fetch(`${API}/rules/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace }) }).then(refresh);
      const dryRun = () => fetch(`${API}/dry-run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command }) }).then((r) => r.json()).then(setPreview).catch(() => setPreview({ error: '试算失败' }));
      return h('div', { style: styles.page },
        h('header', { style: styles.header }, h('h1', null, '命令审批'), h('span', { style: styles.badge }, String(state.queue.pending.length))),
        h('nav', { style: styles.tabs },
          h('button', { style: tab === 'approvals' ? styles.activeTab : styles.tab, onClick: () => setTab('approvals') }, '审批'),
          h('button', { style: tab === 'rules' ? styles.activeTab : styles.tab, onClick: () => setTab('rules') }, '规则'),
        ),
        tab === 'approvals' ? h('section', null,
          state.queue.pending.length === 0 ? h('p', null, '当前没有待审批命令。') : state.queue.pending.map((item) => h(ApprovalCard, { key: item.id, item, decide })),
          h('h2', null, '历史'), state.queue.history.map((item) => h('div', { key: item.id, style: styles.history }, `${item.decision} · ${item.command}`)),
        ) : h('section', null,
          h('h2', null, '命令试算器'),
          h('textarea', { value: command, onChange: (event) => setCommand(event.target.value), placeholder: '粘贴一条命令', style: styles.textarea }),
          h(Button, { onClick: dryRun, disabled: !command }, '试算'),
          preview && h('pre', { style: styles.preview }, JSON.stringify(preview, null, 2)),
          h('h2', null, '规则库'),
          state.stores.length === 0 ? h('p', null, '尚未加载规则库。') : state.stores.map((store) => h('div', { key: `${store.workspace ?? 'global'}-${store.rulesDigest}`, style: styles.card },
            h('div', { style: styles.storeHeader },
              h('div', null,
                h('strong', null, store.workspace ? `工作区：${store.workspace}` : '全局规则'),
                h('div', { style: styles.storeStatus }, `规则 ${store.rules.length} 条 · ${store.confirmed ? '已确认' : '待确认'}`),
              ),
              !store.confirmed && h(Button, { onClick: () => confirmRules(store.workspace) }, '确认规则'),
            ),
            h('div', { style: styles.rulesList }, store.rules.map((rule, index) => h(RuleRow, { key: rule.id ?? index, rule }))),
          )),
        ),
      );
    }

    const styles = {
      page: { padding: 24, maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui' },
      header: { display: 'flex', alignItems: 'center', gap: 12 },
      badge: { borderRadius: 999, padding: '2px 8px', background: 'var(--dsw-alias-state-error-primary)', color: '#fff' },
      tabs: { display: 'flex', gap: 8, borderBottom: '1px solid var(--dsw-alias-border-l)', marginBottom: 20 },
      tab: { border: 0, background: 'transparent', padding: '12px 16px', cursor: 'pointer' },
      activeTab: { border: 0, borderBottom: '2px solid var(--dsw-alias-brand-primary)', background: 'transparent', padding: '12px 16px', cursor: 'pointer' },
      card: { border: '1px solid var(--dsw-alias-border-l)', borderRadius: 8, padding: 16, marginBottom: 12 },
      command: { display: 'block', whiteSpace: 'pre-wrap', marginBottom: 8 },
      actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
      button: { border: '1px solid var(--dsw-alias-border-l)', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', background: 'var(--dsw-alias-bg-base)' },
      history: { padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l)' },
      textarea: { width: '100%', minHeight: 100, padding: 12, boxSizing: 'border-box', marginBottom: 8 },
      preview: { background: 'var(--dsw-alias-bg-overlay)', padding: 12, overflow: 'auto' },
      storeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12 },
      storeStatus: { color: 'var(--dsw-alias-text-secondary)', marginTop: 4 },
      rulesList: { display: 'grid', gap: 8 },
      ruleRow: { border: '1px solid var(--dsw-alias-border-l)', borderRadius: 6, padding: 12, background: 'var(--dsw-alias-bg-base)' },
      ruleHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
      ruleDetails: { display: 'flex', flexWrap: 'wrap', gap: 12, color: 'var(--dsw-alias-text-secondary)', fontSize: 13 },
      allowTag: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12 },
      denyTag: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 },
      iconWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      iconBadge: { position: 'absolute', top: -8, right: -12, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 999, background: 'var(--dsw-alias-state-error-primary)', color: '#fff', fontSize: 10, lineHeight: '16px', textAlign: 'center', fontWeight: 700 },
    };

    function Icon({ size }) {
      const [count, setCount] = React.useState(0);
      React.useEffect(() => {
        let active = true;
        const refresh = () => fetch(`${API}/state`).then((r) => r.json()).then((next) => active && setCount(next.queue?.pending?.length ?? 0)).catch(() => {});
        refresh();
        const timer = setInterval(refresh, 500);
        return () => { active = false; clearInterval(timer); };
      }, []);
      return h('span', { style: styles.iconWrap, 'aria-label': count ? `有 ${count} 条待审批命令` : '没有待审批命令' },
        h('span', { 'aria-hidden': true, style: { fontSize: size ? `${size}px` : '18px' } }, '🛡'),
        count > 0 && h('span', { style: styles.iconBadge }, count > 99 ? '99+' : String(count)),
      );
    }
    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, order: 30 }, Page));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 30, label: () => '命令审批' }, Icon));
      },
    };
  },
});
