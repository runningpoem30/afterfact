import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import LandingPage from './LandingPage';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BookOpen, Bot, Check, ChevronDown, CircleHelp, Clock3, Database, FilePlus2, GitBranch, LayoutDashboard, LoaderCircle, LockKeyhole, Network, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';

type Health = { status: string; integrations: { falkordb: { available: boolean }; model: { configured: boolean; model?: string } }; capabilities: Record<string, boolean> };
type AuthSession = { user: { id: string; email: string }; access_token: string };
type Workspace = { id: string; name: string; owner_id: string; revision: number; access_token: string };
type Overview = { workspace: { id: string; name: string; revision: number }; counts: Record<string, number>; attention: { id: string; type: string; title: string; status: string }[] };
type GraphPayload = { nodes: { id: string; type: string; label: string; status: string; properties: Record<string, unknown> }[]; edges: { source: string; target: string; type: string }[] };
type Claim = { id: string; statement: string; status: string; confidence: number; evidence_quote: string };
const API = import.meta.env.VITE_API_BASE_URL ?? '';

async function api<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers } });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.detail?.message ?? body?.detail ?? `Request failed (${response.status})`); }
  return response.json();
}

const initialNav = [
  { section: 'WORKSPACE', items: [{ name: 'Overview', icon: LayoutDashboard }, { name: 'Sources', icon: BookOpen }, { name: 'Memory', icon: Database }, { name: 'Agent workspace', icon: Bot }, { name: 'Decisions & actions', icon: Check }, { name: 'Investigations', icon: GitBranch }, { name: 'Activity', icon: Activity }] },
  { section: 'SYSTEM', items: [{ name: 'Settings', icon: Settings2 }] },
];

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
  const [banner, setBanner] = useState('');
  const [agentTask, setAgentTask] = useState('');
  const [agentResult, setAgentResult] = useState<{ status: string; decision: { title?: string; rationale?: string; uncertainty?: string }; tool_calls: { tool: string; result_count: number }[]; claim_ids: string[]; analyst_run_id: string; coordinator_run_id: string } | null>(null);

  const enterSavedWorkspace = () => { if (savedWorkspace && auth && savedWorkspace.owner_id === auth.user.id) setWorkspace(savedWorkspace); };
  const createWorkspaceFromLanding = () => { if (auth) setShowCreate(true); else setAuthMode('signup'); };
  const authenticate = async () => {
    setLoading(true); setError('');
    try {
      const result = await api<AuthSession>(`/api/v1/auth/${authMode}`, undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('afterhack_auth', JSON.stringify(result));
      setAuth(result);
      setAuthMode(null);
      setPassword('');
      if (savedWorkspace && savedWorkspace.owner_id === result.user.id) setWorkspace(savedWorkspace);
      else { localStorage.removeItem('afterhack_workspace'); setShowCreate(true); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Authentication failed'); }
    finally { setLoading(false); }
  };
  const logout = () => { localStorage.removeItem('afterhack_auth'); localStorage.removeItem('afterhack_workspace'); setAuth(null); setWorkspace(null); setOverview(null); setGraph(null); setClaims([]); setAgentResult(null); setBanner('You have logged out. Your account-owned workspace remains stored in FalkorDB.'); };

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
    try { const out = await api<{ created_count: number }>('/api/v1/sources', workspace.access_token, { method: 'POST', body: JSON.stringify({ workspace_id: workspace.id, name: sourceName, content: sourceText }) }); setBanner(`Source stored. ${out.created_count} evidence-backed claim(s) extracted.`); setSourceText(''); setSourceName(''); await refreshClaims(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ingestion failed'); } finally { setLoading(false); }
  };
  const fileUpload = async (file?: File) => {
    if (!workspace || !file) return;
    const data = new FormData(); data.append('file', file);
    try { const response = await fetch(`/api/v1/sources/upload?workspace_id=${workspace.id}`, { method: 'POST', headers: { Authorization: `Bearer ${workspace.access_token}` }, body: data }); if (!response.ok) throw new Error((await response.json()).detail?.message || 'Upload failed'); setBanner('Source uploaded and processed.'); await refreshClaims(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
  };
  const previewCorrection = async () => {
    if (!workspace || !selected || !correction) return;
    try { setPreview(await api('/api/v1/corrections/preview', workspace.access_token, { method: 'POST', body: JSON.stringify({ workspace_id: workspace.id, claim_id: selected.id, corrected_statement: correction }) })); } catch (e) { setError(e instanceof Error ? e.message : 'Preview failed'); }
  };
  const runAgent = async () => {
    if (!workspace || !agentTask) return;
    setLoading(true); setError(''); setAgentResult(null);
    try { const result = await api<typeof agentResult>(`/api/v1/workspaces/${workspace.id}/agents/tasks`, workspace.access_token, { method: 'POST', body: JSON.stringify({ task: agentTask }) }); setAgentResult(result); setBanner('Analyst completed evidence retrieval and handed the proposal to Coordinator.'); await refreshClaims(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Agent run failed'); }
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

  const nodes = useMemo<Node[]>(() => (graph?.nodes ?? []).map((n, index) => ({ id: n.id, position: { x: 120 + (index % 4) * 250, y: 90 + Math.floor(index / 4) * 170 }, data: { label: <div className="graph-node"><span className={`node-dot ${n.type.toLowerCase()}`} /> <strong>{n.type}</strong><span>{n.label || n.id}</span><small>{n.status}</small></div> }, className: `node-${n.status}` })), [graph]);
  const edges = useMemo<Edge[]>(() => (graph?.edges ?? []).filter(e => nodes.some(n => n.id === e.source) && nodes.some(n => n.id === e.target)).map((e, i) => ({ id: `${e.source}-${e.target}-${i}`, source: e.source, target: e.target, label: e.type.replace(/_/g, ' ').toLowerCase(), animated: false, style: { stroke: '#b2aea4' }, labelStyle: { fill: '#777368', fontSize: 10 } })), [graph, nodes]);
  const filteredClaims = claims.filter(c => c.statement?.toLowerCase().includes(search.toLowerCase()));

  return <div className={`app-shell ${workspace ? 'workspace-shell' : 'landing-shell'}`}>
    {workspace && <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><GitBranch size={19} strokeWidth={2.4}/></div><span>AFTERHACK</span><span className="brand-beta">BETA</span></div>
      <div className="workspace-picker" onClick={() => setShowCreate(true)} role="button" tabIndex={0}><div className="workspace-avatar">{workspace?.name?.slice(0,1).toUpperCase() || 'R'}</div><div className="workspace-info"><strong>{workspace?.name || 'Select workspace'}</strong><span>{workspace ? 'Private workspace' : 'Create your first'}</span></div><ChevronDown size={15}/></div>
      <nav>{initialNav.map(group => <div className="nav-group" key={group.section}><div className="nav-label">{group.section}</div>{group.items.map(item => <button className={`nav-item ${page === item.name ? 'active' : ''}`} key={item.name} onClick={() => setPage(item.name)}><item.icon size={17}/><span>{item.name}</span>{item.name === 'Investigations' && overview?.counts.investigations ? <em>{overview.counts.investigations}</em> : null}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="secure-note"><LockKeyhole size={15}/><span>Workspace-isolated<br/>knowledge graph</span></div><button className="user-row user-button" onClick={logout} title="Log out"><div className="user-avatar">{auth?.user.email.slice(0,1).toUpperCase() || 'U'}</div><div><strong>{auth?.user.email || 'Account'}</strong><span>Log out</span></div><ChevronDown size={15}/></button></div>
    </aside>}

    <main className="main">
      {workspace && <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {page}</div><div className="topbar-right"><div className={`system-status ${health?.integrations.falkordb.available ? 'connected' : 'disconnected'}`}><span className="status-light"/>{health?.integrations.falkordb.available ? 'FalkorDB connected' : 'Database unavailable'}</div><button className="icon-button" title="Help"><CircleHelp size={18}/></button><div className="top-avatar"><LockKeyhole size={13}/></div></div></header>}
      <div className="page-content">
        {error && <div className="alert alert-error"><AlertTriangle size={16}/><span>{error}</span><button onClick={() => setError('')}><X size={15}/></button></div>}
        {banner && <div className="alert alert-success"><Check size={16}/><span>{banner}</span><button onClick={() => setBanner('')}><X size={15}/></button></div>}
        {!workspace ? <LandingPage health={health} authenticatedEmail={auth?.user.email ?? null} savedWorkspaceName={auth && savedWorkspace?.owner_id === auth.user.id ? savedWorkspace.name : null} onContinueWorkspace={enterSavedWorkspace} onAuthenticate={setAuthMode} onCreateWorkspace={createWorkspaceFromLanding} onLogout={logout} /> : <>
          <div className="page-heading"><div><div className="eyebrow">{page === 'Overview' ? 'YOUR KNOWLEDGE, ACCOUNTED FOR' : `WORKSPACE / ${page.toUpperCase()}`}</div><h1>{page === 'Overview' ? <>Good morning. <em>Here’s the state of memory.</em></> : page}</h1><p>{page === 'Overview' ? 'Every belief has a source. Every dependency has a path back.' : 'Inspect persisted knowledge and evidence in your isolated FalkorDB graph.'}</p></div><button className="secondary-button" onClick={() => loadWorkspace(workspace)}><Activity size={15}/> Refresh</button></div>
          {loading && <div className="loading-line"><LoaderCircle size={14} className="spin"/> Syncing with FalkorDB…</div>}
          {page === 'Overview' && <>
            <div className="metrics-grid">{[{label:'Sources',key:'sources',icon:BookOpen, tone:'green'}, {label:'Memory claims',key:'claims',icon:Database,tone:'violet'}, {label:'Decisions',key:'decisions',icon:GitBranch,tone:'blue'}, {label:'Actions',key:'actions',icon:ArrowDownRight,tone:'orange'}].map(m => <div className="metric-card" key={m.key}><div className={`metric-icon ${m.tone}`}><m.icon size={17}/></div><div className="metric-label">{m.label}</div><div className="metric-value">{overview?.counts[m.key] ?? '—'}</div><div className="metric-foot"><span className="neutral-change">Live graph count</span></div></div>)}</div>
            <div className="section-row"><div><h2>Knowledge graph</h2><p>Evidence, claims, and their connections from this workspace.</p></div><div className="graph-legend"><span><i className="legend-source"/>Source</span><span><i className="legend-claim"/>Claim</span><span><i className="legend-work"/>Work</span></div></div>
            <div className="graph-panel">{graph && graph.nodes.length ? <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.3} maxZoom={1.6} attributionPosition="bottom-left"><Background color="#e9e7e1" gap={20}/><Controls/><MiniMap nodeColor={(n) => n.className?.includes('superseded') ? '#d28b78' : '#9eb7a6'} maskColor="rgba(245,244,240,0.7)"/></ReactFlow> : <div className="graph-empty"><div className="empty-orbit"><Network size={24}/></div><strong>Your knowledge graph starts with a source</strong><span>Add a document to create evidence-backed memory. No sample graph is preloaded.</span><button className="text-button" onClick={() => setPage('Sources')}>Add a source <ArrowUpRight size={14}/></button></div>}<div className="canvas-label">LIVE GRAPH · {graph?.nodes.length ?? 0} NODES</div></div>
            <div className="below-grid"><div className="panel-card"><div className="panel-heading"><div><h2>Memory to review</h2><p>Claims that need human attention.</p></div><button className="subtle-button" onClick={() => setPage('Memory')}>View all <ArrowUpRight size={14}/></button></div>{overview?.attention.length ? overview.attention.slice(0,4).map((item,i)=><div className="review-row" key={`${item.id}-${i}`}><div className="review-icon"><AlertTriangle size={15}/></div><div className="review-copy"><strong>{item.title || item.type}</strong><span>{item.type} · {item.status}</span></div><ArrowUpRight size={15} className="muted-icon"/></div>) : <div className="empty-inline"><ShieldCheck size={17}/><span>No items require review yet. New claims remain proposed until reviewed.</span></div>}</div><div className="panel-card activity-card"><div className="panel-heading"><div><h2>Recent activity</h2><p>Persisted workspace events.</p></div><Clock3 size={16} className="muted-icon"/></div><EventList workspace={workspace}/></div></div>
          </>}
          {page === 'Sources' && <div className="two-col"><section className="panel-card source-form"><div className="panel-heading"><div><h2>Add a knowledge source</h2><p>Claims are only stored when their cited quote exists in your text.</p></div><FilePlus2 size={19} className="muted-icon"/></div><label>Source name<input value={sourceName} onChange={e=>setSourceName(e.target.value)} placeholder="Policy, decision log, project notes…"/></label><label>Source content<textarea rows={10} value={sourceText} onChange={e=>setSourceText(e.target.value)} placeholder="Paste source text here. Documents are treated as untrusted data, never instructions."/></label><div className="form-actions"><label className="upload-button"><Upload size={15}/> Upload text<input type="file" accept=".txt,.md,.csv,.json" onChange={e=>fileUpload(e.target.files?.[0])}/></label><button className="primary-button" disabled={!sourceName || sourceText.length < 40 || loading} onClick={ingest}>{loading ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} Extract & store</button></div><div className="form-note"><LockKeyhole size={13}/> Requires live FalkorDB and model credentials. No canned extraction is used.</div></section><section className="panel-card"><div className="panel-heading"><div><h2>Ingested sources</h2><p>Source versions and extracted claims.</p></div><BookOpen size={18} className="muted-icon"/></div><SourceList workspace={workspace}/></section></div>}
          {page === 'Agent workspace' && <div className="agent-layout"><div className="panel-card agent-console"><div className="panel-heading"><div><h2>Start a graph-grounded task</h2><p>Analyst retrieves persisted claims and source spans; Coordinator receives an explicit handoff.</p></div><Bot size={19} className="muted-icon"/></div><label>Task<input value={agentTask} onChange={e=>setAgentTask(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runAgent()} placeholder="Ask a question or request evidence-backed work…"/></label><button className="primary-button" disabled={agentTask.length<8||loading||!health?.integrations.model.configured} onClick={runAgent}>{loading?<LoaderCircle size={15} className="spin"/>:<Play size={14}/>} Run Analyst → Coordinator</button>{!health?.integrations.model.configured&&<div className="form-note"><AlertTriangle size={13}/> Agent runs require a configured live model provider.</div>}</div><div className="panel-card"><div className="panel-heading"><div><h2>Run result</h2><p>Persisted run records and tool outputs.</p></div></div>{agentResult?<><div className="run-summary"><span className={`status-pill ${agentResult.status}`}>{agentResult.status}</span><strong>{agentResult.decision.title}</strong><p>{agentResult.decision.rationale}</p>{agentResult.decision.uncertainty&&<span className="uncertainty-text">Uncertainty: {agentResult.decision.uncertainty}</span>}</div><div className="tool-activity">{agentResult.tool_calls.map((call,i)=><div className="tool-row" key={`${call.tool}-${i}`}><span className="tool-index">{String(i+1).padStart(2,'0')}</span><strong>{call.tool}</strong><span>{call.result_count} records</span><Check size={14}/></div>)}</div><div className="run-ids"><span>ANALYST {agentResult.analyst_run_id}</span><span>COORDINATOR {agentResult.coordinator_run_id}</span></div></>:<div className="empty-state compact"><Bot size={21}/><strong>No agent runs yet</strong><span>Runs require both stored graph memory and a real model call.</span></div>}</div></div>}
          {page === 'Decisions & actions' && <DecisionActionPanel workspace={workspace}/>}
          {page === 'Memory' && <div className="panel-card memory-panel"><div className="panel-heading"><div><h2>Persisted claims</h2><p>Every claim points to a quoted source fragment. Confidence is extraction confidence, not truth.</p></div><div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search claims"/></div></div>{filteredClaims.length ? filteredClaims.map(claim=><button className="claim-row" key={claim.id} onClick={()=>{setSelected(claim);setCorrection('');setPreview(null);}}><div className="claim-status"><span className={`status-pill ${claim.status}`}>{claim.status.replace('_',' ')}</span><span className="confidence">{Math.round((claim.confidence||0)*100)}% extraction confidence</span></div><strong>{claim.statement}</strong><blockquote>“{claim.evidence_quote}”</blockquote><span className="claim-id">{claim.id}</span></button>) : <div className="empty-state"><Database size={22}/><strong>{search ? 'No matching claims' : 'No stored claims yet'}</strong><span>Ingest a source with a configured model to extract claims with exact provenance.</span></div>}</div>}
          {page === 'Investigations' && <div className="investigation-layout"><div className="panel-card graph-investigation"><div className="panel-heading"><div><h2>Dependency canvas</h2><p>Backend-returned nodes and relationships, bounded to 120 nodes.</p></div><span className="live-tag"><span/> LIVE GRAPH</span></div><div className="graph-panel large">{graph?.nodes.length ? <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={1.8}><Background color="#e9e7e1" gap={20}/><Controls/><MiniMap nodeColor="#98ad9b"/></ReactFlow> : <div className="graph-empty"><div className="empty-orbit"><Network size={24}/></div><strong>No dependency graph yet</strong><span>Ingest sources and build decisions to inspect their paths.</span></div>}</div></div><div className="panel-card impact-card"><h2>Impact review</h2><p>Choose a claim in Memory to preview its downstream dependencies before correction.</p>{claims.slice(0,6).map(c=><button key={c.id} className="impact-claim" onClick={()=>{setSelected(c);setCorrection('');setPreview(null);}}><span className={`node-dot claim`}/><span>{c.statement}</span><ArrowUpRight size={14}/></button>)}<div className="uncertainty-note"><CircleHelp size={15}/><span>Reachability is not invalidity. Independent evidence and support requirements must be checked before repair.</span></div></div></div>}
          {page === 'Activity' && <div className="panel-card"><div className="panel-heading"><div><h2>Workspace timeline</h2><p>Events read from the durable audit log.</p></div><Activity size={17}/></div><EventList workspace={workspace}/></div>}
          {page === 'Settings' && <div className="settings-grid"><div className="panel-card"><h2>Integration health</h2><p>Live capabilities are based on actual connectivity and configured credentials.</p><div className="health-row"><Database size={17}/><div><strong>FalkorDB</strong><span>{health?.integrations.falkordb.available ? 'Connected and responding' : 'Unavailable · start FalkorDB to enable graph-backed features'}</span></div><span className={health?.integrations.falkordb.available ? 'ok-dot' : 'bad-dot'}/></div><div className="health-row"><Sparkles size={17}/><div><strong>Model provider</strong><span>{health?.integrations.model.configured ? `Configured · ${health.integrations.model.model}` : 'Unconfigured · set VERCEL_AI_GATEWAY_API_KEY on the server'}</span></div><span className={health?.integrations.model.configured ? 'ok-dot' : 'bad-dot'}/></div></div><div className="panel-card"><h2>Workspace isolation</h2><p>Each workspace receives a server-derived FalkorDB graph name and a signed, expiring guest session.</p><div className="workspace-id">{workspace.id}</div><span className="form-note"><LockKeyhole size={13}/> Local guest sessions expire in 24 hours. Production deployments should use a full identity provider.</span></div></div>}
        </>}
      </div>
    </main>
    {showCreate && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}><div className="modal"><button className="modal-close" onClick={()=>setShowCreate(false)}><X size={17}/></button><div className="eyebrow"><ShieldCheck size={13}/> PRIVATE BY DEFAULT</div><h2>Create a workspace</h2><p>Your workspace gets a separate FalkorDB graph. Nothing is preloaded.</p><label>Workspace name<input autoFocus value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createWorkspace()}/></label><div className="modal-foot"><span><LockKeyhole size={13}/> Account-owned workspace</span><button className="primary-button" disabled={!workspaceName.trim()||loading} onClick={createWorkspace}>{loading?<LoaderCircle size={15} className="spin"/>:<Plus size={15}/>} Create workspace</button></div></div></div>}
        {authMode && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setAuthMode(null);setPassword('');}}}><form className="modal auth-modal" onSubmit={e=>{e.preventDefault();void authenticate();}}><button type="button" className="modal-close" onClick={()=>{setAuthMode(null);setPassword('');}}><X size={17}/></button><div className="eyebrow"><ShieldCheck size={13}/> AFTERHACK ACCOUNT</div><h2>{authMode==='signup'?'Create your account':'Welcome back'}</h2><p>{authMode==='signup'?'Sign up with email and password. Email verification and password recovery are not enabled yet.':'Log in to continue to your private workspaces.'}</p><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete={authMode==='signup'?'new-password':'current-password'} required minLength={authMode==='signup'?12:1} value={password} onChange={e=>setPassword(e.target.value)} placeholder={authMode==='signup'?'At least 12 characters':'Your password'}/></label><div className="modal-foot auth-modal-foot"><span>{authMode==='signup'?'12+ characters required':'Credentials stay server-side'}</span><button type="submit" className="primary-button" disabled={loading||!email||!password}>{loading?<LoaderCircle size={15} className="spin"/>:<ArrowUpRight size={15}/>} {authMode==='signup'?'Create account':'Log in'}</button></div><button type="button" className="auth-switch" onClick={()=>setAuthMode(authMode==='signup'?'login':'signup')}>{authMode==='signup'?'Already have an account? Log in':'New to Afterhack? Create an account'}</button></form></div>}
    {selected && <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><aside className="detail-drawer"><button className="modal-close" onClick={()=>setSelected(null)}><X size={17}/></button><div className="eyebrow">MEMORY CLAIM</div><h2>{selected.statement}</h2><span className={`status-pill ${selected.status}`}>{selected.status}</span><div className="drawer-section"><span>SUPPORTING EVIDENCE</span><blockquote>“{selected.evidence_quote}”</blockquote><small>Exact quoted span from the submitted source.</small></div><div className="drawer-section"><span>CORRECT THIS CLAIM</span><textarea value={correction} onChange={e=>setCorrection(e.target.value)} placeholder="Describe the corrected information…"/><button className="secondary-button full" disabled={correction.length<8} onClick={previewCorrection}><Search size={14}/> Preview impact</button></div>{preview && <div className="preview-box"><div className="preview-heading"><AlertTriangle size={15}/> PREVIEW · NO CHANGES APPLIED</div><p>Potentially affected records: {Array.isArray(preview.affected)?preview.affected.length:0}</p><p className="uncertainty-text">{String(preview.uncertainty)}</p><button className="primary-button full" onClick={applyCorrection}><Check size={15}/> Apply correction</button></div>}</aside></div>}
  </div>;
}

function EventList({workspace}:{workspace:Workspace|null}) {
  const [events,setEvents]=useState<{id:string;type:string;created_at:string;payload:string}[]>([]);
  useEffect(()=>{if(!workspace)return;const get=()=>api<typeof events>(`/api/v1/workspaces/${workspace.id}/events?limit=20`,workspace.access_token).then(setEvents).catch(()=>undefined);get();const t=setInterval(get,5000);return()=>clearInterval(t);},[workspace]);
  if(!workspace)return <div className="empty-inline">Create a workspace to record events.</div>;
  return events.length ? <div className="event-list">{events.map(e=><div className="event-row" key={e.id}><span className="event-dot"/><div><strong>{e.type.replace(/\./g,' ')}</strong><span>{new Date(e.created_at).toLocaleString()}</span></div></div>)}</div> : <div className="empty-inline"><Clock3 size={16}/><span>No recorded activity yet.</span></div>;
}
function DecisionActionPanel({workspace}:{workspace:Workspace|null}) {
  const [decisions,setDecisions]=useState<{id:string;title:string;rationale:string;status:string;uncertainty:string;claim_ids:string[]}[]>([]);
  const [actions,setActions]=useState<{id:string;title:string;status:string;decision_id:string;decision_status:string}[]>([]);
  useEffect(()=>{if(!workspace)return;Promise.all([api<typeof decisions>(`/api/v1/workspaces/${workspace.id}/decisions`,workspace.access_token),api<typeof actions>(`/api/v1/workspaces/${workspace.id}/actions`,workspace.access_token)]).then(([d,a])=>{setDecisions(d);setActions(a)}).catch(()=>undefined)},[workspace]);
  return <div className="two-col"><div className="panel-card"><div className="panel-heading"><div><h2>Evidence-backed decisions</h2><p>Premises link to graph claim IDs; uncertainty stays visible.</p></div></div>{decisions.length?decisions.map(d=><div className="decision-row" key={d.id}><div className="decision-title"><strong>{d.title}</strong><span className={`status-pill ${d.status}`}>{d.status.replace('_',' ')}</span></div><p>{d.rationale}</p><small>{d.claim_ids.length} premise(s) · {d.id}</small>{d.uncertainty&&<div className="uncertainty-note"><CircleHelp size={14}/>{d.uncertainty}</div>}</div>):<div className="empty-state compact"><Check size={20}/><strong>No decisions yet</strong><span>Use the Agent workspace to create a persisted decision proposal.</span></div>}</div><div className="panel-card"><div className="panel-heading"><div><h2>Dependent actions</h2><p>Proposals remain non-executable pending approval.</p></div></div>{actions.length?actions.map(a=><div className="decision-row" key={a.id}><div className="decision-title"><strong>{a.title}</strong><span className={`status-pill ${a.status}`}>{a.status}</span></div><p>Required decision: {a.decision_status}</p><small>{a.decision_id}</small></div>):<div className="empty-state compact"><ArrowDownRight size={20}/><strong>No actions yet</strong><span>Coordinators can propose work linked to supported decisions.</span></div>}</div></div>;
}
function SourceList({workspace}:{workspace:Workspace|null}) {
  const [sources,setSources]=useState<{id:string;name:string;version_id:string;created_at:string;status:string}[]>([]);
  useEffect(()=>{if(!workspace)return;api<typeof sources>(`/api/v1/workspaces/${workspace.id}/sources`,workspace.access_token).then(setSources).catch(()=>undefined);},[workspace]);
  return sources.length ? <div className="source-list">{sources.map(s=><div className="source-row" key={s.version_id}><div className="source-file"><FilePlus2 size={16}/></div><div><strong>{s.name}</strong><span>Version · {new Date(s.created_at).toLocaleString()}</span></div><span className="status-pill proposed">{s.status}</span></div>)}</div> : <div className="empty-state compact"><BookOpen size={20}/><strong>No sources yet</strong><span>Sources enter the graph through real model extraction.</span></div>;
}
