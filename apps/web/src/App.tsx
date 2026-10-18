import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import LandingPage from './LandingPage';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BookOpen, Bot, Check, ChevronDown, CircleHelp, Clock3, Database, FilePlus2, GitBranch, LayoutDashboard, LoaderCircle, LockKeyhole, Network, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';

type Health = { status: string; integrations: { falkordb: { available: boolean }; model: { configured: boolean; model?: string } }; capabilities: Record<string, boolean> };
type AuthSession = { user: { id: string; email: string }; access_token: string };
type Workspace = { id: string; name: string; owner_id: string; revision: number; access_token: string };
type Overview = { workspace: { id: string; name: string; revision: number }; counts: Record<string, number>; attention: { id: string; type: string; title: string; status: string }[] };
type GraphNode = { id: string; type: string; label: string; status: string; properties: Record<string, unknown> };
type GraphEdge = { source: string; target: string; type: string; properties?: Record<string, unknown> };
type GraphPayload = { nodes: GraphNode[]; edges: GraphEdge[] };
type Claim = { id: string; statement: string; status: string; confidence: number; confidence_kind?: string; evidence_quote: string; evidence_type?: string; evidence_label?: string };
type AgentResult = { status: string; decision: { title?: string; rationale?: string; uncertainty?: string; action_title?: string }; tool_calls: { tool: string; result_count: number }[]; claim_ids: string[]; evidence?: { claim_id: string; statement: string; quote: string; source: string; claim_status: string; confidence?: number; confidence_kind?: string }[]; analyst_run_id: string; coordinator_run_id: string; handoff_id?: string };
const API = import.meta.env.VITE_API_BASE_URL ?? '';

async function api<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers } });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.detail?.message ?? body?.detail ?? `Request failed (${response.status})`); }
  return response.json();
}

const initialNav = [
  { section: 'YOUR WORK', items: [
    { name: 'Overview', description: 'Counts and graph', icon: LayoutDashboard },
    { name: 'Sources', description: 'Add documents', icon: BookOpen },
    { name: 'Memory', description: 'Claims and evidence', icon: Database },
    { name: 'Agent workspace', description: 'Ask agents', icon: Bot },
    { name: 'Decisions & actions', description: 'Review proposed work', icon: Check },
    { name: 'Investigations', description: 'Trace impact and repair', icon: GitBranch },
    { name: 'Activity', description: 'Workspace history', icon: Activity },
  ] },
  { section: 'PREFERENCES', items: [{ name: 'Settings', description: 'Connections and account', icon: Settings2 }] },
];

const graphTypeLabels: Record<string, string> = {
  Workspace: 'Workspace', AuditEvent: 'History event', Source: 'Source', SourceVersion: 'Source version', SourceFragment: 'Source text', Claim: 'Memory claim',
  Agent: 'Agent role', AgentRun: 'Agent run', Handoff: 'Agent handoff', Decision: 'Decision', Action: 'Proposed action', Correction: 'Correction', Investigation: 'Investigation', RepairPlan: 'Repair plan',
};

const graphColumns: Record<string, number> = {
  Source: 0, SourceVersion: 0, SourceFragment: 0, Claim: 1, Decision: 2, Correction: 2, Investigation: 2, RepairPlan: 2,
  Agent: 3, AgentRun: 3, Handoff: 3, Action: 4, Workspace: 5, AuditEvent: 5,
};

function graphNodeDetails(node: GraphNode): Record<string, unknown> {
  const { content, text, ...metadata } = node.properties;
  if (node.type === 'SourceVersion' && typeof content === 'string') return { ...metadata, character_count: content.length };
  if (node.type === 'SourceFragment' && typeof text === 'string') return { ...metadata, excerpt: text.slice(0, 500), truncated: text.length > 500 };
  return metadata;
}

function graphNodeDescription(node: GraphNode): string {
  const props = node.properties;
  if (node.type === 'AuditEvent') return String(props.type ?? node.status);
  if (node.type === 'SourceVersion') return `${String(props.status ?? 'version')} · ${String(props.content ?? '').length.toLocaleString()} characters`;
  if (node.type === 'SourceFragment') return String(props.text ?? node.label).slice(0, 180);
  if (node.type === 'AgentRun') return String(props.task ?? props.status ?? node.label);
  if (node.type === 'Handoff') return `Agent handoff · ${String(props.status ?? node.status)}`;
  if (node.type === 'Correction') return String(props.corrected_statement ?? props.status ?? node.label);
  if (node.type === 'Workspace') return 'Private graph boundary for this workspace';
  return String(props.statement ?? props.title ?? props.name ?? node.label ?? node.status);
}

const pageDescriptions: Record<string, string> = {
  Overview: 'A live summary of this workspace’s sources, claims, decisions, actions, and graph.',
  Sources: 'Add text or supported files. Afterhack extracts claims and keeps their exact source evidence.',
  Memory: 'Check each model-extracted claim against its source quote. To correct one, open the claim here; Afterhack records your correction and keeps the old version for history.',
  'Agent workspace': 'Ask about information already added in Sources. The Analyst searches saved claims and quotes; the Coordinator records a supported draft or explains when evidence is missing.',
  'Decisions & actions': 'Inspect decisions produced by agent runs and proposed tasks. Task execution and approval controls are not implemented yet.',
  Investigations: 'Explore the stored graph. For a specific correction, open a claim in Memory to preview its known dependent decisions.',
  Activity: 'See persisted events recorded as sources, agents, and corrections change this workspace.',
  Settings: 'Check FalkorDB and model-provider status, and review workspace isolation details.',
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [auth, setAuth] = useState<AuthSession | null>(() => { try { return JSON.parse(localStorage.getItem('afterhack_auth') || 'null'); } catch { return null; } });
    const [savedWorkspace] = useState<Workspace | null>(() => { try { return JSON.parse(localStorage.getItem('afterhack_workspace') || 'null'); } catch { return null; } });
  const [authMode, setAuthMode] = useState<'signup' | 'login' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState<GraphNode | null>(null);
  const [selectedGraphEdge, setSelectedGraphEdge] = useState<GraphEdge | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [page, setPage] = useState('Overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('Afterhack workspace');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Claim | null>(null);
  const [correction, setCorrection] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sourceRefreshKey, setSourceRefreshKey] = useState(0);
  const [banner, setBanner] = useState('');
  const [agentTask, setAgentTask] = useState('');
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);

  const enterSavedWorkspace = async () => {
    if (!savedWorkspace || !auth || savedWorkspace.owner_id !== auth.user.id) return;
    setLoading(true); setError('');
    try {
      const refreshed = await api<Workspace>(`/api/v1/workspaces/${savedWorkspace.id}/session`, auth.access_token, { method: 'POST' });
      localStorage.setItem('afterhack_workspace', JSON.stringify(refreshed));
      setWorkspace(refreshed);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open workspace'); }
    finally { setLoading(false); }
  };
  const createWorkspaceFromLanding = () => { if (auth) setShowCreate(true); else setAuthMode('signup'); };
  const authenticate = async () => {
    setLoading(true); setError('');
    try {
      const result = await api<AuthSession>(`/api/v1/auth/${authMode}`, undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
      let preferredWorkspace: Workspace | undefined;
      if (authMode === 'login' && savedWorkspace?.owner_id === result.user.id) {
        try {
          preferredWorkspace = await api<Workspace>(`/api/v1/workspaces/${savedWorkspace.id}/session`, result.access_token, { method: 'POST' });
        } catch {
          preferredWorkspace = undefined;
        }
      }
      const ownedWorkspaces = authMode === 'login' ? await api<Workspace[]>('/api/v1/workspaces', result.access_token) : [];
      const existingWorkspace = preferredWorkspace ?? ownedWorkspaces[0];
      localStorage.setItem('afterhack_auth', JSON.stringify(result));
      setAuth(result);
      setAuthMode(null);
      setPassword('');
      if (existingWorkspace) {
        localStorage.setItem('afterhack_workspace', JSON.stringify(existingWorkspace));
        setWorkspace(existingWorkspace);
      } else {
        localStorage.removeItem('afterhack_workspace');
        setShowCreate(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Authentication failed'); }
    finally { setLoading(false); }
  };
  const logout = () => {
    localStorage.removeItem('afterhack_auth');
    if (workspace) {
      const { access_token: _discarded, ...workspaceReference } = workspace;
      localStorage.setItem('afterhack_workspace', JSON.stringify(workspaceReference));
    }
    setAuth(null); setWorkspace(null); setOverview(null); setGraph(null); setClaims([]); setAgentResult(null);
    setBanner('You have logged out. Your workspace reference stays on this device; access is revalidated after login.');
  };

  const loadWorkspace = useCallback(async (ws: Workspace) => {
    setLoading(true); setError('');
    try {
      const [o, g, c] = await Promise.all([
        api<Overview>(`/api/v1/workspaces/${ws.id}/overview`, ws.access_token),
        api<GraphPayload>(`/api/v1/workspaces/${ws.id}/graph`, ws.access_token),
        api<Claim[]>(`/api/v1/workspaces/${ws.id}/claims`, ws.access_token),
      ]);
      setOverview(o); setGraph(g); setClaims(c);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load workspace'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { api<Health>('/api/v1/health').then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => { if (workspace) loadWorkspace(workspace); }, [workspace, loadWorkspace]);
  useEffect(() => { if (!workspace) return; const timer = window.setInterval(() => { api<Overview>(`/api/v1/workspaces/${workspace.id}/overview`, workspace.access_token).then(setOverview).catch(() => undefined); }, 7000); return () => clearInterval(timer); }, [workspace]);

  const createWorkspace = async () => {
    setLoading(true); setError('');
    try {
      if (!auth) { setShowCreate(false); setAuthMode('signup'); return; }
      const ws = await api<Workspace>('/api/v1/workspaces', auth.access_token, { method: 'POST', body: JSON.stringify({ name: workspaceName }) });
      localStorage.setItem('afterhack_workspace', JSON.stringify(ws)); setWorkspace(ws); setShowCreate(false); setBanner('Private workspace created for your account. Knowledge is isolated in its own FalkorDB graph.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Workspace creation failed'); }
    finally { setLoading(false); }
  };

  const refreshClaims = async () => { if (!workspace) return; const [c, g, o] = await Promise.all([api<Claim[]>(`/api/v1/workspaces/${workspace.id}/claims`, workspace.access_token), api<GraphPayload>(`/api/v1/workspaces/${workspace.id}/graph`, workspace.access_token), api<Overview>(`/api/v1/workspaces/${workspace.id}/overview`, workspace.access_token)]); setClaims(c); setGraph(g); setOverview(o); };
  const ingest = async () => {
    if (!workspace || !sourceName || !sourceText) return;
    setLoading(true); setError('');
    try { const out = await api<{ created_count: number }>('/api/v1/sources', workspace.access_token, { method: 'POST', body: JSON.stringify({ workspace_id: workspace.id, name: sourceName, content: sourceText }) }); setBanner(`Source saved. Afterhack extracted ${out.created_count} claim(s). Review the quotes in Memory before relying on them.`); setSourceText(''); setSourceName(''); setSourceRefreshKey(key => key + 1); await refreshClaims(); setPage('Memory'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ingestion failed'); } finally { setLoading(false); }
  };
  const fileUpload = async (file?: File) => {
    if (!workspace || !file) return;
    const data = new FormData(); data.append('file', file);
    try { const response = await fetch(`${API}/api/v1/sources/upload?workspace_id=${workspace.id}`, { method: 'POST', headers: { Authorization: `Bearer ${workspace.access_token}` }, body: data }); if (!response.ok) throw new Error((await response.json()).detail?.message || 'Upload failed'); const result = await response.json(); setBanner(`Source saved. Afterhack extracted ${result.created_count ?? 0} claim(s). Review the quotes in Memory before relying on them.`); setSourceRefreshKey(key => key + 1); await refreshClaims(); setPage('Memory'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
  };
  const previewCorrection = async () => {
    if (!workspace || !selected || !correction) return;
    try { setPreview(await api('/api/v1/corrections/preview', workspace.access_token, { method: 'POST', body: JSON.stringify({ workspace_id: workspace.id, claim_id: selected.id, corrected_statement: correction }) })); } catch (e) { setError(e instanceof Error ? e.message : 'Preview failed'); }
  };
  const runAgent = async () => {
    if (!workspace || !agentTask.trim()) return;
    setLoading(true); setError(''); setBanner(''); setAgentResult(null);
    try {
      const response = await api<AgentResult>(`/api/v1/workspaces/${workspace.id}/agents/tasks`, workspace.access_token, { method: 'POST', body: JSON.stringify({ task: agentTask.trim() }) });
      const result = { ...response, evidence: response.evidence ?? [], decision: { ...response.decision, title: response.decision?.title || (response.status === 'needs_review' ? 'No source-backed answer yet' : 'Completed evidence review'), rationale: response.decision?.rationale || (response.status === 'needs_review' ? 'No claim with retrievable source evidence matched this task. Add or check a source, then run the task again.' : 'The agent completed the task without returning a detailed rationale.'), uncertainty: response.decision?.uncertainty || (response.status === 'needs_review' ? 'The answer is unknown from the current workspace evidence.' : '') }, tool_calls: response.tool_calls ?? [], claim_ids: response.claim_ids ?? [] };
      setAgentResult(result);
      setBanner(result.status === 'needs_review' ? 'Run completed, but no source-backed answer was found. Review the uncertainty and add relevant evidence if needed.' : 'Run completed. The Analyst and Coordinator produced an evidence-backed draft.');
      await refreshClaims();
    } catch (e) { setError(e instanceof Error ? e.message : 'Agent run failed'); }
    finally { setLoading(false); }
  };
  const applyCorrection = async () => {
    if (!workspace || !selected || !preview) return;
    const claimPreview = preview.claim as { revision?: number } | undefined;
    const workspaceRevision = Number(preview.workspace_revision);
    if (!claimPreview?.revision || !Number.isInteger(workspaceRevision)) { setError('Correction preview is missing its revision. Refresh the preview before applying.'); return; }
    try {
      const result = await api<{ status: string }>('/api/v1/corrections/apply', workspace.access_token, { method: 'POST', body: JSON.stringify({ workspace_id: workspace.id, claim_id: selected.id, corrected_statement: correction, expected_workspace_revision: workspaceRevision, expected_claim_revision: claimPreview.revision }) });
      setBanner(result.status === 'already_applied' ? 'This correction was already applied.' : 'Correction recorded; affected work has been marked for review.'); setPreview(null); setSelected(null); setCorrection(''); await refreshClaims();
    } catch (e) { setError(e instanceof Error ? e.message : 'Correction failed'); }
  };

  const nodes = useMemo<Node[]>(() => {
    const columnRows = new Map<number, number>();
    return (graph?.nodes ?? []).map(n => {
      const column = graphColumns[n.type] ?? 5;
      const row = columnRows.get(column) ?? 0;
      columnRows.set(column, row + 1);
      return { id: n.id, position: { x: 80 + column * 280, y: 55 + row * 145 }, data: { label: <div className={`graph-node graph-node-${n.type.toLowerCase()}`}><span className={`node-dot ${n.type.toLowerCase()}`} /> <strong>{graphTypeLabels[n.type] ?? n.type}</strong><span>{n.label || n.id}</span><small>{n.status}</small></div> }, className: `node-${n.status}` };
    });
  }, [graph]);
  const edges = useMemo<Edge[]>(() => (graph?.edges ?? []).filter(e => nodes.some(n => n.id === e.source) && nodes.some(n => n.id === e.target)).map((e, i) => ({ id: `${e.source}-${e.target}-${i}`, source: e.source, target: e.target, label: e.type.replace(/_/g, ' ').toLowerCase(), animated: false, style: { stroke: '#84938b', strokeWidth: 1.5 }, labelStyle: { fill: '#d0d8d2', fontSize: 11 }, labelBgStyle: { fill: '#0d1215', fillOpacity: 0.92 } })), [graph, nodes]);
  const filteredClaims = claims.filter(c => c.statement?.toLowerCase().includes(search.toLowerCase()));

  return <div className={`app-shell ${workspace ? 'workspace-shell' : 'landing-shell'}`}>
    {workspace && <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><GitBranch size={19} strokeWidth={2.4}/></div><span>AFTERHACK</span><span className="brand-beta">BETA</span></div>
      <button className="workspace-picker" onClick={() => setShowCreate(true)} type="button"><div className="workspace-avatar">{workspace?.name?.slice(0,1).toUpperCase() || 'R'}</div><div className="workspace-info"><strong>{workspace?.name || 'Select workspace'}</strong><span>{workspace ? 'Private workspace' : 'Create your first'}</span></div><ChevronDown size={15}/></button>
      <nav aria-label="Workspace navigation">{initialNav.map(group => <div className="nav-group" key={group.section}><div className="nav-label">{group.section}</div>{group.items.map(item => <button aria-current={page === item.name ? 'page' : undefined} title={item.description} className={`nav-item ${page === item.name ? 'active' : ''}`} key={item.name} onClick={() => setPage(item.name)}><item.icon size={17}/><span className="nav-copy"><strong>{item.name}</strong><small>{item.description}</small></span>{item.name === 'Investigations' && overview?.counts.investigations ? <em>{overview.counts.investigations}</em> : null}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="secure-note"><LockKeyhole size={15}/><span>Workspace-isolated<br/>knowledge graph</span></div><button className="user-row user-button" onClick={logout} title="Log out"><div className="user-avatar">{auth?.user.email.slice(0,1).toUpperCase() || 'U'}</div><div><strong>{auth?.user.email || 'Account'}</strong><span>Signed in · Log out</span></div><ChevronDown size={15}/></button></div>
    </aside>}

    <main className="main">
      {workspace && <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {page}</div><div className="topbar-right"><div className={`system-status ${health?.integrations.falkordb.available ? 'connected' : 'disconnected'}`}><span className="status-light"/>{health?.integrations.falkordb.available ? 'FalkorDB connected' : 'Database unavailable'}</div><button className="icon-button" title="Help"><CircleHelp size={18}/></button><div className="top-avatar"><LockKeyhole size={13}/></div></div></header>}
      <div className="page-content">
        {error && <div className="alert alert-error"><AlertTriangle size={16}/><span>{error}{page === 'Agent workspace' && error.toLowerCase().includes('agent') ? ' Check Settings for model connectivity, then retry. If the model cannot return supported evidence, the run will be marked needs review.' : ''}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
        {banner && <div className="alert alert-success"><Check size={16}/><span>{banner}</span><button onClick={() => setBanner('')}><X size={15}/></button></div>}
        {!workspace ? <LandingPage accountServiceAvailable={health?.integrations.falkordb.available ?? false} authenticatedEmail={auth?.user.email ?? null} savedWorkspaceName={auth && savedWorkspace?.owner_id === auth.user.id ? savedWorkspace.name : null} onContinueWorkspace={enterSavedWorkspace} onAuthenticate={setAuthMode} onCreateWorkspace={createWorkspaceFromLanding} onLogout={logout} /> : <>
          <div className="page-heading"><div><div className="eyebrow">{page === 'Overview' ? 'YOUR KNOWLEDGE, ACCOUNTED FOR' : `WORKSPACE / ${page.toUpperCase()}`}</div><h1>{page === 'Overview' ? <>Good morning. <em>Here’s the state of memory.</em></> : page}</h1><p>{pageDescriptions[page]}</p></div><button className="secondary-button" onClick={() => loadWorkspace(workspace)}><Activity size={15}/> Refresh</button></div>
          {loading && <div className="loading-line"><LoaderCircle size={14} className="spin"/> Syncing with FalkorDB…</div>}
          {page === 'Overview' && <>
            <div className="metrics-grid">{[{label:'Sources',key:'sources',icon:BookOpen, tone:'green'}, {label:'Memory claims',key:'claims',icon:Database,tone:'violet'}, {label:'Decisions',key:'decisions',icon:GitBranch,tone:'blue'}, {label:'Actions',key:'actions',icon:ArrowDownRight,tone:'orange'}].map(m => <div className="metric-card" key={m.key}><div className={`metric-icon ${m.tone}`}><m.icon size={17}/></div><div className="metric-label">{m.label}</div><div className="metric-value">{overview?.counts[m.key] ?? '—'}</div><div className="metric-foot"><span className="neutral-change">Live graph count</span></div></div>)}</div>
            <div className="section-row"><div><h2>Workspace graph</h2><p>Each card is a record stored in FalkorDB. Arrows name the relationship between records.</p></div><button className="text-button" onClick={() => setPage('Investigations')}>Open graph explorer <ArrowUpRight size={14}/></button></div>
            <div className="graph-legend graph-legend-expanded"><span><i className="legend-source"/>Sources & evidence</span><span><i className="legend-claim"/>Memory claims</span><span><i className="legend-work"/>Decisions & actions</span><span><i className="legend-agent"/>Agent activity</span><span><i className="legend-history"/>Corrections & history</span></div>
            <div className="graph-panel">{graph && graph.nodes.length ? <><ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.25} maxZoom={1.8} attributionPosition="bottom-left" onNodeClick={(_, node) => { const record = graph.nodes.find(item => item.id === node.id); if (record) { setSelectedGraphNode(record); setSelectedGraphEdge(null); } }} onEdgeClick={(_, edge) => { const record = graph.edges.find((item, index) => `${item.source}-${item.target}-${index}` === edge.id); if (record) { setSelectedGraphEdge(record); setSelectedGraphNode(null); } }}><Background color="#65716b" gap={24}/><Controls/><MiniMap nodeColor={(n) => n.className?.includes('superseded') ? '#d28b78' : '#9eb7a6'} maskColor="rgba(9,12,13,0.72)"/></ReactFlow><div className="graph-help">Select a node or relationship to inspect its stored details.</div></> : <div className="graph-empty"><div className="empty-orbit"><Network size={24}/></div><strong>Your graph contains the workspace and its creation event.</strong><span>It has no source evidence yet. Add a document in Sources to create source, fragment, and claim nodes.</span><button className="text-button" onClick={() => setPage('Sources')}>Add a source <ArrowUpRight size={14}/></button></div>}<div className="canvas-label">FALKORDB GRAPH · {graph?.nodes.length ?? 0} RECORDS · {graph?.edges.length ?? 0} RELATIONSHIPS</div></div>
            {(selectedGraphNode || selectedGraphEdge) && <div className="graph-selection panel-card"><div><span className="eyebrow">{selectedGraphNode ? graphTypeLabels[selectedGraphNode.type] ?? selectedGraphNode.type : 'GRAPH RELATIONSHIP'}</span><h3>{selectedGraphNode ? selectedGraphNode.label : selectedGraphEdge?.type.replace(/_/g, ' ')}</h3><p>{selectedGraphNode ? graphNodeDescription(selectedGraphNode) : `From ${graph?.nodes.find(item => item.id === selectedGraphEdge?.source)?.label ?? selectedGraphEdge?.source} to ${graph?.nodes.find(item => item.id === selectedGraphEdge?.target)?.label ?? selectedGraphEdge?.target}`}</p>{selectedGraphNode && <pre className="graph-properties">{JSON.stringify(graphNodeDetails(selectedGraphNode), null, 2)}</pre>}{selectedGraphEdge?.properties && <pre className="graph-properties">{JSON.stringify(selectedGraphEdge.properties, null, 2)}</pre>}</div><button className="secondary-button" onClick={() => { setSelectedGraphNode(null); setSelectedGraphEdge(null); }}>Close details</button></div>}
            <div className="below-grid"><div className="panel-card"><div className="panel-heading"><div><h2>Memory to review</h2><p>Claims that need human attention.</p></div><button className="subtle-button" onClick={() => setPage('Memory')}>View all <ArrowUpRight size={14}/></button></div>{overview?.attention.length ? overview.attention.slice(0,4).map((item,i)=><div className="review-row" key={`${item.id}-${i}`}><div className="review-icon"><AlertTriangle size={15}/></div><div className="review-copy"><strong>{item.title || item.type}</strong><span>{item.type} · {item.status}</span></div><ArrowUpRight size={15} className="muted-icon"/></div>) : <div className="empty-inline"><ShieldCheck size={17}/><span>No items require review yet. New claims remain proposed until reviewed.</span></div>}</div><div className="panel-card activity-card"><div className="panel-heading"><div><h2>Recent activity</h2><p>Persisted workspace events.</p></div><Clock3 size={16} className="muted-icon"/></div><EventList workspace={workspace} onError={setError}/></div></div>
          </>}
          {page === 'Sources' && <div className="two-col"><section className="panel-card source-form"><div className="panel-heading"><div><h2>Add the original information</h2><p>A source is the original document, note, or policy—not the correction. Afterhack extracts proposed claims and shows the exact supporting quotes in Memory.</p></div><FilePlus2 size={19} className="muted-icon"/></div><label>Document or note name<input value={sourceName} onChange={e=>setSourceName(e.target.value)} placeholder="Name this document or note…"/></label><label>Source content<textarea rows={10} value={sourceText} onChange={e=>setSourceText(e.target.value)} placeholder="Paste the original text that agents should use as evidence. Example: ‘The service window is scheduled for December 4…’"/></label><div className="form-actions"><label className="upload-button"><Upload size={15}/> Upload text<input type="file" accept=".txt,.md,.csv,.json" onChange={e=>fileUpload(e.target.files?.[0])}/></label><button className="primary-button" disabled={!sourceName || sourceText.length < 40 || loading} onClick={ingest}>{loading ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} Extract & store</button></div><div className="form-note"><LockKeyhole size={13}/> Your original text is sent to the configured model for extraction, then stored with its source quotes in FalkorDB. To change a claim, open it in Memory and enter the corrected information there.</div></section><section className="panel-card"><div className="panel-heading"><div><h2>Ingested sources</h2><p>Source versions and extracted claims.</p></div><BookOpen size={18} className="muted-icon"/></div><SourceList key={sourceRefreshKey} workspace={workspace} onError={setError}/></section></div>}
          {page === 'Agent workspace' && <div className="agent-layout"><div className="panel-card agent-console"><div className="panel-heading"><div><h2>Start a graph-grounded task</h2><p>Analyst retrieves persisted claims and source spans; Coordinator receives an explicit handoff.</p></div><Bot size={19} className="muted-icon"/></div><label>Task<input value={agentTask} onChange={e=>setAgentTask(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runAgent()} placeholder="Ask a question or request evidence-backed work…"/></label><button className="primary-button" disabled={!agentTask.trim()||loading||!health?.integrations.model.configured} onClick={runAgent}>{loading?<LoaderCircle size={15} className="spin"/>:<Play size={14}/>} {loading?'Running evidence review…':'Run Analyst → Coordinator'}</button>{!health?.integrations.model.configured&&<div className="form-note"><AlertTriangle size={13}/> Agent runs require a configured live model provider.</div>}</div><div className="panel-card"><div className="panel-heading"><div><h2>Run result</h2><p>Persisted run records and tool outputs.</p></div></div>{agentResult?<><div className="run-summary"><span className={`status-pill ${agentResult.status}`}>{agentResult.status.replace('_',' ')}</span><strong>{agentResult.decision.title || 'Completed evidence review'}</strong><p>{agentResult.decision.rationale || 'The run completed without a rationale from the model.'}</p>{agentResult.decision.uncertainty&&<span className="uncertainty-text">Uncertainty: {agentResult.decision.uncertainty}</span>}{agentResult.claim_ids.length>0&&<span className="run-evidence-count">Grounded in {agentResult.claim_ids.length} retrieved claim(s).</span>}{agentResult.status==='needs_review'&&<button className="secondary-button" onClick={()=>setPage('Sources')}><BookOpen size={14}/> Add or review sources</button>}</div>{agentResult.evidence && agentResult.evidence.length>0 && <div className="run-evidence"><strong>EXACT EVIDENCE USED</strong>{agentResult.evidence.map(item=><blockquote key={item.claim_id}><span>“{item.quote}”</span><small>{item.source} · {item.claim_status.replace('_',' ')} claim</small></blockquote>)}</div>}<div className="tool-activity"><strong className="run-section-label">WORK PERFORMED</strong>{agentResult.tool_calls.length ? agentResult.tool_calls.map((call,i)=><div className="tool-row" key={`${call.tool}-${i}`}><span className="tool-index">{String(i+1).padStart(2,'0')}</span><strong>{call.tool.replace(/_/g,' ')}</strong><span>{call.result_count} records</span><Check size={14}/></div>) : <div className="empty-inline"><CircleHelp size={15}/><span>No stored claims matched this request, so no retrieval tool could run.</span></div>}</div><div className="run-ids"><span>HANDOFF {agentResult.handoff_id || 'recorded'}</span><span>ANALYST {agentResult.analyst_run_id}</span><span>COORDINATOR {agentResult.coordinator_run_id}</span></div></>:<div className="empty-state compact"><Bot size={21}/><strong>Ready to review a task</strong><span>First add source material in Sources, then ask a focused question about that stored evidence.</span><button className="text-button" onClick={()=>setPage('Sources')}>Add a source <ArrowUpRight size={14}/></button></div>}</div></div>}
          {page === 'Decisions & actions' && <DecisionActionPanel workspace={workspace} onError={setError}/>}
          {page === 'Memory' && <div className="panel-card memory-panel"><div className="panel-heading"><div><h2>Persisted claims</h2><p>These are candidate memories extracted from your original sources. Open a claim to inspect its exact quote, then enter a correction if you know it is wrong. A correction is reviewer input, not independent source verification.</p></div><div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search claims"/></div></div>{filteredClaims.length ? filteredClaims.map(claim=><button className="claim-row" key={claim.id} onClick={()=>{setSelected(claim);setCorrection('');setPreview(null);}}><div className="claim-status"><span className={`status-pill ${claim.status}`}>{claim.status.replace('_',' ')}</span><span className="confidence">{claim.confidence_kind === 'human_correction' ? 'Reviewer correction · not independently verified' : `${Math.round((claim.confidence||0)*100)}% extraction confidence`}</span></div><strong>{claim.statement}</strong><blockquote>“{claim.evidence_quote}”</blockquote><span className="claim-id">{claim.id}</span></button>) : <div className="empty-state"><Database size={22}/><strong>{search ? 'No matching claims' : 'No stored claims yet'}</strong><span>Ingest a source with a configured model to extract claims with exact provenance.</span></div>}</div>}
          {page === 'Investigations' && <div className="investigation-layout"><div className="panel-card graph-investigation"><div className="panel-heading"><div><h2>Dependency canvas</h2><p>Each labeled card is a FalkorDB record; arrows show stored relationships such as SUPPORTED_BY, USED_CLAIM, or REQUIRES.</p></div><span className="live-tag"><span/> LIVE GRAPH</span></div><div className="graph-panel large">{graph?.nodes.length ? <><ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={1.8} onNodeClick={(_, node) => { const record = graph.nodes.find(item => item.id === node.id); if (record) { setSelectedGraphNode(record); setSelectedGraphEdge(null); } }} onEdgeClick={(_, edge) => { const record = graph.edges.find((item, index) => `${item.source}-${item.target}-${index}` === edge.id); if (record) { setSelectedGraphEdge(record); setSelectedGraphNode(null); } }}><Background color="#65716b" gap={24}/><Controls/><MiniMap nodeColor="#98ad9b"/></ReactFlow><div className="graph-help">Select a node or relationship to inspect details.</div></> : <div className="graph-empty"><div className="empty-orbit"><Network size={24}/></div><strong>The workspace currently has no dependency path.</strong><span>Add source evidence and run an agent to create linked knowledge and decision records.</span><button className="text-button" onClick={() => setPage('Sources')}>Add a source <ArrowUpRight size={14}/></button></div>}</div>
                      {(selectedGraphNode || selectedGraphEdge) && <div className="graph-selection panel-card"><div><span className="eyebrow">{selectedGraphNode ? graphTypeLabels[selectedGraphNode.type] ?? selectedGraphNode.type : 'GRAPH RELATIONSHIP'}</span><h3>{selectedGraphNode ? selectedGraphNode.label : selectedGraphEdge?.type.replace(/_/g, ' ')}</h3><p>{selectedGraphNode ? graphNodeDescription(selectedGraphNode) : `From ${graph?.nodes.find(item => item.id === selectedGraphEdge?.source)?.label ?? selectedGraphEdge?.source} to ${graph?.nodes.find(item => item.id === selectedGraphEdge?.target)?.label ?? selectedGraphEdge?.target}`}</p>{selectedGraphNode && <pre className="graph-properties">{JSON.stringify(graphNodeDetails(selectedGraphNode), null, 2)}</pre>}{selectedGraphEdge?.properties && <pre className="graph-properties">{JSON.stringify(selectedGraphEdge.properties, null, 2)}</pre>}</div><button className="secondary-button" onClick={() => { setSelectedGraphNode(null); setSelectedGraphEdge(null); }}>Close details</button></div>}</div><div className="panel-card impact-card"><h2>Impact review</h2><p>Choose a claim in Memory to preview currently recorded dependencies. This is a bounded graph view, not a full repair plan.</p>{claims.slice(0,6).map(c=><button key={c.id} className="impact-claim" onClick={()=>{setSelected(c);setCorrection('');setPreview(null);}}><span className={`node-dot claim`}/><span>{c.statement}</span><ArrowUpRight size={14}/></button>)}<div className="uncertainty-note"><CircleHelp size={15}/><span>Reachability is not invalidity. Independent evidence and support requirements must be checked before repair.</span></div></div></div>}
          {page === 'Activity' && <div className="panel-card"><div className="panel-heading"><div><h2>Workspace timeline</h2><p>Events read from the durable audit log.</p></div><Activity size={17}/></div><EventList workspace={workspace} onError={setError}/></div>}
          {page === 'Settings' && <div className="settings-grid"><div className="panel-card"><h2>Integration health</h2><p>Live capabilities are based on actual connectivity and configured credentials.</p><div className="health-row"><Database size={17}/><div><strong>FalkorDB</strong><span>{health?.integrations.falkordb.available ? 'Connected and responding' : 'Unavailable · start FalkorDB to enable graph-backed features'}</span></div><span className={health?.integrations.falkordb.available ? 'ok-dot' : 'bad-dot'}/></div><div className="health-row"><Sparkles size={17}/><div><strong>Model provider</strong><span>{health?.integrations.model.configured ? `Configured · ${health.integrations.model.model}` : 'Unconfigured · set VERCEL_AI_GATEWAY_API_KEY on the server'}</span></div><span className={health?.integrations.model.configured ? 'ok-dot' : 'bad-dot'}/></div></div><div className="panel-card"><h2>Workspace isolation</h2><p>Each workspace receives a server-derived FalkorDB graph name and a signed, expiring account session.</p><div className="workspace-id">{workspace.id}</div><span className="form-note"><LockKeyhole size={13}/> Account sessions expire in 24 hours. Email verification and password recovery are not enabled yet.</span></div></div>}
        </>}
      </div>
    </main>
    {showCreate && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}><div className="modal"><button className="modal-close" onClick={()=>setShowCreate(false)}><X size={17}/></button><div className="eyebrow"><ShieldCheck size={13}/> PRIVATE BY DEFAULT</div><h2>Create a workspace</h2><p>Your workspace gets a separate FalkorDB graph. Nothing is preloaded.</p><label>Workspace name<input autoFocus value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createWorkspace()}/></label><div className="modal-foot"><span><LockKeyhole size={13}/> Account-owned workspace</span><button className="primary-button" disabled={!workspaceName.trim()||loading} onClick={createWorkspace}>{loading?<LoaderCircle size={15} className="spin"/>:<Plus size={15}/>} Create workspace</button></div></div></div>}
        {authMode && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setAuthMode(null);setPassword('');}}}><form className="modal auth-modal" onSubmit={e=>{e.preventDefault();void authenticate();}}><button type="button" className="modal-close" onClick={()=>{setAuthMode(null);setPassword('');}}><X size={17}/></button><div className="eyebrow"><ShieldCheck size={13}/> AFTERHACK ACCOUNT</div><h2>{authMode==='signup'?'Create your account':'Welcome back'}</h2><p>{authMode==='signup'?'Sign up with email and password. Email verification and password recovery are not enabled yet.':'Log in to continue to your private workspaces.'}</p><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete={authMode==='signup'?'new-password':'current-password'} required minLength={authMode==='signup'?12:1} value={password} onChange={e=>setPassword(e.target.value)} placeholder={authMode==='signup'?'At least 12 characters':'Your password'}/></label><div className="modal-foot auth-modal-foot"><span>{authMode==='signup'?'12+ characters required':'Credentials stay server-side'}</span><button type="submit" className="primary-button" disabled={loading||!email||!password}>{loading?<LoaderCircle size={15} className="spin"/>:<ArrowUpRight size={15}/>} {authMode==='signup'?'Create account':'Log in'}</button></div><button type="button" className="auth-switch" onClick={()=>setAuthMode(authMode==='signup'?'login':'signup')}>{authMode==='signup'?'Already have an account? Log in':'New to Afterhack? Create an account'}</button></form></div>}
    {selected && <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><aside className="detail-drawer"><button className="modal-close" onClick={()=>setSelected(null)}><X size={17}/></button><div className="eyebrow">MEMORY CLAIM</div><h2>{selected.statement}</h2><span className={`status-pill ${selected.status}`}>{selected.status}</span><div className="drawer-section"><span>{selected.confidence_kind === 'human_correction' ? 'CURRENT REVIEWER CORRECTION' : 'ORIGINAL SOURCE EVIDENCE'}</span><blockquote>“{selected.evidence_quote}”</blockquote><small>{selected.evidence_label ? `${selected.evidence_label} · ` : ''}{selected.evidence_type === 'human_correction' ? 'Entered by a workspace reviewer; not independently confirmed by a source.' : 'Exact quoted span from the submitted source.'}</small></div><div className="drawer-section"><span>ENTER THE CORRECTED INFORMATION</span><p>Write what you believe the claim should say. This creates a reviewer correction and preserves the original. To verify it independently, add an authoritative updated document in Sources too.</p><textarea value={correction} onChange={e=>{setCorrection(e.target.value);setPreview(null);}} placeholder="For example: The service window is scheduled for December 5…"/><button className="secondary-button full" disabled={correction.length<8} onClick={previewCorrection}><Search size={14}/> Preview known impact</button></div>{preview && <div className="preview-box"><div className="preview-heading"><AlertTriangle size={15}/> REVIEW BEFORE RECORDING</div><div className="correction-compare"><span>OLD BELIEF</span><p>{String((preview.claim as Record<string, unknown> | undefined)?.statement ?? selected.statement)}</p><span>YOUR CORRECTION</span><p>{correction}</p></div><p>Known dependent records: {Array.isArray(preview.affected)?preview.affected.length:0}</p><p className="uncertainty-text">{String(preview.uncertainty)} The replacement will be marked as reviewer-provided, not as an extracted source fact.</p><button className="primary-button full" onClick={applyCorrection}><Check size={15}/> Record correction and preserve history</button></div>}</aside></div>}
  </div>;
}

function EventList({workspace,onError}:{workspace:Workspace|null;onError:(message:string)=>void}) {
  const [events,setEvents]=useState<{id:string;type:string;created_at:string;payload:string}[]>([]);
  const [loadError,setLoadError]=useState('');
  useEffect(()=>{if(!workspace)return;let active=true;const get=()=>api<typeof events>(`/api/v1/workspaces/${workspace.id}/events?limit=20`,workspace.access_token).then(result=>{if(active){setEvents(result);setLoadError('')}}).catch(e=>{if(active){const message=e instanceof Error?e.message:'Could not load activity';setLoadError(message);onError(message)}});get();const t=setInterval(get,5000);return()=>{active=false;clearInterval(t)};},[workspace,onError]);
  if(!workspace)return <div className="empty-inline">Create a workspace to record events.</div>;
  if(loadError)return <div className="empty-inline"><AlertTriangle size={16}/><span>Activity could not be loaded. See the error above.</span></div>;
  return events.length ? <div className="event-list">{events.map(e=><div className="event-row" key={e.id}><span className="event-dot"/><div><strong>{e.type.replace(/\./g,' ')}</strong><span>{new Date(e.created_at).toLocaleString()}</span></div></div>)}</div> : <div className="empty-inline"><Clock3 size={16}/><span>No recorded activity yet.</span></div>;
}
function DecisionActionPanel({workspace,onError}:{workspace:Workspace|null;onError:(message:string)=>void}) {
  const [decisions,setDecisions]=useState<{id:string;title:string;rationale:string;status:string;uncertainty:string;claim_ids:string[]}[]>([]);
  const [actions,setActions]=useState<{id:string;title:string;status:string;decision_id:string;decision_status:string}[]>([]);
  const [loadError,setLoadError]=useState('');
  useEffect(()=>{if(!workspace)return;let active=true;Promise.all([api<typeof decisions>(`/api/v1/workspaces/${workspace.id}/decisions`,workspace.access_token),api<typeof actions>(`/api/v1/workspaces/${workspace.id}/actions`,workspace.access_token)]).then(([d,a])=>{if(active){setDecisions(d);setActions(a);setLoadError('')}}).catch(e=>{if(active){const message=e instanceof Error?e.message:'Could not load decisions and actions';setLoadError(message);onError(message)}});return()=>{active=false}},[workspace,onError]);
  if(loadError)return <div className="panel-card empty-inline"><AlertTriangle size={16}/><span>Decisions and actions could not be loaded. See the error above.</span></div>;
  return <div className="two-col"><div className="panel-card"><div className="panel-heading"><div><h2>Evidence-backed decisions</h2><p>Premises link to graph claim IDs; uncertainty stays visible.</p></div></div>{decisions.length?decisions.map(d=><div className="decision-row" key={d.id}><div className="decision-title"><strong>{d.title}</strong><span className={`status-pill ${d.status}`}>{d.status.replace('_',' ')}</span></div><p>{d.rationale}</p><small>{d.claim_ids.length} premise(s) · {d.id}</small>{d.uncertainty&&<div className="uncertainty-note"><CircleHelp size={14}/>{d.uncertainty}</div>}</div>):<div className="empty-state compact"><Check size={20}/><strong>No decisions yet</strong><span>Use the Agent workspace to create a persisted decision proposal.</span></div>}</div><div className="panel-card"><div className="panel-heading"><div><h2>Dependent actions</h2><p>Proposals remain non-executable pending approval.</p></div></div>{actions.length?actions.map(a=><div className="decision-row" key={a.id}><div className="decision-title"><strong>{a.title}</strong><span className={`status-pill ${a.status}`}>{a.status}</span></div><p>Required decision: {a.decision_status}</p><small>{a.decision_id}</small></div>):<div className="empty-state compact"><ArrowDownRight size={20}/><strong>No actions yet</strong><span>Coordinators can propose work linked to supported decisions.</span></div>}</div></div>;
}
function SourceList({workspace,onError}:{workspace:Workspace|null;onError:(message:string)=>void}) {
  const [sources,setSources]=useState<{id:string;name:string;version_id:string;created_at:string;status:string}[]>([]);
  const [loadError,setLoadError]=useState('');
  const [loadingSources,setLoadingSources]=useState(true);
  useEffect(()=>{if(!workspace)return;let active=true;setLoadingSources(true);api<typeof sources>(`/api/v1/workspaces/${workspace.id}/sources`,workspace.access_token).then(result=>{if(active){setSources(result);setLoadError('')}}).catch(e=>{if(active){const message=e instanceof Error?e.message:'Could not load sources';setLoadError(message);onError(message)}}).finally(()=>{if(active)setLoadingSources(false)});return()=>{active=false}},[workspace,onError]);
  if(loadError)return <div className="empty-inline"><AlertTriangle size={16}/><span>Sources could not be loaded. See the error above.</span></div>;
  if(loadingSources)return <div className="empty-inline"><LoaderCircle size={16} className="spin"/><span>Loading saved sources…</span></div>;
  return sources.length ? <div className="source-list">{sources.map(s=><div className="source-row" key={s.version_id}><div className="source-file"><FilePlus2 size={16}/></div><div><strong>{s.name}</strong><span>Version · {new Date(s.created_at).toLocaleString()}</span></div><span className="status-pill proposed">{s.status}</span></div>)}</div> : <div className="empty-state compact"><BookOpen size={20}/><strong>No sources yet</strong><span>Sources enter the graph through real model extraction.</span></div>;
}
