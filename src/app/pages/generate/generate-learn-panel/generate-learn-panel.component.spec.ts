import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerateLearnPanelComponent } from './generate-learn-panel.component';
import {
  TUTORIAL_LEVELS,
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
  public readonly bulk: GenerateFormValue[] = [];
  public applyFields(fields: Partial<GenerateFormValue>): void {
    this.applied.push(fields);
  }
  public currentMode(): GenerateMode {
    return 'advanced';
  }
  public setMode(): void {
    /* the panel never reveals on its own account */
  }
  public setSourceMode(_mode: GenerateSourceMode): void {
    /* txt2img attaches no source image */
  }
  public openBulkApply(example: GenerateFormValue): void {
    this.bulk.push(example);
  }
}

describe('GenerateLearnPanelComponent', () => {
  let fixture: ComponentFixture<GenerateLearnPanelComponent>;
  let engine: TutorialEngineService;
  let host: HostStub;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
    );
  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        GenerateLearnPanelComponent,
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

    fixture = TestBed.createComponent(GenerateLearnPanelComponent);
    fixture.detectChanges();
  });

  it('lists every step of the flow, the current one marked', () => {
    const steps = query<HTMLButtonElement>('.gs-learn-step');

    expect(steps).toHaveLength(TUTORIAL_STEPS['txt2img'].length);
    expect(steps[0].getAttribute('aria-current')).toBe('step');
    expect(steps[1].getAttribute('aria-current')).toBeNull();
  });

  it('says where in the flow the reader is', () => {
    engine.goTo(2);
    fixture.detectChanges();

    expect(text()).toContain(`Step 3 of ${engine.total()}`);
  });

  it('moves to a step picked from the list', () => {
    query<HTMLButtonElement>('.gs-learn-step')[3].click();
    fixture.detectChanges();

    expect(engine.step()?.id).toBe('steps');
  });

  it('renders the step body in the chosen register, and only the body', () => {
    const title = (): string =>
      query<HTMLElement>('.gs-guide-head')[0].textContent?.trim() ?? '';
    const body = (): string =>
      query<HTMLElement>('.gs-guide-step-body')[0].textContent?.trim() ?? '';

    const novice = body();
    const noviceTitle = title();

    fixture.componentInstance.setLevel('expert');
    fixture.detectChanges();

    expect(body()).not.toBe(novice);
    expect(body()).toContain(request.prompt);
    // A step is called the same thing however much explanation goes with it.
    expect(title()).toBe(noviceTitle);
    // The step itself never moves when the register does.
    expect(engine.stepIndex()).toBe(0);
    expect(engine.step()?.id).toBe('prompt');
  });

  it('interpolates the committed request into the prose', () => {
    engine.goTo(3);
    fixture.detectChanges();

    expect(text()).toContain(String(request.params.steps));
  });

  it('applies only the current step from its own button', () => {
    query<HTMLButtonElement>('.gs-learn-apply')[0].click();

    expect(host.applied).toEqual([{ prompt: request.prompt }]);
  });

  it('offers no apply button on the finale, only the submit prompt', () => {
    engine.goTo(engine.total() - 1);
    fixture.detectChanges();

    expect(query('.gs-learn-apply')).toHaveLength(0);
    expect(text()).toContain(TRANSLATIONS['generate.learn.finale_hint']);
  });

  it('sends a bulk apply through the studio review panel', () => {
    query<HTMLButtonElement>('.gs-learn-all')[0].click();

    expect(host.bulk).toHaveLength(1);
    expect(host.bulk[0].prompt).toBe(request.prompt);
    expect(host.applied).toEqual([]);
  });

  it('leaves the tutorial from the exit control', () => {
    query<HTMLButtonElement>('.gs-learn-exit')[0].click();

    expect(engine.active()).toBe(false);
  });

  it('names the flow by its outcome, with the technique behind it', () => {
    expect(text()).toContain(
      TRANSLATIONS['generate.tutorials.flows.txt2img.task_name'],
    );
    expect(text()).toContain('Text to image');
  });

  it('has prose for every step in all three registers', () => {
    for (const step of TUTORIAL_STEPS['txt2img']) {
      const base = `generate.learn.flows.txt2img.steps.${step.id}`;
      expect(TRANSLATIONS[`${base}.title`]).toBeTruthy();
      for (const level of TUTORIAL_LEVELS) {
        expect(TRANSLATIONS[`${base}.body.${level}`]).toBeTruthy();
      }
    }
  });

  it('names each register and the reveal it can narrate', () => {
    for (const level of TUTORIAL_LEVELS) {
      expect(TRANSLATIONS[`generate.learn.level.${level}`]).toBeTruthy();
    }
    expect(TRANSLATIONS['generate.learn.reveal.advanced']).toBeTruthy();
    expect(TRANSLATIONS['generate.learn.reveal.source']).toBeTruthy();
  });
});
