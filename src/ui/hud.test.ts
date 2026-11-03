import { describe, expect, it } from 'vitest';
import { GEAR_LABELS } from './hud';

describe('HUD gear display', () => {
  it('shows R for reverse and keeps the forward gear labels', () => {
    expect(GEAR_LABELS.R).toBe('R');
    expect(GEAR_LABELS.L).toBe('L');
    expect(GEAR_LABELS.H).toBe('H');
  });
});
