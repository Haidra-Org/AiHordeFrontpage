import { describe, expect, it } from 'vitest';
import { baselineLabel } from './model-labels';

describe('baselineLabel', () => {
  it('prints the name a reader knows each listed family by', () => {
    expect(baselineLabel('stable_diffusion_1')).toBe('SD 1.5');
    expect(baselineLabel('stable_diffusion_2')).toBe('SD 2');
    expect(baselineLabel('stable_diffusion_xl')).toBe('SDXL');
    expect(baselineLabel('flux_1')).toBe('Flux');
    expect(baselineLabel('qwen_image')).toBe('Qwen Image');
    expect(baselineLabel('z_image_turbo')).toBe('Z-Image Turbo');
  });

  it('falls back to the recorded token for a family it does not list', () => {
    expect(baselineLabel('some_future_family')).toBe('some_future_family');
  });
});
