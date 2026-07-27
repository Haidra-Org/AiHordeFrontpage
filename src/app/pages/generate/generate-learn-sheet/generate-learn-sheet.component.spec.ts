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
  TUTORIAL_STEPS,
  TutorialEngineService,
  TutorialStudioHost,
} from '../../../services/tutorial-engine.service';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
} from '../generate-form.model';
import en from '../../../../assets/i18n/en.json';
import manifest from '../../../../assets/tutorials/manifest.json';
import request from '../../../../assets/tutorials/txt2img/request.json';

const TRANSLATIONS = en as Record<string, string>;

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
    http.expectOne('/assets/tutorials/manifest.json').flush(manifest);
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne('/assets/tutorials/txt2img/request.json')
      .flush(structuredClone(request));
    await started;

    fixture = TestBed.createComponent(GenerateLearnSheetComponent);
    await settle();
  });

  it('docks as a bar of the flow, one target per step', () => {
    expect(dots()).toHaveLength(TUTORIAL_STEPS['txt2img'].length);
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

    expect(host.applied).toEqual([{ prompt: request.prompt }]);
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
