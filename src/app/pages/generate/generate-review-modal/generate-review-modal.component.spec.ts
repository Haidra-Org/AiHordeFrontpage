import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { GenerateReviewModalComponent } from './generate-review-modal.component';
import { ImageGenerationRequest } from '../../../types/generation';
import { CivitaiResolverService } from '../../../services/civitai-resolver.service';
import en from '../../../../assets/i18n/en.json';

const REQUEST: ImageGenerationRequest = {
  prompt: 'a lighthouse ### blurry',
  models: ['AlbedoBase XL'],
  params: {
    sampler_name: 'k_euler_a',
    steps: 30,
    cfg_scale: 6.5,
    seed: '33812009',
    width: 1024,
    height: 768,
    n: 3,
  },
};

describe('GenerateReviewModalComponent', () => {
  let fixture: ComponentFixture<GenerateReviewModalComponent>;
  let component: GenerateReviewModalComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GenerateReviewModalComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          preloadLangs: true,
          translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
        }),
      ],
      providers: [
        {
          provide: CivitaiResolverService,
          useValue: {
            requestAll: vi.fn(),
            request: vi.fn(),
            metaFor: vi.fn().mockReturnValue(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateReviewModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('request', REQUEST);
    fixture.componentRef.setInput('kudos', 12);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('reads the request through the shared row builder', () => {
    expect(component.groups().map((group) => group.id)).toEqual([
      'prompt',
      'sampling',
      'size',
    ]);
    const size = component.groups().find((group) => group.id === 'size');
    expect(size?.rows[0].value).toBe('1024 × 768');
  });

  it('names the batch and the size the request actually carries', () => {
    expect(component.batch()).toBe(3);
    expect(component.dimensions()).toEqual({ width: 1024, height: 768 });
  });

  it('shows the request itself as highlighted JSON', () => {
    component.setView('json');
    fixture.detectChanges();

    const code = el.querySelector('.gs-api-code')?.textContent ?? '';
    expect(JSON.parse(code)).toEqual(REQUEST);
    expect(el.querySelector('.gs-api-code .json-key')).toBeTruthy();
  });

  it('keeps the model warning visible in both the settings and JSON views', () => {
    fixture.componentRef.setInput('warnings', [
      {
        id: 'clip_skip:Nova Anime XL',
        section: 'sampling',
        anchor: 'clip_skip',
        key: 'generate.review.clip_skip_warning',
        params: { model: 'Nova Anime XL', current: 1, value: 2 },
      },
    ]);
    for (const view of ['summary', 'json'] as const) {
      component.setView(view);
      fixture.detectChanges();
      const warning = el.querySelector('[role="alert"]')?.textContent ?? '';
      expect(warning).toContain('Nova Anime XL');
      expect(warning).toContain('CLIP skip is 1');
      expect(warning).toContain('recommends 2');
    }
  });

  it('opens with focus on the dialog rather than the confirm', () => {
    expect(document.activeElement).toBe(el.querySelector('.gs-review-panel'));
  });

  it('cancels on Escape without confirming', () => {
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    component.confirmed.subscribe(confirmed);
    component.cancelled.subscribe(cancelled);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('confirms only when the confirm is pressed', () => {
    const confirmed = vi.fn();
    component.confirmed.subscribe(confirmed);

    el.querySelector<HTMLButtonElement>('.gs-modal-done')?.click();

    expect(confirmed).toHaveBeenCalledTimes(1);
  });
});
