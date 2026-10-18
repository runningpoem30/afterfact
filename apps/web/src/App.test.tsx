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
    expect(screen.getByRole('button', { name: /Start a private workspace/i })).toBeTruthy();
    expect(screen.getByText(/ENGINEERING MEMORY/i)).toBeTruthy();
    expect(await screen.findByText(/Integration status/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Trace the evidence/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Coordinate with memory/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Repair with review/i })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText('Workspace / Overview')).toBeNull();
  });

  it('offers saved workspace access and opens navigation only after explicit continue', async () => {
    localStorage.setItem('afterhack_workspace', JSON.stringify({ id: 'workspace-1', name: 'Engineering', access_token: 'test-token' }));
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
    expect(screen.getByText('Knowledge graph')).toBeTruthy();
  });
});
