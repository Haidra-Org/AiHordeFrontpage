import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerateLearnSheetComponent } from './generate-learn-sheet.component';
import {
  TutorialEngineService,
  TutorialStudioHost,
} from '../../../services/tutorial-engine.service';
import { flowSteps } from '../../../content/flows';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
} from '../generate-form.model';
import en from '../../../../assets/i18n/en.json';
import manifest from '../../../testing/fixtures/example-manifest.stub.json';
import { EXAMPLES_ROOT } from '../../../content/examples';
import request from '../../../testing/fixtures/example-request.stub.json';
import { splitCombinedPrompt } from '../generate-form.model';

const TRANSLATIONS = en as Record<string, string>;

// The payload carries the negative inline; the sheet writes the halves apart.
const [PROMPT, NEGATIVE] = splitCombinedPrompt(request.prompt);

class HostStub implements TutorialStudioHost {
  public readonly applied: Partial<GenerateFormValue>[] = [];
  public applyFields(fields: Partial<GenerateFormValue>): void {
    this.applied.push(fields);
  }
  public currentMode(): GenerateMode {
    return 'advanced';
  }
  public setMode(): void {
    /* the sheet never reveals on its own account */
  }
  public setSourceMode(_mode: GenerateSourceMode): void {
    /* txt2img attaches no source image */
  }
  public openBulkApply(): void {
    /* the bulk route is the panel's, and stays there */
  }
}

describe('GenerateLearnSheetComponent', () => {
  let fixture: ComponentFixture<GenerateLearnSheetComponent>;
  let engine: TutorialEngineService;
  let host: HostStub;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
    );
  const first = <T extends Element>(selector: string): T =>
    query<T>(selector)[0];
  const dots = (): HTMLButtonElement[] =>
    query<HTMLButtonElement>('.gs-tut-dot');
  const body = (): HTMLElement => first<HTMLElement>('.gs-sheet-body');

  /** Let the chassis's post-render work (focus, clearance) run. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        GenerateLearnSheetComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    engine = TestBed.inject(TutorialEngineService);
    host = new HostStub();
    engine.registerHost(host);

    const http = TestBed.inject(HttpTestingController);
    const started = engine.start('txt2img');
    http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne(`${EXAMPLES_ROOT}/txt2img/request.json`)
      .flush(structuredClone(request));
    await started;

    fixture = TestBed.createComponent(GenerateLearnSheetComponent);
    await settle();
  });

  it('docks as a bar of the flow, one target per step', () => {
    expect(dots()).toHaveLength(flowSteps('txt2img').length);
    expect(dots()[0].getAttribute('aria-current')).toBe('step');
    expect(dots()[1].getAttribute('aria-current')).toBeNull();
    // Named by their place and their step, so the list reads without the marks.
    expect(dots()[0].getAttribute('aria-label')).toBe(
      `Step 1: ${TRANSLATIONS['generate.learn.flows.txt2img.steps.prompt.title']}`,
    );
    expect(first<HTMLElement>('.gs-tut-bar-title').textContent?.trim()).toBe(
      TRANSLATIONS['generate.learn.flows.txt2img.steps.prompt.title'],
    );
  });

  it('moves to a step picked from the dots, which follow the move', async () => {
    dots()[3].click();
    await settle();

    expect(engine.step()?.id).toBe('steps');
    expect(dots()[3].getAttribute('aria-current')).toBe('step');
    expect(dots()[0].getAttribute('aria-current')).toBeNull();
    expect(dots()[0].classList).toContain('gs-tut-dot--done');
  });

  it('marks each dot with the panel area its step points at', () => {
    expect(dots()[0].classList).toContain('gs-sec--prompt');
    expect(dots()[0].classList).toContain('gs-tut-dot--on');
    // The finale is about pressing Generate, which belongs to no card.
    expect(dots()[dots().length - 1].className).not.toContain('gs-sec--');
  });

  it('offers the step its own action in the bar, and Next beside it', () => {
    expect(query('.gs-tut-bar-do')).toHaveLength(1);
    expect(first<HTMLElement>('.gs-tut-bar-do').textContent?.trim()).toBe(
      TRANSLATIONS['generate.learn.apply'],
    );
    expect(query('.gs-tut-bar-next')).toHaveLength(1);
  });

  it('writes only the current step, and stays on it', () => {
    first<HTMLButtonElement>('.gs-tut-bar-do').click();

    // The prompt step writes both halves the payload folds into one field,
    // and the separator it folds them with never reaches the form.
    expect(NEGATIVE).toBeTruthy();
    expect(host.applied).toEqual([
      { prompt: PROMPT, negativePrompt: NEGATIVE },
    ]);
    expect(engine.stepIndex()).toBe(0);
  });

  it('promotes Next where the step has nothing to write', async () => {
    // The finale writes nothing and has nowhere to go: what it offers is the
    // button it is asking to be pressed.
    engine.goTo(engine.total() - 1);
    await settle();

    expect(query('.gs-tut-bar-next')).toHaveLength(0);
    expect(first<HTMLElement>('.gs-tut-bar-do').textContent?.trim()).toBe(
      TRANSLATIONS['generate.learn.show_me'],
    );
  });

  it('takes the reader to the step when it opens', async () => {
    expect(body().hidden).toBe(true);

    first<HTMLButtonElement>('.gs-sheet-btn').click();
    await settle();

    expect(body().hidden).toBe(false);
    expect(document.activeElement).toBe(first<HTMLElement>('.gs-guide-head'));
    expect(body().textContent).toContain(
      TRANSLATIONS['generate.learn.sheet_progress']
        .replace('{{ current }}', '1')
        .replace('{{ total }}', String(engine.total())),
    );
  });

  it('breathes with the field its step is pointing at, and only then', async () => {
    const card = (): HTMLElement => first<HTMLElement>('.gs-learn-sheet-card');

    expect(card().classList).toContain('gs-tut-breathe');
    expect(card().classList).toContain('gs-sec--prompt');

    engine.goTo(engine.total() - 1);
    await settle();
    expect(card().classList).not.toContain('gs-tut-breathe');
    expect(card().className).not.toContain('gs-sec--');
  });

  it('leaves the tutorial only from its own exit', () => {
    first<HTMLButtonElement>('.gs-tut-sheet-exit').click();

    expect(engine.active()).toBe(false);
  });

  it('offers no dismissal of its own: Escape unwinds but never exits', async () => {
    // A tutorial part-way through is expensive to lose, so the chassis's close
    // button is suppressed and its second Escape does nothing.
    first<HTMLButtonElement>('.gs-sheet-btn').click();
    await settle();
    expect(query('.gs-sheet-btn')).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(body().hidden).toBe(true);
    expect(engine.active()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(engine.active()).toBe(true);
  });

  describe('a concept track', () => {
    beforeEach(async () => {
      await engine.start('concepts_horde');
      await settle();
      first<HTMLButtonElement>('.gs-sheet-btn').click();
      await settle();
    });

    it('docks as a bar of its steps, with nothing to apply or point at', () => {
      expect(dots()).toHaveLength(flowSteps('concepts_horde').length);
      // Next is the whole of the bar's offer, promoted as it is on any step
      // with nothing of its own to write.
      expect(query('.gs-tut-bar-next')).toHaveLength(1);
      expect(first<HTMLElement>('.gs-tut-bar-next').textContent?.trim()).toBe(
        TRANSLATIONS['generate.learn.next'],
      );
      expect(query('.gs-learn-apply')).toHaveLength(0);
      expect(query('.gs-learn-show')).toHaveLength(0);
      expect(dots()[0].className).not.toContain('gs-sec--');
    });

    it('closes with the walkthrough rather than an ask to press Generate', async () => {
      engine.goTo(engine.total() - 1);
      await settle();

      expect(body().textContent).not.toContain(
        TRANSLATIONS['generate.learn.finale_hint'],
      );
      const cta =
        TRANSLATIONS[
          'generate.learn.flows.concepts_horde.steps.where_next.cta'
        ];
      expect(first<HTMLElement>('.gs-tut-bar-do').textContent?.trim()).toBe(
        cta,
      );
      expect(query('.gs-tut-bar-next')).toHaveLength(0);

      first<HTMLButtonElement>('.gs-learn-cta').click();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await new Promise((resolve) => setTimeout(resolve, 0));
      http
        .expectOne(`${EXAMPLES_ROOT}/txt2img/request.json`)
        .flush(structuredClone(request));
      await settle();

      expect(engine.step()?.id).toBe('prompt');
    });
  });

  it('says what the register picker is, on the screen and not only to a reader', () => {
    expect(
      first<HTMLElement>('.gs-learn-levels-label').textContent?.trim(),
    ).toBe(TRANSLATIONS['generate.learn.level_label']);
    expect(
      first<HTMLElement>('.gs-learn-levels .gs-seg').getAttribute('aria-label'),
    ).toBe(TRANSLATIONS['generate.learn.level_label']);
  });

  it('names its own chrome', () => {
    expect(first<HTMLElement>('app-gs-sheet').getAttribute('aria-label')).toBe(
      TRANSLATIONS['generate.learn.sheet_label'],
    );
    expect(first<HTMLElement>('.gs-tut-dots').getAttribute('aria-label')).toBe(
      TRANSLATIONS['generate.learn.sheet_steps_label'],
    );
    expect(TRANSLATIONS['generate.learn.sheet_exit']).toBeTruthy();
  });
});
