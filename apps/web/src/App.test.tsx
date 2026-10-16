import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('RECALL first-use state', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'degraded', integrations: { falkordb: { available: false }, model: { configured: false } }, capabilities: {} }) }));
  });
  it('explains the product and shows the real integration onboarding', async () => {
    render(<App />);
    expect(screen.getByText(/When the evidence changes/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Create private workspace/i })).toBeTruthy();
    expect(await screen.findByText(/Live integrations/i)).toBeTruthy();
  });
});
