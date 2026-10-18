import { ArrowDownRight, ArrowUpRight, Bot, Database, GitBranch, Network, Plus, ShieldCheck } from 'lucide-react';

type Props = {
  health: {
    integrations: {
      falkordb: { available: boolean };
      model: { configured: boolean };
    };
  } | null;
  onAuthenticate: (mode: 'signup' | 'login') => void;
  authenticatedEmail: string | null;
  savedWorkspaceName: string | null;
  onContinueWorkspace: () => void;
  onCreateWorkspace: () => void;
  onLogout: () => void;
};

export default function LandingPage({ health, onAuthenticate, authenticatedEmail, savedWorkspaceName, onContinueWorkspace, onCreateWorkspace, onLogout }: Props) {
  const graphReady = health?.integrations.falkordb.available ?? false;
  const modelReady = health?.integrations.model.configured ?? false;

  return (
    <>
      <section className="landing-page">
        <div className="landing-topline">
          <span className="eyebrow"><span className="pulse-mark" /> ENGINEERING MEMORY / GRAPH-NATIVE RECOVERY</span>
          <div className="landing-nav"><a href="#how-it-works">SYSTEM OVERVIEW <ArrowDownRight size={13} /></a>{authenticatedEmail ? <button onClick={onLogout}>LOG OUT</button> : <button onClick={() => onAuthenticate('login')}>LOG IN</button>}</div>
        </div>

        <div className="landing-hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span className="kicker-line" /> AGENT KNOWLEDGE, WITH PROVENANCE</div>
            <h1>When the evidence<br />changes, <em>work should<br />change with it.</em></h1>
            <p>Afterhack connects source evidence to agent memory, decisions, and proposed actions—so engineers can inspect what changed and repair downstream work with a traceable record.</p>
            <div className="welcome-actions">
              <div className="landing-actions">
                {authenticatedEmail ? <button className="primary-button" onClick={onCreateWorkspace} disabled={!graphReady}><Plus size={16} /> Create a workspace <ArrowUpRight size={14} /></button> : <button className="primary-button" onClick={() => onAuthenticate('signup')}><Plus size={16} /> Create account <ArrowUpRight size={14} /></button>}
                {savedWorkspaceName && <button className="landing-secondary-button" onClick={onContinueWorkspace}>Continue to {savedWorkspaceName}</button>}
                {!authenticatedEmail && <button className="landing-secondary-button" onClick={() => onAuthenticate('login')}>Log in</button>}
              </div>
              <span><ShieldCheck size={15} /> Email/password account · private workspaces</span>
            </div>
            <div className="hero-proof">
              <span><i className={graphReady ? 'ok-dot' : 'bad-dot'} /> FALKORDB {graphReady ? 'CONNECTED' : 'OFFLINE'}</span>
              <span><i className={modelReady ? 'ok-dot' : 'bad-dot'} /> VERCEL AI GATEWAY {modelReady ? 'CONFIGURED' : 'NOT CONFIGURED'}</span>
            </div>
          </div>

          <div className="hero-terminal">
            <div className="terminal-head">
              <div className="terminal-lights"><i /><i /><i /></div>
              <span>AFTERHACK / KNOWLEDGE TRACE</span>
              <span className="terminal-state"><i className={graphReady ? 'ok-dot' : 'bad-dot'} />{graphReady ? 'ONLINE' : 'WAITING'}</span>
            </div>
            <div className="terminal-body">
              <div className="terminal-line"><span className="terminal-time">01</span><span className="terminal-key">SOURCE</span><span className="terminal-value">immutable evidence + quoted span</span></div>
              <div className="terminal-connector">│</div>
              <div className="terminal-line"><span className="terminal-time">02</span><span className="terminal-key violet">CLAIM</span><span className="terminal-value">proposed memory · source-linked</span></div>
              <div className="terminal-connector">│</div>
              <div className="terminal-line"><span className="terminal-time">03</span><span className="terminal-key amber">DECISION</span><span className="terminal-value">premises · uncertainty · rationale</span></div>
              <div className="terminal-connector">│</div>
              <div className="terminal-line"><span className="terminal-time">04</span><span className="terminal-key red">CORRECTION</span><span className="terminal-value">preview → review → repair</span></div>
              <div className="terminal-footer"><span>GRAPH DATABASE</span><strong>FALKORDB</strong><span className="terminal-divider" /><span>MODEL ROUTING</span><strong>VERCEL AI GATEWAY</strong></div>
            </div>
          </div>
        </div>

        <div className="landing-integrations">
          {health && <>
            <span className="integration-caption">LIVE SERVICE CHECK</span>
            <span><i className={graphReady ? 'ok-dot' : 'bad-dot'} /> FALKORDB <b>{graphReady ? 'READY' : 'UNAVAILABLE'}</b></span>
            <span><i className={modelReady ? 'ok-dot' : 'bad-dot'} /> MODEL GATEWAY <b>{modelReady ? 'CONFIGURED' : 'UNCONFIGURED'}</b></span>
          </>}
        </div>

        <div className="landing-sections" id="how-it-works">
          <div className="landing-section-heading">
            <div><span className="eyebrow">01 / THE ENGINEERING PROBLEM</span><h2>Make memory failures<br /><em>traceable and recoverable.</em></h2></div>
            <p>Not another chat wrapper. A connected record of evidence, beliefs, and work that lets a team ask what changed—and what depends on it.</p>
          </div>
          <div className="capability-grid">
            <article><span className="cap-index">CAPABILITY / 01</span><div className="cap-icon"><Network size={19} /></div><h3>Trace the evidence</h3><p>Inspect source versions, quoted fragments, extracted claims, and the relationships agents used.</p><span className="cap-signal">SOURCE → CLAIM → WORK</span></article>
            <article><span className="cap-index">CAPABILITY / 02</span><div className="cap-icon violet-cap"><Bot size={19} /></div><h3>Coordinate with memory</h3><p>Analyst retrieves stored evidence; Coordinator reviews a structured handoff and persists decisions.</p><span className="cap-signal">ANALYST → HANDOFF → COORDINATOR</span></article>
            <article><span className="cap-index">CAPABILITY / 03</span><div className="cap-icon amber-cap"><GitBranch size={19} /></div><h3>Repair with review</h3><p>Preview potential impact, retain history, and hold changed work for human review—not silent rollback.</p><span className="cap-signal">PREVIEW → REVIEW → APPLY</span></article>
          </div>
          <div className="landing-bottom-cta">
            <div><span className="eyebrow">02 / GET STARTED</span><h2>Bring a source.<br /><em>See what it changes.</em></h2><p>Create an isolated local workspace. No sample claims, precomputed graph, or canned agent answer.</p></div>
            <button className="primary-button" onClick={authenticatedEmail ? onCreateWorkspace : () => onAuthenticate('signup')} disabled={authenticatedEmail ? !graphReady : false}><Plus size={16} /> {authenticatedEmail ? 'Create a workspace' : 'Create account'}</button>
          </div>
          <div className="landing-footnote"><span>AFTERHACK / EMAIL + PASSWORD</span><span>Source text is sent to the configured Vercel AI Gateway during extraction.</span><span>EMAIL VERIFICATION / RESET NOT ENABLED</span></div>
        </div>
      </section>
      {health && <div className="integration-card landing-health-card"><div className="integration-icon"><Database size={17} /></div><div><strong>Integration status</strong><span>Live connectivity/configuration only. No fabricated service metrics.</span></div><div className="integration-state"><span className={graphReady ? 'ok-dot' : 'bad-dot'} /><span>FalkorDB {graphReady ? 'ready' : 'unavailable'}</span><span className={modelReady ? 'ok-dot' : 'bad-dot'} /><span>Model {modelReady ? 'ready' : 'unconfigured'}</span></div></div>}
    </>
  );
}
