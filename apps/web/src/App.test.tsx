import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('offers saved workspace access without opening the workspace sidebar automatically', () => {
    localStorage.setItem('afterhack_workspace', JSON.stringify({ id: 'workspace-1', name: 'Engineering', access_token: 'test-token' }));
    render(<App />);
    expect(screen.getByRole('button', { name: /Continue to Engineering/i })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
