import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('Afterhack first-use state', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'degraded', integrations: { falkordb: { available: false }, model: { configured: false } }, capabilities: {} }) }));
  });
  it('explains the product and shows the real integration onboarding', async () => {
    render(<App />);
    expect(screen.getByText(/When the evidence/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start a private workspace/i })).toBeTruthy();
    expect(screen.getByText(/ENGINEERING MEMORY/i)).toBeTruthy();
    expect(await screen.findByText(/Integration status/i)).toBeTruthy();
  });
});
