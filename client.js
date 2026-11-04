window.__ModuleLoader__.load({
  id: 'dsh-approve-for-me',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'approve-for-me';
    const API = '/api/approve-for-me';

    const C = {
      bg: '#f4f7fb',
      panel: '#ffffff',
      panel2: '#f7f9fc',
      line: '#dce3ee',
      text: '#172033',
      muted: '#6e7b8f',
      accent: '#3d6fca',
      green: '#218653',
      greenBg: '#e2f5e9',
      red: '#c94b58',
      redBg: '#ffe8eb',
      yellowText: '#795317',
      yellowBg: '#fff8e7',
    };

    function Button({ children, onClick, disabled, primary, danger }) {
      const base = danger ? styles.buttonDanger : primary ? styles.buttonPrimary : styles.button;
      return h('button', { type: 'button', disabled, onClick, style: disabled ? { ...base, opacity: 0.6, cursor: 'default' } : base }, children);
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

    const act = (fn) => (event) => { event.stopPropagation(); fn(); };

    function ApprovalCard({ item, decide, grant, grantState, onViewRules, selected, onSelect }) {
      const state = grantState ?? {};
      const busy = state.loading;
      const generated = Array.isArray(state.rules) ? state.rules : null;
      return h('div', {
        style: selected ? { ...styles.approvalCard, ...styles.approvalCardSelected } : styles.approvalCard,
        onClick: () => onSelect?.(item.id),
      },
        h('div', { style: styles.approvalTop },
          h('code', { style: styles.command }, item.command),
          h('span', { style: styles.time }, item.createdAt ? new Date(item.createdAt).toLocaleString() : ''),
        ),
        h('div', { style: styles.reason }, item.reason),
        state.error && h('div', { style: styles.grantError }, h('strong', null, '规则生成失败：'), h('span', null, state.error), h('div', { style: styles.actions }, h(Button, { onClick: act(() => grant(item)) }, '重试'))),
        generated && generated.length > 0 && h('div', { style: styles.grantResult },
          h('div', { style: styles.grantTitle }, `已生成并锁定 ${generated.length} 条放行规则`),
          generated.map((rule, i) => h(RuleRow, { key: rule.id ?? i, rule, index: i, compact: true })),
          h('div', { style: styles.actions }, h(Button, { primary: true, onClick: act(() => onViewRules(generated)) }, '在规则列表查看')),
        ),
        !generated && !busy && h('div', { style: styles.actions },
          h(Button, { onClick: act(() => decide(item.id, 'allow', 'once')) }, '仅此次'),
          h(Button, { onClick: act(() => decide(item.id, 'allow', 'session')) }, '本会话'),
          h(Button, { primary: true, onClick: act(() => grant(item)) }, '长期并锁定规则'),
          h(Button, { danger: true, onClick: act(() => decide(item.id, 'deny', 'once')) }, '拒绝'),
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
      const [state, setState] = React.useState({ queue: { pending: [], history: [] }, stores: [] });
      const [error, setError] = React.useState(null);
      React.useEffect(() => {
        window.addEventListener('error', (event) => { setError(event.error?.message ?? String(event.error)); });
        window.addEventListener('unhandledrejection', (event) => { setError(event.reason?.message ?? String(event.reason)); });
      }, []);
      const [ruleQuery, setRuleQuery] = React.useState('');
      const [confirming, setConfirming] = React.useState(false);
      const [grants, setGrants] = React.useState({});
      const [focusRuleIds, setFocusRuleIds] = React.useState([]);
      const [selectedId, setSelectedId] = React.useState(null);
      const rulesRef = React.useRef(null);
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
      const goRules = () => rulesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const viewRules = (rules) => {
        setFocusRuleIds((rules ?? []).map((rule) => rule.id));
        setRuleQuery('');
        goRules();
      };
      const confirmRules = (workspace) => {
        setConfirming(true);
        return fetch(`${API}/rules/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace }) }).then(refresh).finally(() => setConfirming(false));
      };
      if (error) return h('div', { style: styles.page }, h('div', { style: styles.errorBox }, h('h2', null, '界面渲染错误'), h('pre', { style: styles.errorPre }, error), h(Button, { onClick: () => { setError(null); refresh(); } }, '重试')));
      const unconfirmedStores = state.stores.filter((store) => !store.confirmed);
      const pending = state.queue.pending;
      const selectedItem = pending.find((item) => item.id === selectedId) ?? pending[0] ?? null;
      const selectedSegments = (selectedItem?.decision?.segments ?? []).filter((s) => s.verdict !== 'auto-allow');
      const generatedGrants = Object.keys(grants).filter((id) => Array.isArray(grants[id].rules) && grants[id].rules.length > 0);
      return h('div', { style: styles.page },
        h('header', { style: styles.header },
          h('div', null,
            h('div', { style: styles.eyebrow }, 'COMMAND GATE'),
            h('h1', { style: styles.title }, '命令审批'),
          ),
          pending.length > 0 ? h(Badge, { kind: 'error' }, `${pending.length} 条待审批`) : h('span', { style: styles.headerHint }, '暂无待审批'),
        ),
        unconfirmedStores.length > 0 && h('div', { style: styles.banner },
          h('div', { style: styles.bannerText },
            h('strong', null, '有规则尚未确认，自动放行已暂停。'),
            h('span', null, '确认规则后，只有命中放行规则的命令才会自动执行；其余命令仍需人工审批。'),
          ),
          h(Button, { primary: true, disabled: confirming, onClick: goRules }, '去确认规则'),
        ),
        h('div', { style: styles.workspace },
          h('section', { style: styles.column },
            h('div', { style: styles.panelHead },
              h('div', null,
                h('div', { style: styles.panelTitle }, '审批队列'),
                h('div', { style: styles.panelMeta }, '命令执行前的人工决策'),
              ),
              pending.length > 0 && h(Badge, { kind: 'error' }, String(pending.length)),
            ),
            h('div', { style: styles.columnBody },
              h('div', { style: styles.group },
                h('div', { style: styles.groupHead },
                  h('span', { style: styles.groupTitle }, '待审批'),
                  pending.length > 0 && h('span', { style: styles.groupMeta }, `${pending.length} 条`),
                ),
                pending.length === 0
                  ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '当前没有待审批命令。'))
                  : pending.map((item) => h(ApprovalCard, { key: item.id, item, decide, grant, grantState: grants[item.id], onViewRules: viewRules, selected: selectedItem?.id === item.id, onSelect: setSelectedId })),
              ),
              h('div', { style: styles.group },
                h('div', { style: styles.groupHead },
                  h('span', { style: styles.groupTitle }, '已审批'),
                  h('span', { style: styles.groupMeta }, '最近 100 条'),
                ),
                state.queue.history.length === 0
                  ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '暂无审批记录。'))
                  : h('div', { style: styles.historyList }, state.queue.history.map((item) => h(HistoryCard, { key: item.id, item }))),
              ),
              generatedGrants.length > 0 && h('div', { style: styles.section },
                h('div', { style: styles.sectionHeading }, h('div', null, h('div', { style: styles.sectionTitle }, '刚刚生成并锁定的规则'), h('div', { style: styles.sectionSubtitle }, '这些规则已保存并确认，立即生效'))),
                h('div', { style: styles.historyList }, generatedGrants.map((id) => {
                  const entry = grants[id];
                  return h('div', { key: `grant-${id}`, style: styles.grantResult },
                    entry.command && h('code', { style: styles.historyCommand }, entry.command),
                    h('div', { style: styles.grantTitle }, `已生成并锁定 ${entry.rules.length} 条放行规则`),
                    entry.rules.map((rule, i) => h(RuleRow, { key: rule.id ?? i, rule, index: i, compact: true })),
                    h('div', { style: styles.actions }, h(Button, { primary: true, onClick: () => viewRules(entry.rules) }, '在规则列表查看')),
                  );
                })),
              ),
            ),
          ),
          h('aside', { style: styles.column, ref: rulesRef },
            h('div', { style: styles.panelHead },
              h('div', null,
                h('div', { style: styles.panelTitle }, '规则列表'),
                h('div', { style: styles.panelMeta }, '已确认规则 · 全局与工作区'),
              ),
              h('input', { value: ruleQuery, onChange: (event) => setRuleQuery(event.target.value), placeholder: '搜索规则', style: styles.searchInput }),
            ),
            h('div', { style: styles.rulesScroll },
              state.stores.length === 0
                ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '尚未加载规则库。'))
                : state.stores.map((store) => {
                  const query = ruleQuery.trim().toLowerCase();
                  const rules = store.rules.filter((rule) => !query || JSON.stringify(rule).toLowerCase().includes(query));
                  return h(Card, {
                    key: `${store.workspace ?? 'global'}-${store.rulesDigest}`,
                    title: store.workspace ? '工作区规则' : '全局规则',
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
            h('div', { style: styles.detail },
              selectedItem
                ? h('div', null,
                  h('div', { style: styles.detailLabel }, '当前选中命令'),
                  h('code', { style: styles.detailCommand }, selectedItem.command),
                  h('div', { style: styles.detailLabel }, '判定说明'),
                  h('div', { style: styles.callout }, selectedItem.reason ?? '该命令未命中放行规则，需要人工确认。'),
                  selectedSegments.length > 0 && h('div', null,
                    h('div', { style: styles.detailLabel }, '未命中的命令段'),
                    selectedSegments.map((segment, i) => h('div', { key: i, style: styles.segment }, segment.text)),
                  ),
                )
                : h('div', { style: styles.detailEmpty }, '选择一条待审批命令查看详情。'),
            ),
          ),
        ),
      );
    }

    const styles = {
      page: { display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box', color: C.text, background: C.bg, colorScheme: 'light', fontFamily: 'var(--dsw-alias-mono-font-family, system-ui, -apple-system, sans-serif)' },
      header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '20px 28px 12px', flexShrink: 0 },
      eyebrow: { color: C.accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' },
      title: { margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: C.text },
      headerHint: { color: C.muted, fontSize: 13 },
      badge: { borderRadius: 999, padding: '2px 10px', background: '#e7efff', color: '#315ca5', fontSize: 13, fontWeight: 600 },
      badgeError: { borderRadius: 999, padding: '2px 10px', background: C.redBg, color: C.red, fontSize: 13, fontWeight: 600 },
      badgeSuccess: { borderRadius: 999, padding: '2px 10px', background: C.greenBg, color: C.green, fontSize: 13, fontWeight: 600 },
      banner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 24px 12px', padding: '10px 14px', borderRadius: 8, border: `1px solid #ecd9ae`, background: C.yellowBg },
      bannerText: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, color: C.text },
      workspace: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(340px, 0.65fr)', gap: 18, padding: '0 24px 20px' },
      column: { display: 'flex', flexDirection: 'column', minHeight: 0, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' },
      panelHead: { padding: '16px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 },
      panelTitle: { fontWeight: 700, fontSize: 15, color: C.text },
      panelMeta: { fontSize: 12, color: C.muted, marginTop: 3 },
      columnBody: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, scrollbarWidth: 'thin' },
      group: { marginBottom: 22 },
      groupHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 9px' },
      groupTitle: { fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: '0.03em' },
      groupMeta: { fontSize: 11, color: C.muted },
      approvalCard: { background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px', marginBottom: 9, cursor: 'pointer', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' },
      approvalCardSelected: { borderColor: '#6f9ce9', boxShadow: '0 0 0 2px rgba(61, 111, 202, 0.18)' },
      approvalTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
      command: { fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 13, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
      reason: { fontSize: 12, color: C.muted, margin: '7px 0 0', lineHeight: 1.5 },
      time: { whiteSpace: 'nowrap', color: C.muted, fontSize: 11, flexShrink: 0 },
      actions: { display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 },
      button: { border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', background: '#ffffff', color: '#24344f', fontFamily: 'inherit', fontSize: 12 },
      buttonPrimary: { border: `1px solid ${C.accent}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', background: C.accent, color: '#ffffff', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 },
      buttonDanger: { border: '1px solid #e6aab2', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', background: '#fff4f5', color: '#b33f4b', fontFamily: 'inherit', fontSize: 12 },
      section: { marginTop: 22 },
      sectionHeading: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
      sectionTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: C.text },
      sectionSubtitle: { margin: '4px 0 0 0', color: C.muted, fontSize: 12 },
      sectionLabel: { color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', marginBottom: 6 },
      historyList: { display: 'grid', gap: 8 },
      historyRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8 },
      historyCommand: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12, color: C.text },
      card: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 14, padding: '14px 16px' },
      cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12 },
      cardTitle: { fontWeight: 600, fontSize: 14, color: C.text },
      cardSub: { color: C.muted, fontSize: 12, marginTop: 3 },
      searchInput: { width: 140, padding: '7px 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: 'inherit', fontSize: 12, color: C.text, background: '#ffffff', outline: 'none' },
      rulesScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, scrollbarWidth: 'thin' },
      rulesList: { display: 'grid', gap: 8 },
      ruleRow: { border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, background: C.panel2, display: 'flex', gap: 10, alignItems: 'flex-start' },
      ruleRowHighlight: { borderColor: C.accent, boxShadow: '0 0 0 2px rgba(61, 111, 202, 0.22)' },
      newTag: { color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 999, padding: '0 6px', fontSize: 10, fontWeight: 700 },
      ruleIndex: { width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', color: C.muted, fontSize: 11, fontWeight: 700, flexShrink: 0 },
      ruleBody: { flex: 1, minWidth: 0 },
      ruleHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
      ruleId: { fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12, color: '#344660' },
      ruleDetails: { display: 'flex', flexWrap: 'wrap', gap: 12, color: C.muted, fontSize: 12 },
      allowTag: { color: C.green, fontSize: 12, fontWeight: 600 },
      denyTag: { color: C.red, fontSize: 12, fontWeight: 600 },
      muted: { color: C.muted, fontSize: 13 },
      emptyPanel: { padding: '20px 0', textAlign: 'center' },
      changeBox: { marginTop: 14, padding: 12, border: '1px dashed #e2cc9b', borderRadius: 8, background: C.yellowBg },
      changeTitle: { color: C.yellowText, fontSize: 12, fontWeight: 600, margin: '8px 0 6px' },
      grantResult: { marginTop: 12, padding: 12, border: '1px solid #b8e0ca', borderRadius: 8, background: C.greenBg },
      grantTitle: { color: C.green, fontSize: 12, fontWeight: 700, marginBottom: 8 },
      grantError: { marginTop: 12, padding: 12, border: '1px solid #ecc0c5', borderRadius: 8, background: C.redBg, fontSize: 13, color: C.text },
      detail: { borderTop: `1px solid ${C.line}`, padding: '14px 18px', maxHeight: '42%', overflowY: 'auto', flexShrink: 0, scrollbarWidth: 'thin' },
      detailLabel: { color: C.muted, fontSize: 11, fontWeight: 600, margin: '14px 0 7px' },
      detailCommand: { display: 'block', fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12.5, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: C.text },
      detailEmpty: { color: C.muted, padding: '10px 2px', fontSize: 12 },
      callout: { borderLeft: `3px solid ${C.yellowText}`, background: C.yellowBg, color: C.yellowText, padding: '9px 11px', borderRadius: 6, fontSize: 12, lineHeight: 1.5 },
      segmentBox: { marginBottom: 12 },
      segment: { padding: '6px 10px', background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, marginBottom: 6, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12, color: C.text, wordBreak: 'break-word' },
      errorBox: { padding: 24, margin: 24, border: `1px solid ${C.red}`, borderRadius: 10, background: C.redBg },
      errorPre: { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontSize: 12, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)' },
      iconWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      iconBadge: { position: 'absolute', top: -8, right: -12, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 999, background: C.red, color: '#fff', fontSize: 10, lineHeight: '16px', textAlign: 'center', fontWeight: 700 },
      iconDot: { position: 'absolute', top: -8, right: -10, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: C.yellowText, color: '#fff', fontSize: 10, lineHeight: '15px', textAlign: 'center', fontWeight: 700 },
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
