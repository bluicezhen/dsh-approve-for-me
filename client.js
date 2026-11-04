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

    function segmentDisplay(segment, decision) {
      if (typeof segment === 'string') return { text: segment, verdict: 'pending', reason: decision?.reason ?? '命令包含无法静态判定的构造' };
      return { text: segment?.text ?? '', verdict: segment?.verdict ?? 'pending', reason: segment?.reason ?? '' };
    }

    function SegmentList({ decision, onlyBlocked, compact }) {
      const all = Array.isArray(decision?.segments) ? decision.segments : [];
      const items = onlyBlocked ? all.filter((segment) => typeof segment === 'string' || segment.verdict !== 'auto-allow') : all;
      if (!items.length) return null;
      return h('div', { style: compact ? styles.segmentListCompact : styles.segmentList },
        items.map((segment, index) => {
          const info = segmentDisplay(segment, decision);
          const tagStyle = info.verdict === 'auto-allow' ? styles.segmentTagAllow : info.verdict === 'denied' ? styles.segmentTagDeny : styles.segmentTagPending;
          const tagText = info.verdict === 'auto-allow' ? '可放行' : info.verdict === 'denied' ? '拦截' : '待审批';
          return h('div', { key: index, style: styles.segmentRow },
            h('div', { style: styles.segmentHead },
              h('span', { style: tagStyle }, tagText),
              h('code', { style: styles.segmentText }, info.text),
            ),
            info.reason && h('div', { style: styles.segmentReason }, info.reason),
          );
        }),
      );
    }

    function ApprovalCard({ item, decide, previewGrant, grantState, onViewRules, selected, onSelect }) {
      const state = grantState ?? {};
      const busy = state.loading;
      const generated = Array.isArray(state.rules) ? state.rules : null;
      const allSegments = Array.isArray(item.decision?.segments) ? item.decision.segments : [];
      const blockedCount = allSegments.filter((segment) => typeof segment === 'string' || segment.verdict !== 'auto-allow').length;
      const autoAllowCount = allSegments.length - blockedCount;
      const grantBlocked = allSegments.some((segment) => typeof segment === 'string');
      return h('div', {
        style: selected ? { ...styles.approvalCard, ...styles.approvalCardSelected } : styles.approvalCard,
        onClick: () => onSelect?.(item.id),
      },
        h('div', { style: styles.approvalTop },
          h('code', { style: styles.command }, item.command),
          h('span', { style: styles.time }, item.createdAt ? new Date(item.createdAt).toLocaleString() : ''),
        ),
        h('div', { style: styles.reason }, item.reason),
        blockedCount > 0 && h('div', { style: styles.segmentSummary },
          h('div', { style: styles.sectionLabel }, `命令段判定 · ${blockedCount} 段待处理`),
          h(SegmentList, { decision: item.decision, onlyBlocked: true, compact: true }),
          autoAllowCount > 0 && h('div', { style: styles.segmentSummaryNote }, `其余 ${autoAllowCount} 段可自动放行`),
        ),
        state.error && h('div', { style: styles.grantError }, h('strong', null, '规则生成失败：'), h('span', null, state.error), h('div', { style: styles.actions }, h(Button, { onClick: act(() => previewGrant(item)) }, '重试'))),
        generated && generated.length > 0 && h('div', { style: styles.grantResult },
          h('div', { style: styles.grantTitle }, `已生成并锁定 ${generated.length} 条放行规则${state.target === 'global' ? '（全局）' : '（当前工作区）'}`),
          generated.map((rule, i) => h(RuleRow, { key: rule.id ?? i, rule, index: i, compact: true })),
          h('div', { style: styles.actions }, h(Button, { primary: true, onClick: act(() => onViewRules(generated)) }, '在规则列表查看')),
        ),
        !generated && !busy && h('div', { style: styles.actions },
          h(Button, { onClick: act(() => decide(item.id, 'allow', 'once')) }, '仅此次'),
          h(Button, { onClick: act(() => decide(item.id, 'allow', 'session')) }, '本会话'),
          grantBlocked
            ? h(Button, { disabled: true, title: '该命令含有无法静态判定的构造，不能生成长期规则' }, '长期并锁定规则…')
            : h(Button, { primary: true, onClick: act(() => previewGrant(item)) }, '长期并锁定规则…'),
          h(Button, { danger: true, onClick: act(() => decide(item.id, 'deny', 'once')) }, '拒绝'),
        ),
        grantBlocked && h('div', { style: styles.opaqueHint }, '该命令包含重定向到文件、命令替换等不可判定构造，无法长期放行；可使用「仅此次」或「本会话」。'),
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

    function RuleRow({ rule, index, compact, highlight, onDelete }) {
      const generatedId = typeof rule.id === 'string' && /^human-\d+-\d+$/.test(rule.id);
      const baseStyle = compact ? { ...styles.ruleRow, ...styles.ruleRowCompact } : styles.ruleRow;
      return h('div', { style: highlight ? { ...baseStyle, ...styles.ruleRowHighlight } : baseStyle, 'data-rule-id': rule.id ?? '' },
        h('div', { style: styles.ruleIndex }, String(index + 1).padStart(2, '0')),
        h('div', { style: styles.ruleBody },
          h('div', { style: styles.ruleHeader },
            !generatedId && h('strong', { style: styles.ruleId }, rule.id ?? '未命名规则'),
            h('span', { style: rule.effect === 'deny' ? styles.denyTag : styles.allowTag }, rule.effect === 'deny' ? '拒绝' : '放行'),
            highlight && h('span', { style: styles.newTag }, '新'),
            onDelete && h('button', { type: 'button', style: styles.ruleDeleteButton, title: '删除规则', 'aria-label': '删除规则', onClick: (event) => { event.stopPropagation(); onDelete(); } }, '删除'),
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
      if (!Array.isArray(args) || args.length === 0) return '无参数';
      if (args.length === 1 && args[0]?.kind === 'rest') return '任意参数';
      return args.map((arg) => {
        if (typeof arg === 'string') return arg;
        if (!arg || typeof arg !== 'object') return String(arg);
        if (arg.kind === 'literal') return arg.value ?? '';
        if (arg.kind === 'rest') return '任意参数';
        if (arg.kind === 'any') return '任意单个参数';
        if (arg.kind === 'pathWithinWorkspace') return '工作区内路径';
        return arg.kind ?? '匹配';
      }).join(' ');
    }

    function ruleArgsToEditor(args) {
      const list = Array.isArray(args) ? args : [];
      if (list.length === 1 && list[0]?.kind === 'rest') return { anyArgs: true, args: [] };
      return {
        anyArgs: false,
        args: list.map((arg) => typeof arg === 'string'
          ? arg
          : arg?.kind === 'literal'
            ? arg.value ?? ''
            : arg?.kind === 'any'
              ? '*'
              : ''),
      };
    }

    function GrantPreviewDialog({ preview, onChangeTarget, onChangeRule, onAddRule, onRemoveRule, onCancel, onConfirm }) {
      const saving = preview.saving;
      return h('div', { style: styles.overlay, onClick: onCancel },
        h('div', { style: styles.dialog, onClick: (event) => event.stopPropagation() },
          h('div', { style: styles.dialogHead },
            h('div', null,
              h('div', { style: styles.dialogTitle }, '预览并确认长期放行规则'),
              h('div', { style: styles.dialogSub }, '下面是将写入并立即确认的规则，可直接修改后再保存。'),
            ),
            h('button', { type: 'button', style: styles.dialogClose, onClick: onCancel, 'aria-label': '关闭' }, '×'),
          ),
          h('div', { style: styles.dialogBody },
            h('div', { style: styles.targetRow },
              h('span', { style: styles.editorLabel }, '写入位置'),
              h('select', { value: preview.target, onChange: (event) => onChangeTarget(event.target.value), style: styles.select },
                h('option', { value: 'workspace' }, '当前工作区'),
                h('option', { value: 'global' }, '全局'),
              ),
              h('span', { style: styles.targetHint }, preview.target === 'global' ? '全局规则对所有工作区生效' : `仅作用于 ${preview.workspace ?? '当前工作区'}`),
            ),
            preview.loading && h('div', { style: styles.dialogEmpty }, '正在生成规则预览…'),
            preview.error && h('div', { style: styles.dialogError }, preview.error),
            !preview.loading && preview.rules.length === 0 && h('div', { style: styles.dialogEmpty }, '至少保留一条规则才能写入。'),
            preview.rules.map((rule, index) => h('div', { key: rule.id || index, style: styles.editorCard },
              h('div', { style: styles.editorTop },
                h('span', { style: styles.editorIndex }, String(index + 1).padStart(2, '0')),
                h('select', { value: rule.effect, onChange: (event) => onChangeRule(index, { effect: event.target.value }), style: styles.select },
                  h('option', { value: 'allow' }, '放行'),
                  h('option', { value: 'deny' }, '拒绝'),
                ),
                h('input', { value: rule.program, placeholder: '程序', onChange: (event) => onChangeRule(index, { program: event.target.value }), style: styles.programInput }),
                h('button', { type: 'button', style: styles.textButton, onClick: () => onRemoveRule(index) }, '删除'),
              ),
              h('div', { style: styles.argsRow },
                h('span', { style: styles.editorLabel }, '参数'),
                h('label', { style: styles.anyArgsLabel },
                  h('input', { type: 'checkbox', checked: !!rule.anyArgs, onChange: (event) => onChangeRule(index, { anyArgs: event.target.checked }), style: styles.anyArgsCheckbox }),
                  '任意参数',
                ),
                rule.anyArgs
                  ? h('span', { style: styles.editorEmptyArg }, '匹配该程序的任意参数（包括无参数）')
                  : [
                    rule.args.length === 0 && h('span', { key: 'empty', style: styles.editorEmptyArg }, '无参数（仅匹配不带参数）'),
                    ...rule.args.map((arg, argIndex) => h('span', { key: argIndex, style: styles.argChip },
                      h('input', { value: arg, placeholder: '参数值', onChange: (event) => { const args = rule.args.slice(); args[argIndex] = event.target.value; onChangeRule(index, { args }); }, style: styles.argInput }),
                      h('button', { type: 'button', style: styles.argRemove, onClick: () => { const args = rule.args.slice(); args.splice(argIndex, 1); onChangeRule(index, { args }); }, 'aria-label': '移除参数' }, '×'),
                    )),
                    h('button', { key: 'add', type: 'button', style: styles.addArg, onClick: () => onChangeRule(index, { args: [...rule.args, ''] }) }, '+ 参数'),
                  ],
              ),
              h('div', { style: styles.editorScope }, '作用域：长期（human）'),
            )),
            !preview.loading && h('button', { type: 'button', style: styles.addRuleButton, onClick: onAddRule }, '+ 添加规则'),
          ),
          h('div', { style: styles.dialogFoot },
            h('span', { style: styles.dialogNote }, `共 ${preview.rules.length} 条规则`),
            h('div', { style: styles.actions },
              h(Button, { onClick: onCancel }, '取消'),
              h(Button, { primary: true, disabled: saving || preview.loading || preview.rules.length === 0, onClick: onConfirm }, saving ? '正在写入…' : '写入并确认'),
            ),
          ),
        ),
      );
    }

    function DeleteRuleDialog({ target, busy, error, onCancel, onConfirm }) {
      const rule = target.rule;
      return h('div', { style: styles.overlay, onClick: onCancel },
        h('div', { style: styles.dialogSmall, onClick: (event) => event.stopPropagation() },
          h('div', { style: styles.dialogHead },
            h('div', null,
              h('div', { style: styles.dialogTitle }, '删除规则'),
              h('div', { style: styles.dialogSub }, target.workspace ? '从当前工作区规则中删除' : '从全局规则中删除'),
            ),
            h('button', { type: 'button', style: styles.dialogClose, onClick: onCancel, 'aria-label': '关闭' }, '×'),
          ),
          h('div', { style: styles.dialogBody },
            error && h('div', { style: styles.dialogError }, error),
            h('div', { style: styles.deletePreview },
              h('div', { style: styles.deleteProgram }, rule.program ?? '*'),
              h('div', { style: styles.deleteArgs }, `参数：${formatArgs(rule.args)}`),
            ),
            h('div', { style: styles.deleteNote }, '删除后规则库会变为待确认状态，需要确认规则后才会恢复自动放行。'),
          ),
          h('div', { style: styles.dialogFoot },
            h('span', { style: styles.dialogNote }, target.workspace ? '目标：当前工作区' : '目标：全局'),
            h('div', { style: styles.actions },
              h(Button, { onClick: onCancel }, '取消'),
              h(Button, { danger: true, disabled: busy, onClick: onConfirm }, busy ? '删除中…' : '删除'),
            ),
          ),
        ),
      );
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
      const [preview, setPreview] = React.useState(null);
      const [deleteTarget, setDeleteTarget] = React.useState(null);
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
      const previewGrant = (item) => {
        setPreview({ itemId: item.id, itemCommand: item.command, workspace: item.workspace, target: 'workspace', rules: [], error: null, saving: false, loading: true });
        return fetch(`${API}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
          .then((r) => r.json().then((body) => ({ status: r.status, body })))
          .then(({ status, body }) => {
            if (status === 200 && body.ok) {
              setPreview({
                itemId: item.id,
                itemCommand: item.command,
                workspace: body.workspace ?? item.workspace,
                target: body.defaultTarget === 'global' ? 'global' : 'workspace',
                rules: (body.rules ?? []).map((rule) => {
                  const editor = ruleArgsToEditor(rule.args);
                  return {
                    id: rule.id,
                    effect: rule.effect === 'deny' ? 'deny' : 'allow',
                    program: rule.program ?? '',
                    anyArgs: editor.anyArgs,
                    args: editor.args,
                  };
                }),
                error: null,
                saving: false,
                loading: false,
              });
            } else {
              setPreview({ itemId: item.id, itemCommand: item.command, workspace: item.workspace, target: 'workspace', rules: [], error: body.error ?? '无法生成规则预览', saving: false, loading: false });
            }
          })
          .catch((err) => setPreview({ itemId: item.id, itemCommand: item.command, workspace: item.workspace, target: 'workspace', rules: [], error: err.message, saving: false, loading: false }));
      };
      const changePreviewTarget = (target) => {
        setPreview((prev) => prev ? { ...prev, target: target === 'global' ? 'global' : 'workspace' } : prev);
      };
      const changePreviewRule = (index, patch) => {
        setPreview((prev) => prev ? { ...prev, error: null, rules: prev.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) } : prev);
      };
      const addPreviewRule = () => {
        setPreview((prev) => prev ? { ...prev, error: null, rules: [...prev.rules, { id: `human-${Date.now()}-${prev.rules.length + 1}`, effect: 'allow', program: '', anyArgs: false, args: [] }] } : prev);
      };
      const removePreviewRule = (index) => {
        setPreview((prev) => prev ? { ...prev, rules: prev.rules.filter((_, i) => i !== index) } : prev);
      };
      const commitPreview = () => {
        if (!preview) return;
        const invalidIndex = preview.rules.findIndex((rule) => !rule.program.trim());
        if (invalidIndex >= 0) {
          setPreview((prev) => prev ? { ...prev, error: `第 ${invalidIndex + 1} 条规则缺少程序` } : prev);
          return;
        }
        const itemId = preview.itemId;
        const itemCommand = preview.itemCommand;
        const workspace = preview.workspace;
        const target = preview.target === 'global' ? 'global' : 'workspace';
        const rules = preview.rules.map((rule, index) => ({
          id: rule.id || `human-${Date.now()}-${index + 1}`,
          effect: rule.effect === 'deny' ? 'deny' : 'allow',
          program: rule.program.trim(),
          args: rule.anyArgs ? [{ kind: 'rest' }] : rule.args.map((value) => ({ kind: 'literal', value })),
        }));
        setPreview((prev) => prev ? { ...prev, saving: true, error: null } : prev);
        return fetch(`${API}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: itemId, decision: 'allow', scope: 'permanent', rules, target }) })
          .then((r) => r.json().then((body) => ({ status: r.status, body })))
          .then(({ status, body }) => {
            if (status === 200 && body.ok) {
              setGrants((prev) => ({ ...prev, [itemId]: { loading: false, command: itemCommand, workspace, rules: body.generatedRules ?? [], target: body.target ?? target } }));
              setPreview(null);
            } else {
              setPreview((prev) => prev ? { ...prev, saving: false, error: body.error ?? '写入失败' } : prev);
            }
          })
          .catch((err) => setPreview((prev) => prev ? { ...prev, saving: false, error: err.message } : prev))
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
      const requestDeleteRule = (store, rule) => setDeleteTarget({ workspace: store.workspace, rule, busy: false, error: null });
      const cancelDeleteRule = () => setDeleteTarget(null);
      const confirmDeleteRule = () => {
        if (!deleteTarget) return;
        const { workspace, rule } = deleteTarget;
        setDeleteTarget((prev) => prev ? { ...prev, busy: true, error: null } : prev);
        return fetch(`${API}/rules/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace, id: rule.id }) })
          .then((r) => r.json().then((body) => ({ status: r.status, body })))
          .then(({ status, body }) => {
            if (status === 200 && body.ok) {
              setDeleteTarget(null);
              refresh();
            } else {
              setDeleteTarget((prev) => prev ? { ...prev, busy: false, error: body.error ?? '删除失败' } : prev);
            }
          })
          .catch((err) => setDeleteTarget((prev) => prev ? { ...prev, busy: false, error: err.message } : prev));
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
                  : pending.map((item) => h(ApprovalCard, { key: item.id, item, decide, previewGrant, grantState: grants[item.id], onViewRules: viewRules, selected: selectedItem?.id === item.id, onSelect: setSelectedId })),
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
                    h('div', { style: styles.grantTitle }, `已生成并锁定 ${entry.rules.length} 条放行规则${entry.target === 'global' ? '（全局）' : '（当前工作区）'}`),
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
                    rules.length === 0 ? h('div', { style: styles.emptyPanel }, h('p', { style: styles.muted }, '没有匹配的规则。')) : h('div', { style: styles.rulesList }, rules.slice().reverse().map((rule, index) => h(RuleRow, { key: rule.id ?? index, rule, index, highlight: focusRuleIds.includes(rule.id), onDelete: rule.id ? () => requestDeleteRule(store, rule) : undefined }))),
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
                    h('div', { style: styles.detailLabel }, '命令段判定'),
                    h(SegmentList, { decision: selectedItem.decision, onlyBlocked: false }),
                  ),
                )
                : h('div', { style: styles.detailEmpty }, '选择一条待审批命令查看详情。'),
            ),
          ),
        ),
        preview && h(GrantPreviewDialog, {
          preview,
          onChangeTarget: changePreviewTarget,
          onChangeRule: changePreviewRule,
          onAddRule: addPreviewRule,
          onRemoveRule: removePreviewRule,
          onCancel: () => setPreview(null),
          onConfirm: commitPreview,
        }),
        deleteTarget && h(DeleteRuleDialog, {
          target: deleteTarget,
          busy: deleteTarget.busy,
          error: deleteTarget.error,
          onCancel: cancelDeleteRule,
          onConfirm: confirmDeleteRule,
        }),
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
      opaqueHint: { fontSize: 11, color: C.yellowText, marginTop: 8, lineHeight: 1.5 },
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
      rulesList: { display: 'grid', gap: 6 },
      ruleRow: { border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 9px', background: C.panel2, display: 'flex', gap: 8, alignItems: 'flex-start' },
      ruleRowCompact: { padding: '5px 8px', gap: 7 },
      ruleRowHighlight: { borderColor: C.accent, boxShadow: '0 0 0 2px rgba(61, 111, 202, 0.22)' },
      newTag: { color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 999, padding: '0 6px', fontSize: 10, fontWeight: 700 },
      ruleIndex: { width: 22, height: 22, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', color: C.muted, fontSize: 10, fontWeight: 700, flexShrink: 0 },
      ruleBody: { flex: 1, minWidth: 0 },
      ruleHeader: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 },
      ruleId: { fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 11.5, color: '#344660' },
      ruleDetails: { display: 'flex', flexWrap: 'wrap', gap: 10, color: C.muted, fontSize: 11.5 },
      ruleDeleteButton: { marginLeft: 'auto', border: 0, background: 'transparent', color: C.red, fontSize: 11, cursor: 'pointer', padding: '0 2px' },
      allowTag: { color: C.green, fontSize: 11.5, fontWeight: 600 },
      denyTag: { color: C.red, fontSize: 11.5, fontWeight: 600 },
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
      segmentSummary: { marginTop: 10, padding: '9px 10px', background: C.panel2, border: `1px dashed ${C.line}`, borderRadius: 8 },
      segmentSummaryNote: { fontSize: 11, color: C.muted, marginTop: 4 },
      segmentList: { display: 'grid', gap: 6 },
      segmentListCompact: { display: 'grid', gap: 5 },
      segmentRow: { padding: '6px 8px', background: '#ffffff', border: `1px solid ${C.line}`, borderRadius: 6 },
      segmentHead: { display: 'flex', alignItems: 'flex-start', gap: 8 },
      segmentText: { flex: 1, minWidth: 0, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 11.5, color: C.text, wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
      segmentReason: { fontSize: 11, color: C.muted, marginTop: 4 },
      segmentTagAllow: { flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.green, background: C.greenBg, borderRadius: 999, padding: '1px 7px' },
      segmentTagPending: { flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.yellowText, background: C.yellowBg, borderRadius: 999, padding: '1px 7px' },
      segmentTagDeny: { flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.red, background: C.redBg, borderRadius: 999, padding: '1px 7px' },
      errorBox: { padding: 24, margin: 24, border: `1px solid ${C.red}`, borderRadius: 10, background: C.redBg },
      errorPre: { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontSize: 12, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)' },
      overlay: { position: 'fixed', inset: 0, background: 'rgba(23, 32, 51, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 },
      dialog: { width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 24px 70px rgba(23, 32, 51, 0.28)', overflow: 'hidden' },
      dialogHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 20px', borderBottom: `1px solid ${C.line}` },
      dialogTitle: { fontSize: 16, fontWeight: 700, color: C.text },
      dialogSub: { fontSize: 12, color: C.muted, marginTop: 4 },
      dialogClose: { border: 0, background: 'transparent', color: C.muted, fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '0 4px' },
      dialogBody: { padding: 16, overflowY: 'auto', minHeight: 0 },
      dialogError: { marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #ecc0c5', background: C.redBg, color: C.red, fontSize: 12 },
      dialogEmpty: { marginBottom: 12, color: C.muted, fontSize: 12 },
      targetRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 12, border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel2 },
      targetHint: { fontSize: 11, color: C.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      editorCard: { border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel2, padding: '12px 14px', marginBottom: 10 },
      editorTop: { display: 'flex', alignItems: 'center', gap: 8 },
      editorIndex: { width: 24, height: 24, borderRadius: 6, background: '#ffffff', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
      select: { border: `1px solid ${C.line}`, borderRadius: 7, background: '#ffffff', color: C.text, fontSize: 12, padding: '6px 8px', fontFamily: 'inherit' },
      programInput: { flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 7, background: '#ffffff', color: C.text, fontSize: 13, padding: '6px 9px', fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)' },
      textButton: { border: 0, background: 'transparent', color: C.red, fontSize: 12, cursor: 'pointer', padding: '4px 6px' },
      argsRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 },
      editorLabel: { fontSize: 11, color: C.muted, fontWeight: 600 },
      anyArgsLabel: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.text, cursor: 'pointer' },
      anyArgsCheckbox: { margin: 0 },
      editorEmptyArg: { fontSize: 12, color: C.muted },
      argChip: { display: 'inline-flex', alignItems: 'center', border: `1px solid ${C.line}`, borderRadius: 7, background: '#ffffff', overflow: 'hidden' },
      argInput: { border: 0, outline: 'none', background: 'transparent', color: C.text, fontSize: 12, padding: '6px 8px', width: 110, fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)' },
      argRemove: { border: 0, borderLeft: `1px solid ${C.line}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 14, padding: '2px 7px' },
      addArg: { border: `1px dashed ${C.line}`, borderRadius: 7, background: '#ffffff', color: C.accent, fontSize: 12, cursor: 'pointer', padding: '5px 9px' },
      addRuleButton: { width: '100%', border: `1px dashed ${C.line}`, borderRadius: 8, background: '#ffffff', color: C.accent, fontSize: 12, cursor: 'pointer', padding: '8px 10px', marginTop: 2 },
      editorScope: { marginTop: 9, fontSize: 11, color: C.muted },
      dialogFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderTop: `1px solid ${C.line}`, background: C.panel },
      dialogNote: { fontSize: 12, color: C.muted },
      dialogSmall: { width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 24px 70px rgba(23, 32, 51, 0.28)', overflow: 'hidden' },
      deletePreview: { border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel2, padding: '12px 14px', marginBottom: 10 },
      deleteProgram: { fontFamily: 'var(--dsw-alias-mono-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 14, fontWeight: 700, color: C.text },
      deleteArgs: { fontSize: 12, color: C.muted, marginTop: 6, wordBreak: 'break-word' },
      deleteNote: { fontSize: 12, color: C.yellowText, lineHeight: 1.5 },
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
      const px = size ?? 18;
      return h('span', { style: styles.iconWrap, 'aria-label': label },
        h('svg', {
          width: px, height: px, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': true, style: { display: 'block', flexShrink: 0 },
        },
          h('path', { d: 'M12 3 5 6v5.5c0 4.4 2.8 7.6 7 9.5 4.2-1.9 7-5.1 7-9.5V6l-7-3Z' }),
          h('path', { d: 'M9.2 12.1l1.9 1.9 3.7-3.9' }),
        ),
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
