import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AdminGenerationTrackerComponent } from './admin-generation-tracker.component';
import { AiHordeService } from '../../../services/ai-horde.service';
import {
  GenerationOutput,
  GenerationStatusResponse,
  TrackedGeneration,
} from '../../../types/generation';

function makeOutput(
  overrides: Partial<GenerationOutput> = {},
): GenerationOutput {
  return {
    img: 'https://example.com/generated.webp',
    seed: '12345',
    id: 'out-1',
    censored: false,
    model: 'stable_diffusion',
    state: 'ok',
    worker_id: 'worker-1',
    worker_name: 'WorkerOne',
    ...overrides,
  };
}

function makeImageResult(
  outputs: GenerationOutput[],
): GenerationStatusResponse {
  return {
    finished: outputs.length,
    processing: 0,
    restarted: 0,
    waiting: 0,
    done: true,
    faulted: false,
    wait_time: 0,
    queue_position: 0,
    kudos: 1,
    is_possible: true,
    generations: outputs,
  };
}

function makeTracked(
  overrides: Partial<TrackedGeneration> = {},
): TrackedGeneration {
  return {
    id: 'gen-1',
    type: 'image',
    check: null,
    result: null,
    done: false,
    faulted: false,
    firstSeenAt: Date.now(),
    ...overrides,
  };
}

describe('AdminGenerationTrackerComponent', () => {
  let fixture: ComponentFixture<AdminGenerationTrackerComponent>;
  let component: AdminGenerationTrackerComponent;

  const mockHorde = {
    checkImageGeneration: vi.fn().mockReturnValue(of(null)),
    getImageGenerationStatus: vi.fn().mockReturnValue(of(null)),
    getTextGenerationStatus: vi.fn().mockReturnValue(of(null)),
    getAlchemyStatus: vi.fn().mockReturnValue(of(null)),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AdminGenerationTrackerComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [{ provide: AiHordeService, useValue: mockHorde }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminGenerationTrackerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('getResponseJson strips long base64 payloads', () => {
    const rawBase64 = `iVBORw0KGgo${'A'.repeat(300)}`;
    const generation = makeTracked({
      done: true,
      result: makeImageResult([makeOutput({ img: rawBase64 })]),
    });

    const responseJson = component.getResponseJson(generation);

    expect(responseJson).toContain('[base64 data omitted]');
    expect(responseJson).not.toContain(rawBase64);
  });

  it('getResponseJson preserves image URLs', () => {
    const longUrl = `https://example.com/generated.webp?sig=${'A'.repeat(300)}`;
    const generation = makeTracked({
      done: true,
      result: makeImageResult([makeOutput({ img: longUrl })]),
    });

    const responseJson = component.getResponseJson(generation);

    expect(responseJson).toContain(longUrl);
    expect(responseJson).not.toContain('[base64 data omitted]');
  });

  it('converts raw base64 output to a renderable data URL', () => {
    const rawBase64 = `iVBORw0KGgo${'A'.repeat(300)}`;
    const output = makeOutput({ img: rawBase64 });

    expect(component.getOutputImageSrc(output)).toBe(
      `data:image/png;base64,${rawBase64}`,
    );
    expect(component.getOutputImageLink(output)).toBeNull();
  });

  it('returns direct links for URL outputs', () => {
    const output = makeOutput({ img: 'https://example.com/image.webp' });

    expect(component.getOutputImageSrc(output)).toBe(
      'https://example.com/image.webp',
    );
    expect(component.getOutputImageLink(output)).toBe(
      'https://example.com/image.webp',
    );
  });

  it('returns a readable last-refreshed label when timestamp exists', () => {
    expect(component.getLastRefreshedTimeLabel()).toBeNull();

    const timestamp = Date.UTC(2025, 0, 1, 12, 34, 56);
    component.lastRefreshedAt.set(timestamp);

    expect(component.getLastRefreshedTimeLabel()).toBe(
      new Date(timestamp).toLocaleTimeString(),
    );
  });

  it('copyGenerationId stores copied id then clears it after timeout', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyGenerationId('gen-copy');

    expect(writeText).toHaveBeenCalledWith('gen-copy');
    expect(component.copiedGenerationId()).toBe('gen-copy');

    vi.advanceTimersByTime(2000);

    expect(component.copiedGenerationId()).toBeNull();
  });

  it('copyGenerationId keeps copied state unchanged when copy fails', async () => {
    const doc = document as Document & {
      execCommand?: (commandId: string) => boolean;
    };
    if (!doc.execCommand) {
      Object.defineProperty(doc, 'execCommand', {
        value: () => false,
        configurable: true,
        writable: true,
      });
    }
    const execSpy = vi.spyOn(doc, 'execCommand').mockReturnValue(false);
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    component.copiedGenerationId.set('existing-copy');

    await component.copyGenerationId('gen-copy');

    expect(component.copiedGenerationId()).toBe('existing-copy');
    expect(execSpy).toHaveBeenCalledWith('copy');
  });
});
