window.__ModuleLoader__.load({
  id: 'dsh-approve-for-me',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'approve-for-me';
    const API = '/api/approve-for-me';

    function Button({ children, onClick, disabled, primary }) {
      return h('button', { type: 'button', disabled, onClick, style: primary ? styles.buttonPrimary : styles.button }, children);
    }

    function Badge({ children, kind }) {
      return h('span', { style: kind === 'error' ? styles.badgeError : kind === 'success' ? styles.badgeSuccess : styles.badge }, children);
    }

    function Card({ title, sub, children, actions }) {
      return h('section', { style: styles.card },
        h('div', { style: styles.cardHead },
          h('div', null,
            h('div', { style: styles.cardTitle }, title),
            sub && h('div', { style: styles.cardSub }, sub),
          ),
          actions,
        ),
        children,
      );
    }

    function ApprovalCard({ item, decide }) {
      return h(Card, {
        title: '待审批命令',
        sub: item.createdAt ? new Date(item.createdAt).toLocaleString() : '',
      },
        h('code', { style: styles.command }, item.command),
        h('p', { style: styles.reason }, item.reason),
        h('div', { style: styles.segmentBox },
          h('div', { style: styles.sectionLabel }, '未命中的命令段'),
          (item.decision?.segments ?? []).filter((s) => s.verdict !== 'auto-allow').length === 0
            ? h('span', { style: styles.muted }, '整段命令需人审批')
            : (item.decision?.segments ?? []).filter((s) => s.verdict !== 'auto-allow').map((s, i) => h('div', { key: i, style: styles.segment }, `${s.text}`)),
        ),
        h('div', { style: styles.actions },
          h(Button, { onClick: () => decide(item.id, 'allow', 'once') }, '仅此次'),
          h(Button, { onClick: () => decide(item.id, 'allow', 'session') }, '本会话'),
          h(Button, { primary: true, onClick: () => decide(item.id, 'allow', 'permanent') }, '长期并写入规则'),
          h(Button, { onClick: () => decide(item.id, 'deny', 'once') }, '拒绝'),
        ),
      );
    }

    function HistoryCard({ item }) {
      return h('div', { style: styles.historyRow },
        h('span', { style: item.decision === 'allow' ? styles.allowTag : styles.denyTag }, item.decision === 'allow' ? '已放行' : '已拒绝'),
        h('code', { style: styles.historyCommand }, item.command),
        h('span', { style: styles.muted }, item.scope ?? 'once'),
      );
    }

    function RuleRow({ rule, index }) {
      return h('div', { style: styles.ruleRow },
        h('div', { style: styles.ruleIndex }, String(index + 1).padStart(2, '0')),
        h('div', { style: styles.ruleBody },
          h('div', { style: styles.ruleHeader },
            h('strong', { style: styles.ruleId }, rule.id ?? '未命名规则'),
            h('span', { style: rule.effect === 'deny' ? styles.denyTag : styles.allowTag }, rule.effect === 'deny' ? '拒绝' : '放行'),
          ),
          h('div', { style: styles.ruleDetails },
            h('span', null, `程序：${rule.program ?? '*'}`),
            h('span', null, `参数：${formatArgs(rule.args)}`),
            h('span', null, `作用域：${rule.scope ?? '默认'}`),
          ),
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
      const [ruleQuery, setRuleQuery] = React.useState('');
      const refresh = React.useCallback(() => fetch(`${API}/state`).then((r) => r.json()).then(setState).catch(() => {}), []);
      React.useEffect(() => { refresh(); const timer = setInterval(refresh, 500); return () => clearInterval(timer); }, [refresh]);
      const decide = (id, decision, scope) => fetch(`${API}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision, scope }) }).then(refresh);
      const confirmRules = (workspace) => fetch(`${API}/rules/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace }) }).then(refresh);
      const dryRun = () => fetch(`${API}/dry-run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command }) }).then((r) => r.json()).then(setPreview).catch(() => setPreview({ error: '试算失败' }));
      return h('div', { style: styles.page },
        h('header', { style: styles.header },
          h('h1', { style: styles.title }, '命令审批'),
          state.queue.pending.length > 0 && h(Badge, { kind: 'error' }, String(state.queue.pending.length)),
        ),
        h('nav', { style: styles.tabs },
          h('button', { style: tab === 'approvals' ? styles.activeTab : styles.tab, onClick: () => setTab('approvals') }, '审批'),
          h('button', { style: tab === 'rules' ? styles.activeTab : styles.tab, onClick: () => setTab('rules') }, '规则'),
        ),
        tab === 'approvals' ? h('div', { style: styles.scrollBody },
          state.queue.pending.length === 0 ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '当前没有待审批命令。')) : state.queue.pending.map((item) => h(ApprovalCard, { key: item.id, item, decide })),
          state.queue.history.length > 0 && h('div', { style: styles.section },
            h('div', { style: styles.sectionHeading },
              h('div', null, h('div', { style: styles.sectionTitle }, '历史'), h('div', { style: styles.sectionSubtitle }, '最近 100 条审批记录')),
              h(Badge, null, String(state.queue.history.length)),
            ),
            h('div', { style: styles.historyList }, state.queue.history.map((item) => h(HistoryCard, { key: item.id, item }))),
          ),
        ) : h('div', { style: styles.scrollBody },
          h(Card, { title: '命令试算器', sub: '粘贴一条命令，查看每段命令的判定结果' },
            h('textarea', { value: command, onChange: (event) => setCommand(event.target.value), placeholder: '例如：echo hello && rm -rf /tmp/example', style: styles.textarea }),
            h('div', { style: styles.actions }, h(Button, { primary: true, onClick: dryRun, disabled: !command }, '试算')),
            preview && h('pre', { style: styles.preview }, JSON.stringify(preview, null, 2)),
          ),
          h('div', { style: styles.sectionHeading },
            h('div', null, h('div', { style: styles.sectionTitle }, '规则库'), h('div', { style: styles.sectionSubtitle }, '只读展示当前生效的全局与工作区规则')),
            h('input', { value: ruleQuery, onChange: (event) => setRuleQuery(event.target.value), placeholder: '搜索规则 ID、程序或参数', style: styles.searchInput }),
          ),
          state.stores.length === 0 ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '尚未加载规则库。')) : state.stores.map((store) => {
            const query = ruleQuery.trim().toLowerCase();
            const rules = store.rules.filter((rule) => !query || JSON.stringify(rule).toLowerCase().includes(query));
            return h(Card, {
              key: `${store.workspace ?? 'global'}-${store.rulesDigest}`,
              title: store.workspace ? `工作区规则` : '全局规则',
              sub: `${rules.length}/${store.rules.length} 条 · ${store.confirmed ? '已确认' : '待确认'}${store.workspace ? ` · ${store.workspace}` : ''}`,
              actions: !store.confirmed && h(Button, { primary: true, onClick: () => confirmRules(store.workspace) }, '确认规则'),
            },
              rules.length === 0 ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '没有匹配的规则。')) : h('div', { style: styles.rulesList }, rules.map((rule, index) => h(RuleRow, { key: rule.id ?? index, rule, index }))),
            );
          }),
        ),
      );
    }

    const styles = {
      page: { display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 1100, margin: '0 auto', fontFamily: 'var(--dsw-alias-mono-font-family, system-ui, -apple-system, sans-serif)', color: 'var(--dsw-alias-label-primary)' },
      header: { display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 12px', flexShrink: 0 },
      title: { margin: 0, fontSize: 24, fontWeight: 700 },
      badge: { borderRadius: 999, padding: '2px 10px', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', fontSize: 13, fontWeight: 600 },
      badgeError: { borderRadius: 999, padding: '2px 10px', background: 'var(--dsw-alias-state-error-primary)', color: '#fff', fontSize: 13, fontWeight: 600 },
      badgeSuccess: { borderRadius: 999, padding: '2px 10px', background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent)', color: 'var(--dsw-alias-state-success-primary)', fontSize: 13, fontWeight: 600 },
      tabs: { display: 'flex', gap: 8, borderBottom: '1px solid var(--dsw-alias-border-l2)', margin: '0 24px', flexShrink: 0 },
      tab: { border: 0, background: 'transparent', padding: '12px 16px', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', fontSize: 14 },
      activeTab: { border: 0, borderBottom: '2px solid var(--dsw-alias-brand-primary)', background: 'transparent', padding: '12px 16px', cursor: 'pointer', color: 'var(--dsw-alias-label-primary)', fontSize: 14, fontWeight: 600 },
      scrollBody: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 24px 40px', scrollbarWidth: 'thin' },
      card: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, marginBottom: 14, padding: '14px 16px' },
      cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12 },
      cardTitle: { fontWeight: 600, fontSize: 15, color: 'var(--dsw-alias-label-primary)' },
      cardSub: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginTop: 3 },
      command: { display: 'block', whiteSpace: 'pre-wrap', marginBottom: 12, padding: 10, borderRadius: 6, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)', overflow: 'auto', fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 13 },
      reason: { margin: '0 0 12px', color: 'var(--dsw-alias-label-primary)', fontSize: 14 },
      sectionLabel: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', marginBottom: 6 },
      segmentBox: { marginBottom: 12 },
      segment: { padding: '6px 10px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 6, marginBottom: 6, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12 },
      actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
      button: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontFamily: 'inherit', fontSize: 12, transition: 'border-color 0.2s ease' },
      buttonPrimary: { border: '1px solid var(--dsw-alias-brand-primary)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)', color: 'var(--dsw-alias-brand-primary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, transition: 'border-color 0.2s ease' },
      section: { marginTop: 24 },
      sectionHeading: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
      sectionTitle: { margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      sectionSubtitle: { margin: '4px 0 0 0', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      historyList: { display: 'grid', gap: 8 },
      historyRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6 },
      historyCommand: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12 },
      textarea: { width: '100%', minHeight: 100, padding: 12, boxSizing: 'border-box', marginBottom: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 13, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-2)' },
      searchInput: { minWidth: 220, maxWidth: 320, flex: 1, padding: '6px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, fontFamily: 'inherit', fontSize: 13, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)' },
      preview: { background: 'var(--dsw-alias-bg-layer-2)', padding: 12, overflow: 'auto', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l2)', fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12 },
      rulesList: { display: 'grid', gap: 8 },
      ruleRow: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: 10, background: 'var(--dsw-alias-bg-layer-2)', display: 'flex', gap: 10, alignItems: 'flex-start' },
      ruleIndex: { width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, fontWeight: 700, flexShrink: 0 },
      ruleBody: { flex: 1, minWidth: 0 },
      ruleHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
      ruleId: { fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 13 },
      ruleDetails: { display: 'flex', flexWrap: 'wrap', gap: 12, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      allowTag: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, fontWeight: 600 },
      denyTag: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, fontWeight: 600 },
      muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13 },
      emptyPanel: { padding: '24px 0', textAlign: 'center' },
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
