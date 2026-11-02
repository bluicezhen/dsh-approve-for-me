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

    function ApprovalCard({ item, decide, grant, grantState, onViewRules }) {
      const state = grantState ?? {};
      const busy = state.loading;
      const generated = Array.isArray(state.rules) ? state.rules : null;
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
        state.error && h('div', { style: styles.grantError }, h('strong', null, '规则生成失败：'), h('span', null, state.error), h('div', { style: styles.actions }, h(Button, { onClick: () => grant(item) }, '重试'))),
        generated && generated.length > 0 && h('div', { style: styles.grantResult },
          h('div', { style: styles.grantTitle }, `已生成并锁定 ${generated.length} 条放行规则`),
          generated.map((rule, i) => h(RuleRow, { key: rule.id ?? i, rule, index: i, compact: true })),
          h('div', { style: styles.actions }, h(Button, { primary: true, onClick: () => onViewRules(generated) }, '在规则页查看')),
        ),
        !generated && !busy && h('div', { style: styles.actions },
          h(Button, { onClick: () => decide(item.id, 'allow', 'once') }, '仅此次'),
          h(Button, { onClick: () => decide(item.id, 'allow', 'session') }, '本会话'),
          h(Button, { primary: true, onClick: () => grant(item) }, '长期并锁定规则'),
          h(Button, { onClick: () => decide(item.id, 'deny', 'once') }, '拒绝'),
        ),
        busy && h('div', { style: styles.actions }, h(Button, { primary: true, disabled: true }, '正在生成并锁定规则…')),
      );
    }

    function HistoryCard({ item }) {
      return h('div', { style: styles.historyRow },
        h('span', { style: item.decision === 'allow' ? styles.allowTag : styles.denyTag }, item.decision === 'allow' ? '已放行' : '已拒绝'),
        h('code', { style: styles.historyCommand }, item.command),
        h('span', { style: styles.muted }, item.scope ?? 'once'),
      );
    }

    function RuleRow({ rule, index, compact, highlight }) {
      return h('div', { style: highlight ? { ...styles.ruleRow, ...styles.ruleRowHighlight } : styles.ruleRow, 'data-rule-id': rule.id ?? '' },
        h('div', { style: styles.ruleIndex }, String(index + 1).padStart(2, '0')),
        h('div', { style: styles.ruleBody },
          h('div', { style: styles.ruleHeader },
            h('strong', { style: styles.ruleId }, rule.id ?? '未命名规则'),
            h('span', { style: rule.effect === 'deny' ? styles.denyTag : styles.allowTag }, rule.effect === 'deny' ? '拒绝' : '放行'),
            highlight && h('span', { style: styles.newTag }, '新'),
          ),
          h('div', { style: styles.ruleDetails },
            h('span', null, `程序：${rule.program ?? '*'}`),
            h('span', null, `参数：${formatArgs(rule.args)}`),
            !compact && h('span', null, `作用域：${rule.scope ?? '默认'}`),
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
      const [error, setError] = React.useState(null);
      React.useEffect(() => {
        window.addEventListener('error', (event) => { setError(event.error?.message ?? String(event.error)); });
        window.addEventListener('unhandledrejection', (event) => { setError(event.reason?.message ?? String(event.reason)); });
      }, []);
      const [command, setCommand] = React.useState('');
      const [preview, setPreview] = React.useState(null);
      const [ruleQuery, setRuleQuery] = React.useState('');
      const [confirming, setConfirming] = React.useState(false);
      const [grants, setGrants] = React.useState({});
      const [focusRuleIds, setFocusRuleIds] = React.useState([]);
      const refresh = React.useCallback(() => fetch(`${API}/state`).then((r) => r.json()).then((next) => {
        const safe = {
          queue: { pending: Array.isArray(next?.queue?.pending) ? next.queue.pending : [], history: Array.isArray(next?.queue?.history) ? next.queue.history : [] },
          stores: Array.isArray(next?.stores) ? next.stores.map((store) => ({ ...store, rules: Array.isArray(store?.rules) ? store.rules : [], added: Array.isArray(store?.added) ? store.added : [], removed: Array.isArray(store?.removed) ? store.removed : [], modified: Array.isArray(store?.modified) ? store.modified : [] })) : [],
        };
        setState(safe);
      }).catch((err) => setError(err.message)), []);
      React.useEffect(() => { refresh(); const timer = setInterval(refresh, 500); return () => clearInterval(timer); }, [refresh]);
      const decide = (id, decision, scope) => fetch(`${API}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision, scope }) }).then(refresh);
      const grant = (item) => {
        setGrants((prev) => ({ ...prev, [item.id]: { loading: true, command: item.command, workspace: item.workspace } }));
        return fetch(`${API}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, decision: 'allow', scope: 'permanent' }) })
          .then((r) => r.json().then((body) => ({ status: r.status, body })))
          .then(({ status, body }) => {
            if (status === 200 && body.ok) {
              setGrants((prev) => ({ ...prev, [item.id]: { loading: false, command: item.command, workspace: item.workspace, rules: body.generatedRules ?? [] } }));
            } else {
              setGrants((prev) => ({ ...prev, [item.id]: { loading: false, command: item.command, error: body.error ?? '未知错误' } }));
            }
          })
          .catch((err) => setGrants((prev) => ({ ...prev, [item.id]: { loading: false, command: item.command, error: err.message } })))
          .then(refresh);
      };
      const viewRules = (rules) => {
        setFocusRuleIds((rules ?? []).map((rule) => rule.id));
        setRuleQuery('');
        setTab('rules');
      };
      const confirmRules = (workspace) => {
        setConfirming(true);
        return fetch(`${API}/rules/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace }) }).then(refresh).finally(() => setConfirming(false));
      };
      const dryRun = () => fetch(`${API}/dry-run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command }) }).then((r) => r.json()).then(setPreview).catch(() => setPreview({ error: '试算失败' }));
      if (error) return h('div', { style: styles.page }, h('div', { style: styles.errorBox }, h('h2', null, '界面渲染错误'), h('pre', { style: styles.errorPre }, error), h(Button, { onClick: () => { setError(null); refresh(); } }, '重试')));
      const unconfirmedStores = state.stores.filter((store) => !store.confirmed);
      return h('div', { style: styles.page },
        h('header', { style: styles.header },
          h('h1', { style: styles.title }, '命令审批'),
          state.queue.pending.length > 0 && h(Badge, { kind: 'error' }, String(state.queue.pending.length)),
        ),
        unconfirmedStores.length > 0 && h('div', { style: styles.banner },
          h('div', { style: styles.bannerText },
            h('strong', null, '有规则尚未确认，自动放行已暂停。'),
            h('span', null, '确认规则后，只有命中放行规则的命令才会自动执行；其余命令仍需人工审批。'),
          ),
          h(Button, { primary: true, disabled: confirming, onClick: () => setTab('rules') }, '去确认规则'),
        ),
        h('nav', { style: styles.tabs },
          h('button', { style: tab === 'approvals' ? styles.activeTab : styles.tab, onClick: () => setTab('approvals') }, '审批'),
          h('button', { style: tab === 'rules' ? styles.activeTab : styles.tab, onClick: () => setTab('rules') }, '规则'),
        ),
        tab === 'approvals' ? h('div', { style: styles.scrollBody },
          state.queue.pending.length === 0 ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '当前没有待审批命令。')) : state.queue.pending.map((item) => h(ApprovalCard, { key: item.id, item, decide, grant, grantState: grants[item.id], onViewRules: viewRules })),
          Object.keys(grants).filter((id) => Array.isArray(grants[id].rules) && grants[id].rules.length > 0).length > 0 && h('div', { style: styles.section },
            h('div', { style: styles.sectionHeading }, h('div', null, h('div', { style: styles.sectionTitle }, '刚刚生成并锁定的规则'), h('div', { style: styles.sectionSubtitle }, '这些规则已保存并确认，立即生效'))),
            h('div', { style: styles.historyList }, Object.keys(grants).filter((id) => Array.isArray(grants[id].rules) && grants[id].rules.length > 0).map((id) => {
              const entry = grants[id];
              return h('div', { key: `grant-${id}`, style: styles.grantResult },
                entry.command && h('code', { style: styles.historyCommand }, entry.command),
                h('div', { style: styles.grantTitle }, `已生成并锁定 ${entry.rules.length} 条放行规则`),
                entry.rules.map((rule, i) => h(RuleRow, { key: rule.id ?? i, rule, index: i, compact: true })),
                h('div', { style: styles.actions }, h(Button, { primary: true, onClick: () => viewRules(entry.rules) }, '在规则页查看')),
              );
            }),
          )),
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
              actions: !store.confirmed && h(Button, { primary: true, disabled: confirming, onClick: () => confirmRules(store.workspace) }, confirming ? '确认中…' : '确认规则'),
            },
              rules.length === 0 ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '没有匹配的规则。')) : h('div', { style: styles.rulesList }, rules.map((rule, index) => h(RuleRow, { key: rule.id ?? index, rule, index, highlight: focusRuleIds.includes(rule.id) }))),
              (store.added.length > 0 || store.removed.length > 0 || store.modified.length > 0) && h('div', { style: styles.changeBox },
                h('div', { style: styles.sectionLabel }, '待确认变更'),
                store.added.length > 0 && h('div', null, h('div', { style: styles.changeTitle }, `新增 ${store.added.length} 条`), store.added.map((rule, i) => h(RuleRow, { key: `added-${rule.id ?? i}`, rule, index: i }))),
                store.removed.length > 0 && h('div', null, h('div', { style: styles.changeTitle }, `删除 ${store.removed.length} 条`), store.removed.map((rule, i) => h(RuleRow, { key: `removed-${rule.id ?? i}`, rule, index: i }))),
                store.modified.length > 0 && h('div', null, h('div', { style: styles.changeTitle }, `修改 ${store.modified.length} 条`), store.modified.map((rule, i) => h(RuleRow, { key: `modified-${rule.id ?? i}`, rule, index: i }))),
              ),
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
      ruleRowHighlight: { borderColor: 'var(--dsw-alias-brand-primary)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent)' },
      newTag: { color: 'var(--dsw-alias-brand-primary)', border: '1px solid var(--dsw-alias-brand-primary)', borderRadius: 999, padding: '0 6px', fontSize: 10, fontWeight: 700 },
      ruleIndex: { width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, fontWeight: 700, flexShrink: 0 },
      ruleBody: { flex: 1, minWidth: 0 },
      ruleHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
      ruleId: { fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 13 },
      ruleDetails: { display: 'flex', flexWrap: 'wrap', gap: 12, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      allowTag: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, fontWeight: 600 },
      denyTag: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, fontWeight: 600 },
      muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13 },
      emptyPanel: { padding: '24px 0', textAlign: 'center' },
      changeBox: { marginTop: 14, padding: 12, border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: 6, background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 6%, transparent)' },
      changeTitle: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, fontWeight: 600, margin: '8px 0 6px' },
      grantResult: { marginTop: 12, padding: 12, border: '1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)', borderRadius: 6, background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)' },
      grantTitle: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 12, fontWeight: 700, marginBottom: 8 },
      grantError: { marginTop: 12, padding: 12, border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)', borderRadius: 6, background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)', fontSize: 13 },
      errorBox: { padding: 24, margin: 24, border: '1px solid var(--dsw-alias-state-error-primary)', borderRadius: 10, background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)' },
      errorPre: { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontSize: 12, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)' },
      banner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 24px 12px', padding: '10px 14px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent)', background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)' },
      bannerText: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
      iconWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      iconBadge: { position: 'absolute', top: -8, right: -12, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 999, background: 'var(--dsw-alias-state-error-primary)', color: '#fff', fontSize: 10, lineHeight: '16px', textAlign: 'center', fontWeight: 700 },
      iconDot: { position: 'absolute', top: -8, right: -10, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: 'var(--dsw-alias-state-warn-primary)', color: '#fff', fontSize: 10, lineHeight: '15px', textAlign: 'center', fontWeight: 700 },
    };

    function Icon({ size }) {
      const [count, setCount] = React.useState(0);
      const [needsAttention, setNeedsAttention] = React.useState(false);
      React.useEffect(() => {
        let active = true;
        const refresh = () => fetch(`${API}/state`).then((r) => r.json()).then((next) => {
          if (!active) return;
          setCount(next.queue?.pending?.length ?? 0);
          setNeedsAttention(Array.isArray(next?.stores) && next.stores.some((store) => store && store.confirmed === false));
        }).catch(() => {});
        refresh();
        const timer = setInterval(refresh, 500);
        return () => { active = false; clearInterval(timer); };
      }, []);
      const label = count ? `有 ${count} 条待审批命令` : needsAttention ? '有规则待确认' : '没有待审批命令';
      return h('span', { style: styles.iconWrap, 'aria-label': label },
        h('span', { 'aria-hidden': true, style: { fontSize: size ? `${size}px` : '18px' } }, '🛡'),
        count > 0
          ? h('span', { style: styles.iconBadge }, count > 99 ? '99+' : String(count))
          : needsAttention ? h('span', { style: styles.iconDot }, '!') : null,
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
