import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, edges, onNodeClick, onEdgeClick }: { nodes: { id: string; data: { label: ReactNode } }[]; edges: { id: string; label?: string; source: string; target: string }[]; onNodeClick?: (event: unknown, node: { id: string }) => void; onEdgeClick?: (event: unknown, edge: { id: string; source: string; target: string; label?: string }) => void }) => <div>{nodes.map(node => <button aria-label={`graph node ${node.id}`} key={node.id} onClick={event => onNodeClick?.(event, node)}>{node.data.label}</button>)}{edges.map(edge => <button aria-label={`graph edge ${edge.id}`} key={edge.id} onClick={event => onEdgeClick?.(event, edge)}>{edge.label}</button>)}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
}));

describe('Afterhack first-use state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'degraded', integrations: { falkordb: { available: false }, model: { configured: false } }, capabilities: {} }) }));
  });
  it('shows a standalone landing page before entering a workspace', async () => {
    render(<App />);
    expect(screen.getByText(/When the evidence/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Create account/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Log in$/i })).toHaveLength(1);
    expect(screen.getByText(/ENGINEERING MEMORY/i)).toBeTruthy();
    expect(screen.queryByText(/FALKORDB CONNECTED|VERCEL AI GATEWAY CONFIGURED/i)).toBeNull();
    expect(screen.queryByText(/LIVE SERVICE CHECK/i)).toBeNull();
    expect(screen.getByRole('heading', { name: /Trace the evidence/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Coordinate with memory/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Repair with review/i })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText('Workspace / Overview')).toBeNull();
  });

  it('offers saved workspace access and opens navigation only after explicit continue', async () => {
    localStorage.setItem('afterhack_auth', JSON.stringify({ user: { id: 'user-1', email: 'engineer@example.com' }, access_token: 'user-token' }));
    localStorage.setItem('afterhack_workspace', JSON.stringify({ id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', access_token: 'test-token' }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith('/session') ? { id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', revision: 0, access_token: 'renewed-token' }
        : url.includes('/overview') ? { workspace: { id: 'workspace-1', name: 'Engineering', revision: 0 }, counts: { sources: 0, claims: 0, decisions: 0, actions: 0, investigations: 0 }, attention: [] }
        : url.includes('/graph') ? { nodes: [], edges: [] }
        : url.includes('/claims') ? []
        : { status: 'degraded', integrations: { falkordb: { available: false }, model: { configured: false } }, capabilities: {} };
      return Promise.resolve({ ok: true, json: async () => payload });
    }));
    render(<App />);
    expect(screen.getByRole('button', { name: /Continue to Engineering/i })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Continue to Engineering/i }));
    await waitFor(() => expect(screen.getByRole('navigation')).toBeTruthy());
    expect((fetch as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('/api/v1/workspaces/workspace-1/session', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('Workspace graph')).toBeTruthy();
  });

  it('renders graph records and reveals details when nodes and relationships are selected', async () => {
    localStorage.setItem('afterhack_auth', JSON.stringify({ user: { id: 'user-1', email: 'engineer@example.com' }, access_token: 'user-token' }));
    localStorage.setItem('afterhack_workspace', JSON.stringify({ id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', access_token: 'test-token' }));
    const graph = { nodes: [
      { id: 'source-1', type: 'Source', label: 'Ops runbook', status: 'active', properties: { name: 'Ops runbook' } },
      { id: 'claim-1', type: 'Claim', label: 'Maintenance window', status: 'proposed', properties: { statement: 'The maintenance window is on December 4.' } },
    ], edges: [{ source: 'claim-1', target: 'source-1', type: 'SUPPORTED_BY', properties: { role: 'primary' } }] };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith('/session') ? { id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', access_token: 'fresh-token' }
        : url.includes('/overview') ? { workspace: { id: 'workspace-1', name: 'Engineering', revision: 0 }, counts: { sources: 1, claims: 1, decisions: 0, actions: 0, investigations: 0 }, attention: [] }
        : url.includes('/graph') ? graph
        : url.includes('/claims') ? []
        : { status: 'ok', integrations: { falkordb: { available: true }, model: { configured: true } }, capabilities: {} };
      return Promise.resolve({ ok: true, json: async () => payload });
    }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Continue to Engineering/i }));
    expect(await screen.findByText('Workspace graph')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Open graph explorer/i })[0]);
    expect(await screen.findByText('Dependency canvas')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'graph node claim-1' })[0]);
    expect(await screen.findByText('The maintenance window is on December 4.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /graph edge/ }));
    expect(await screen.findByRole('heading', { name: /SUPPORTED BY/i })).toBeTruthy();
  });


  it('reports source-list API failures instead of presenting them as an empty workspace', async () => {
    localStorage.setItem('afterhack_auth', JSON.stringify({ user: { id: 'user-1', email: 'engineer@example.com' }, access_token: 'user-token' }));
    localStorage.setItem('afterhack_workspace', JSON.stringify({ id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', access_token: 'test-token' }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/session')) return Promise.resolve({ ok: true, json: async () => ({ id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', access_token: 'fresh-token' }) });
      if (url.endsWith('/sources')) return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: { message: 'Source service unavailable' } }) });
      const payload = url.includes('/overview') ? { workspace: { id: 'workspace-1', name: 'Engineering', revision: 0 }, counts: { sources: 0, claims: 0, decisions: 0, actions: 0, investigations: 0 }, attention: [] }
        : url.includes('/graph') ? { nodes: [], edges: [] }
        : url.includes('/claims') ? []
        : { status: 'ok', integrations: { falkordb: { available: true }, model: { configured: true } }, capabilities: {} };
      return Promise.resolve({ ok: true, json: async () => payload });
    }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Continue to Engineering/i }));
    expect((await screen.findAllByText('Workspace graph')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /^Sources/ }).find(button => button.classList.contains('nav-item'))!);
    expect(await screen.findByText('Source service unavailable')).toBeTruthy();
    expect(screen.queryByText('No sources yet')).toBeNull();
  });

  it('explains and opens each workspace area from the sidebar', async () => {
    localStorage.setItem('afterhack_auth', JSON.stringify({ user: { id: 'user-1', email: 'engineer@example.com' }, access_token: 'user-token' }));
    localStorage.setItem('afterhack_workspace', JSON.stringify({ id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', access_token: 'test-token' }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes('/overview') ? { workspace: { id: 'workspace-1', name: 'Engineering', revision: 0 }, counts: { sources: 0, claims: 0, decisions: 0, actions: 0, investigations: 0 }, attention: [] }
        : url.includes('/graph') ? { nodes: [], edges: [] }
        : url.includes('/claims') || url.includes('/decisions') || url.includes('/actions') || url.includes('/events') || url.includes('/sources') ? []
        : url.endsWith('/session') ? { id: 'workspace-1', name: 'Engineering', owner_id: 'user-1', revision: 0, access_token: 'refreshed-token' }
        : { status: 'ok', integrations: { falkordb: { available: true }, model: { configured: true, model: 'test-model' } }, capabilities: {} };
      return Promise.resolve({ ok: true, json: async () => payload });
    }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Continue to Engineering/i }));
    expect((await screen.findAllByText('Workspace graph')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Counts and graph').length).toBeGreaterThan(0);
    const pages = [
      ['Sources', 'Add documents', 'Add the original information'],
      ['Memory', 'Claims and evidence', 'Persisted claims'],
      ['Agent workspace', 'Ask agents', 'Start a graph-grounded task'],
      ['Decisions & actions', 'Review proposed work', 'Evidence-backed decisions'],
      ['Investigations', 'Trace impact and repair', 'Dependency canvas'],
      ['Activity', 'Workspace history', 'Workspace timeline'],
      ['Settings', 'Connections and account', 'Integration health'],
    ];
    for (const [page, description, heading] of pages) {
      expect(screen.getAllByText(description).length).toBeGreaterThan(0);
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${page}`) }).find(button => button.classList.contains('nav-item'))!);
      expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    }
  });


  it('recovers an account-owned workspace after login without saved browser state', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      let payload: unknown;
      if (url.endsWith('/api/v1/health')) payload = { status: 'ok', integrations: { falkordb: { available: true }, model: { configured: true } }, capabilities: {} };
      else if (url.endsWith('/api/v1/auth/login')) payload = { user: { id: 'user-1', email: 'engineer@example.com' }, access_token: 'fresh-user-token' };
      else if (url.endsWith('/api/v1/workspaces')) payload = [{ id: 'workspace-1', name: 'Persisted project', owner_id: 'user-1', revision: 2, access_token: 'fresh-workspace-token' }];
      else if (url.endsWith('/session')) payload = { id: 'workspace-1', name: 'Persisted project', owner_id: 'user-1', revision: 2, access_token: 'renewed-workspace-token' };
      else if (url.endsWith('/overview')) payload = { workspace: { id: 'workspace-1', name: 'Persisted project', revision: 2 }, counts: { sources: 1, claims: 2, decisions: 0, actions: 0, investigations: 0 }, attention: [] };
      else if (url.endsWith('/graph')) payload = { nodes: [], edges: [] };
      else if (url.endsWith('/claims')) payload = [];
      else payload = [];
      return Promise.resolve({ ok: true, status: 200, json: async () => payload });
    }));

    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Log in$/i })[0]);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'engineer@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-password' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Log in$/i }).find(button => button.closest('form'))!);

    expect((await screen.findAllByText('Workspace graph')).length).toBeGreaterThan(0);
    expect(requests).toContain('/api/v1/workspaces');
    expect(screen.queryByRole('heading', { name: 'Create a workspace' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('afterhack_workspace') || '{}').id).toBe('workspace-1');

    fireEvent.click(screen.getAllByRole('button', { name: /engineer@example.com/i })[0]);
    await waitFor(() => expect(localStorage.getItem('afterhack_auth')).toBeNull());
    expect(screen.getByText(/workspace reference stays on this device/i)).toBeTruthy();
    const savedReference = JSON.parse(localStorage.getItem('afterhack_workspace') || '{}');
    expect(savedReference.id).toBe('workspace-1');
    expect(savedReference.access_token).toBeUndefined();
    expect(localStorage.getItem('afterhack_auth')).toBeNull();
  });

  it('signs up, creates an owned workspace, and enters the workspace UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      let payload: unknown;
      if (url.endsWith('/api/v1/health')) payload = { status: 'ok', integrations: { falkordb: { available: true }, model: { configured: true } }, capabilities: {} };
      else if (url.endsWith('/api/v1/auth/signup')) payload = { user: { id: 'user-1', email: body.email }, access_token: 'user-token' };
      else if (url.endsWith('/api/v1/auth/login')) payload = { user: { id: 'user-1', email: body.email }, access_token: 'user-token' };
      else if (url.endsWith('/api/v1/workspaces')) payload = { id: 'workspace-1', name: body.name, owner_id: 'user-1', revision: 0, access_token: 'workspace-token' };
      else if (url.endsWith('/overview')) payload = { workspace: { id: 'workspace-1', name: 'Launch review', revision: 0 }, counts: { sources: 0, claims: 0, decisions: 0, actions: 0, investigations: 0 }, attention: [] };
      else if (url.endsWith('/graph')) payload = { nodes: [], edges: [] };
      else if (url.endsWith('/claims')) payload = [];
      else payload = [];
      return Promise.resolve({ ok: true, status: 200, json: async () => payload });
    }));

    render(<App />);
    await waitFor(() => expect((screen.getAllByRole('button', { name: /Create account/i })[0] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: /Create account/i })[0]);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'engineer@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-demo-password' } });
    const authSubmit = screen.getAllByRole('button', { name: /Create account/i }).find(button => button.closest('form'));
    expect(authSubmit).toBeTruthy();
    fireEvent.click(authSubmit!);
    fireEvent.change(await screen.findByLabelText('Workspace name'), { target: { value: 'Launch review' } });
    fireEvent.click(screen.getByRole('button', { name: /Create workspace/i }));
    expect((await screen.findAllByText('Workspace graph')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Agent workspace/i }).length).toBeGreaterThan(0);
  });
});
