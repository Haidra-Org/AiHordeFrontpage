import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerateLearnSheetComponent } from './generate-learn-sheet.component';
import {
  ModelAvailability,
  TutorialEngineService,
  TutorialStudioHost,
} from '../../../services/tutorial-engine.service';
import { flowSteps } from '../../../content/flows';
import { GenerateFormValue, GenerateSourceMode } from '../generate-form.model';
import en from '../../../../assets/i18n/en.json';
import manifest from '../../../testing/fixtures/example-manifest.stub.json';
import { EXAMPLES_ROOT } from '../../../content/examples';
import { docsExampleLink } from '../../../content/docs-links';
import request from '../../../testing/fixtures/example-request.stub.json';
import meta from '../../../testing/fixtures/example-meta.stub.json';
import { splitCombinedPrompt } from '../generate-form.model';
import { environment } from '../../../../environments/environment';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';

const TRANSLATIONS = en as Record<string, string>;

// The payload carries the negative inline; the sheet writes the halves apart.
const [PROMPT, NEGATIVE] = splitCombinedPrompt(request.prompt);

class HostStub implements TutorialStudioHost {
  public readonly applied: Partial<GenerateFormValue>[] = [];
  /**
   * What the live model list says about each model. A model nothing is said
   * about is being carried, which is what these tests run in.
   */
  public readonly availability = new Map<string, ModelAvailability>();
  public modelAvailability(name: string): ModelAvailability {
    return this.availability.get(name) ?? 'available';
  }
  public applyFields(fields: Partial<GenerateFormValue>): void {
    this.applied.push(fields);
  }
  public currentSourceMode(): GenerateSourceMode {
    return 'none';
  }
  public setSourceMode(_mode: GenerateSourceMode): void {
    /* txt2img attaches no source image */
  }
  public openFieldGroup(): boolean {
    // The stub panel folds nothing away, so nothing is ever unfolded for it.
    return false;
  }
  public openBulkApply(): void {
    /* the bulk route is the panel's, and stays there */
  }
  /** The studio's answer while a tutorial has the panel: settings put away. */
  public setAside(): void {
    /* the engine asks on start; this stub is already cleared */
  }
  public hasSetAside(): boolean {
    return true;
  }
  public restoreSetAside(): boolean {
    return true;
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
  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';
  const segs = (): HTMLElement[] => query<HTMLElement>('.gs-tut-progress-seg');
  const barTitle = (): string =>
    first<HTMLElement>('.gs-tut-bar-title').lastChild?.textContent?.trim() ??
    '';
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
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
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
    http.expectOne(`${EXAMPLES_ROOT}/txt2img/meta.json`).flush(meta);
    await started;

    fixture = TestBed.createComponent(GenerateLearnSheetComponent);
    await settle();
  });

  it('updates the model title and flag when the example changes CLIP skip', async () => {
    const http = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance;
    const modelStep = flowSteps('txt2img').find(
      (step) => step.anchorId === 'model',
    )!;
    const sizeStep = flowSteps('txt2img').find((step) => step.id === 'size')!;
    engine.goTo(1);
    for (const [world, clipSkip] of [
      ['w2', 2],
      ['w1', 1],
    ] as const) {
      engine.setWorld(world);
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const directory = world === 'w2' ? 'txt2img--w2' : 'txt2img';
      http.expectOne(`${EXAMPLES_ROOT}/${directory}/request.json`).flush({
        ...request,
        params: { ...request.params, clip_skip: clipSkip },
      });
      http.expectOne(`${EXAMPLES_ROOT}/${directory}/meta.json`).flush(meta);
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      expect(component.requiresClipSkip()).toBe(clipSkip !== 1);
      expect(component.titleKey(modelStep)).toBe(
        clipSkip === 2
          ? 'generate.learn.model_clip_skip_title'
          : 'generate.learn.flows.txt2img.steps.model.title',
      );
      expect(component.titleKey(sizeStep)).toBe(
        'generate.learn.flows.txt2img.steps.size.title',
      );
      expect(text().includes('Model + Clip Skip')).toBe(clipSkip !== 1);
    }
  });

  it('says on the model step what the live list says about that model', async () => {
    const modelStep = flowSteps('txt2img').findIndex(
      (step) => step.anchorId === 'model',
    );
    host.availability.set(engine.example()?.model ?? '', 'no_workers');

    engine.goTo(modelStep);
    await settle();

    expect(text()).toContain(TRANSLATIONS['generate.learn.model_no_workers']);
  });

  it('says the settings were set aside, on the first step only', async () => {
    expect(text()).toContain(TRANSLATIONS['generate.learn.set_aside_note']);

    engine.next();
    await settle();

    expect(text()).not.toContain(TRANSLATIONS['generate.learn.set_aside_note']);
  });

  it('docks as a bar of the flow: its name, the step, and progress on the edge', () => {
    expect(first<HTMLElement>('.gs-tut-bar-name').textContent?.trim()).toBe(
      TRANSLATIONS['generate.tutorials.flows.txt2img.task_name'],
    );
    expect(barTitle()).toBe(
      TRANSLATIONS['generate.learn.flows.txt2img.steps.prompt.title'],
    );
    // Which step of how many is on the bar in words a sighted reader can see,
    // not only in the strip along the edge and not only to a screen reader.
    expect(first<HTMLElement>('.gs-tut-bar-count').textContent?.trim()).toBe(
      TRANSLATIONS['generate.learn.sheet_progress']
        .replace('{{ current }}', '1')
        .replace('{{ total }}', String(engine.total())),
    );
    const bar = first<HTMLElement>('.gs-tut-progress');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe(
      String(flowSteps('txt2img').length),
    );
    expect(segs()).toHaveLength(flowSteps('txt2img').length);
    expect(segs()[0].classList).toContain('gs-tut-progress-seg--done');
    expect(segs()[1].classList).not.toContain('gs-tut-progress-seg--done');
    // Nothing else in the sheet counts the steps again.
    expect(query('.gs-tut-dot')).toHaveLength(0);
    expect(query('.gs-tut-body-head')).toHaveLength(0);
  });

  it('fills the progress line as the reader moves, and names each step once', async () => {
    engine.goTo(3);
    await settle();

    expect(engine.step()?.id).toBe('steps');
    expect(barTitle()).toBe(
      TRANSLATIONS['generate.learn.flows.txt2img.steps.steps.title'],
    );
    expect(
      segs().filter((seg) =>
        seg.classList.contains('gs-tut-progress-seg--done'),
      ),
    ).toHaveLength(4);
    // The card's own heading is for assistive technology; the bar shows the title.
    const heading = first<HTMLElement>('.gs-learn-sheet-card .gs-guide-head');
    expect(heading.classList).toContain('sr-only');
    expect(heading.textContent).toContain(
      TRANSLATIONS['generate.learn.flows.txt2img.steps.steps.title'],
    );
  });

  it('marks each segment with the panel area its step points at', () => {
    expect(segs()[0].classList).toContain('gs-sec--prompt');
    // The finale is about pressing Generate, which belongs to no card.
    expect(segs()[segs().length - 1].className).not.toContain('gs-sec--');
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

  it('asks for nothing in the bar on a step that writes nothing', async () => {
    // The finale writes nothing and has nowhere to go: what it asks for is a
    // press on Generate, which is in the panel and not in the sheet. Pointing
    // at that button is offered once, at the head of the step.
    engine.goTo(engine.total() - 1);
    await settle();

    expect(query('.gs-tut-bar-next')).toHaveLength(0);
    expect(query('.gs-tut-bar-btn')).toHaveLength(0);
    expect(query('.gs-learn-show')).toHaveLength(1);
    expect(first<HTMLElement>('.gs-learn-show').textContent?.trim()).toBe(
      TRANSLATIONS['generate.learn.show_me'],
    );
  });

  it('opens as a bar, so the step never covers the control it is about', async () => {
    await settle();

    expect(body().hidden).toBe(true);
    expect(first<HTMLElement>('app-gs-sheet').classList).not.toContain(
      'gs-sheet--open',
    );
    // The tutorial's name is on the bar only once the sheet is open: at the
    // bar the row belongs to the step.
    expect(first<HTMLElement>('.gs-tut-bar-name')?.textContent).toContain(
      TRANSLATIONS['generate.tutorials.flows.txt2img.task_name'],
    );
  });

  it('comes back to the bar on every step, at the top of the new step', async () => {
    first<HTMLButtonElement>('.gs-sheet-btn').click();
    await settle();
    expect(body().hidden).toBe(false);
    const scrolled: ScrollToOptions[] = [];
    body().scrollTo = ((options: ScrollToOptions) => {
      scrolled.push(options);
    }) as typeof body.prototype.scrollTo;

    engine.next();
    await settle();

    expect(body().hidden).toBe(true);
    expect(scrolled).toContainEqual({ top: 0, behavior: 'auto' });
  });

  it('moves a step on a swipe, in the direction the reader swiped', async () => {
    const bar = first<HTMLElement>('.gs-sheet-bar');
    const swipe = (dx: number): void => {
      const at = (x: number): PointerEvent =>
        new MouseEvent('pointerdown', {
          clientX: x,
          clientY: 400,
          bubbles: true,
        }) as unknown as PointerEvent;
      bar.dispatchEvent(at(200));
      for (const type of ['pointermove', 'pointerup']) {
        bar.dispatchEvent(
          new MouseEvent(type, {
            clientX: 200 + dx,
            clientY: 400,
            bubbles: true,
          }) as unknown as PointerEvent,
        );
      }
    };

    swipe(-80);
    await settle();
    expect(engine.stepIndex()).toBe(1);

    swipe(80);
    await settle();
    expect(engine.stepIndex()).toBe(0);

    // Too short to be meant: the step stays where it is.
    swipe(-20);
    await settle();
    expect(engine.stepIndex()).toBe(0);
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
    // Two stop buttons at half (up and down) and no close button among them.
    expect(query('.gs-sheet-btn')).toHaveLength(2);
    expect(
      query<HTMLButtonElement>('.gs-sheet-btn').some(
        (button) => button.getAttribute('aria-label') !== null,
      ),
    ).toBe(false);

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
    });

    it('docks as one read with a hint in the bar, and nothing to apply or point at', () => {
      expect(query('.gs-tut-bar-next')).toHaveLength(0);
      expect(first<HTMLElement>('.gs-tut-bar-title').textContent?.trim()).toBe(
        TRANSLATIONS['generate.learn.read_hint'],
      );
      expect(query('.gs-tut-progress')).toHaveLength(0);
      // A read has nothing to show behind it, so it asks for the whole screen.
      expect(first<HTMLElement>('app-gs-sheet').classList).toContain(
        'gs-sheet--full',
      );
      // And it can be left, like anything else.
      expect(query('.gs-tut-sheet-exit')).toHaveLength(1);
      expect(query('.gs-learn-read-sec')).toHaveLength(
        flowSteps('concepts_horde').length,
      );
      expect(query('.gs-learn-apply')).toHaveLength(0);
      expect(query('.gs-learn-show')).toHaveLength(0);
      // A track teaches an idea, and has no worked run behind it to show.
      expect(query('.gs-learn-shots')).toHaveLength(0);
    });

    it('ends at a door into the walkthrough rather than an ask to press Generate', async () => {
      expect(body().textContent).not.toContain(
        TRANSLATIONS['generate.learn.finale_hint'],
      );
      const doors = query<HTMLElement>('.gs-door--tutorial');
      expect(doors).toHaveLength(1);
      expect(doors[0].textContent).toContain(
        TRANSLATIONS[
          'generate.learn.flows.concepts_horde.steps.where_next.cta'
        ],
      );

      doors[0].click();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await new Promise((resolve) => setTimeout(resolve, 0));
      http
        .expectOne(`${EXAMPLES_ROOT}/txt2img/request.json`)
        .flush(structuredClone(request));
      http.expectOne(`${EXAMPLES_ROOT}/txt2img/meta.json`).flush(meta);
      await settle();

      expect(engine.step()?.id).toBe('prompt');
    });
  });

  describe('a sweep on a phone', () => {
    /** The evidence library, which every strip in the sheet reads from. */
    async function serveSweeps(): Promise<void> {
      const http = TestBed.inject(HttpTestingController);
      for (const request of http.match(
        `${environment.evidenceBaseUrl}/index.json`,
      )) {
        request.flush(structuredClone(stubIndex));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settle();
    }

    it('takes the offer to the full-screen layer, never to a strip in the sheet', async () => {
      // A track is the half of the sheet that used to open its strips inline.
      await engine.start('concepts_images');
      await settle();
      await serveSweeps();

      const card = first<HTMLElement>('.gs-sweep-card');
      expect(card).toBeTruthy();
      expect(query('.gs-plate')).toHaveLength(0);

      const door = card.querySelector<HTMLButtonElement>(
        '.gs-sweep-card-door',
      )!;
      door.focus();
      door.click();
      await settle();

      expect(query('.gs-sweep-dialog-body')).toHaveLength(1);
      // Nothing opens behind it: the plate is what has no room here.
      expect(query('.gs-plate')).toHaveLength(0);

      first<HTMLButtonElement>('.gs-sweep-dialog-x').click();
      await settle();

      expect(query('.gs-sweep-dialog-body')).toHaveLength(0);
      expect(document.activeElement).toBe(door);
    });
  });

  describe('the example behind the walkthrough', () => {
    const stage = (): HTMLButtonElement =>
      first<HTMLButtonElement>('.gs-learn-shot-stage');
    const stageImage = (): HTMLImageElement =>
      first<HTMLImageElement>('.gs-learn-shot-img');
    const barShot = (): HTMLButtonElement =>
      first<HTMLButtonElement>('.gs-tut-bar-shot');
    /** The file lands; jsdom fetches nothing, so the event is what says so. */
    async function pictureArrives(): Promise<void> {
      for (const image of query<HTMLImageElement>(
        '.gs-learn-shot-img, .gs-tut-bar-shot-img',
      )) {
        image.dispatchEvent(new Event('load'));
      }
      await settle();
    }
    async function pictureFails(): Promise<void> {
      for (const image of query<HTMLImageElement>(
        '.gs-learn-shot-img, .gs-tut-bar-shot-img',
      )) {
        image.dispatchEvent(new Event('error'));
      }
      await settle();
    }

    it('keeps what the run produced with the step, on a stage of its own', async () => {
      expect(query('.gs-learn-shot')).toHaveLength(1);
      expect(first<HTMLElement>('.gs-learn-shot-cap').textContent?.trim()).toBe(
        TRANSLATIONS['generate.tutorials.example_result'],
      );
      expect(stage().getAttribute('aria-label')).toBe(
        TRANSLATIONS['generate.tutorials.example_result_enlarge'],
      );
      // The box is held at the shape the example was made at, so nothing under
      // it moves when the file lands.
      const example = engine.example()!;
      expect(stage().style.aspectRatio).toBe(
        `${example.width} / ${example.height}`,
      );
      // Never lazy: the body is display:none at the bar, and a lazy picture
      // there is one that is never asked for.
      expect(stageImage().getAttribute('loading')).toBeNull();
      // Nothing offers to enlarge a stage that has nothing in it yet.
      expect(stage().disabled).toBe(true);
      expect(barShot().hidden).toBe(true);

      await pictureArrives();

      expect(stage().disabled).toBe(false);
      expect(barShot().hidden).toBe(false);
      expect(stageImage().classList).toContain('gs-learn-shot-img--here');
    });

    it('says so when the picture will not load, and asks for it again', async () => {
      await pictureFails();

      const gone = first<HTMLElement>('.gs-learn-shot-gone');
      expect(gone.textContent).toContain(
        TRANSLATIONS['generate.learn.picture_failed'],
      );
      expect(stage().disabled).toBe(true);
      expect(barShot().hidden).toBe(true);
      expect(query('.gs-learn-shot-cap')).toHaveLength(0);

      const before = stageImage().getAttribute('src');
      first<HTMLButtonElement>('.gs-learn-shot-again').click();
      await settle();

      // The same file at an address the browser has not already failed on.
      expect(query('.gs-learn-shot-gone')).toHaveLength(0);
      expect(stageImage().getAttribute('src')).not.toBe(before);
      expect(stageImage().getAttribute('src')).toContain(
        '/txt2img/result.webp',
      );
    });

    it('says what the run cost on the step that asks for the button', async () => {
      expect(query('.gs-learn-shot-cost')).toHaveLength(0);

      engine.goTo(engine.total() - 1);
      await settle();

      expect(first<HTMLElement>('.gs-learn-shot-cost').textContent).toContain(
        '12.5',
      );
    });

    it('shows the picture whole, with what the run cost, and hands focus back', async () => {
      await pictureArrives();
      stage().click();
      await settle();

      expect(query('app-gs-shot-viewer')).toHaveLength(1);
      expect(first<HTMLImageElement>('.gs-tut-viewer-img').src).toContain(
        '/txt2img/result.webp',
      );
      expect(first<HTMLElement>('.gs-tut-viewer-cost').textContent).toContain(
        '12.5',
      );

      first<HTMLButtonElement>('.gs-tut-viewer-x').click();
      await settle();

      expect(query('app-gs-shot-viewer')).toHaveLength(0);
      expect(document.activeElement).toBe(stage());
    });

    it('hands focus back to the bar picture when the bar opened the view', async () => {
      await pictureArrives();
      barShot().click();
      await settle();

      expect(query('app-gs-shot-viewer')).toHaveLength(1);

      first<HTMLButtonElement>('.gs-tut-viewer-x').click();
      await settle();

      expect(document.activeElement).toBe(barShot());
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
    expect(
      first<HTMLElement>('.gs-tut-progress').getAttribute('aria-label'),
    ).toBe(TRANSLATIONS['generate.learn.steps_label']);
    // The way out sits beside Back, at the foot, and is never one of the bar's actions.
    expect(query('.gs-tut-sheet-nav .gs-tut-sheet-exit')).toHaveLength(1);
    expect(query('.gs-tut-bar .gs-tut-sheet-exit')).toHaveLength(0);
    expect(TRANSLATIONS['generate.learn.sheet_exit']).toBeTruthy();
  });

  it('offers a retry and the written steps when the example will not load', async () => {
    const http = TestBed.inject(HttpTestingController);
    engine.retryExample();
    http
      .expectOne(`${EXAMPLES_ROOT}/manifest.json`)
      .error(new ProgressEvent('error'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(text()).toContain(TRANSLATIONS['generate.learn.load_error']);
    const retry = query<HTMLButtonElement>('.gs-learn-actions button')[0];
    const read = query<HTMLAnchorElement>('.gs-learn-actions a')[0];
    expect(retry.textContent?.trim()).toBe(
      TRANSLATIONS['generate.learn.load_retry'],
    );
    expect(read.textContent?.trim()).toBe(
      TRANSLATIONS['generate.learn.load_read_steps'],
    );
    expect(read.getAttribute('href')).toBe(docsExampleLink('txt2img'));

    // The lesson comes back once the fetch does, rather than needing the
    // tutorial to be started again.
    retry.click();
    http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne(`${EXAMPLES_ROOT}/txt2img/request.json`)
      .flush(structuredClone(request));
    http.expectOne(`${EXAMPLES_ROOT}/txt2img/meta.json`).flush(meta);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(text()).not.toContain(TRANSLATIONS['generate.learn.load_error']);
  });
});
