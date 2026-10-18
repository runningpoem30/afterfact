import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('Afterhack first-use state', () => {
  beforeEach(() => {
    localStorage.clear();
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
      const payload = url.includes('/overview') ? { workspace: { id: 'workspace-1', name: 'Engineering', revision: 0 }, counts: { sources: 0, claims: 0, decisions: 0, actions: 0, investigations: 0 }, attention: [] }
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
    expect(await screen.findByText('Knowledge graph')).toBeTruthy();
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
    expect(await screen.findByText('Knowledge graph')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Agent workspace/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Knowledge graph').length).toBeGreaterThan(0);
  });
});
