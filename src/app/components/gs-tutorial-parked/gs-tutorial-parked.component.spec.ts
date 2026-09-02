import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsTutorialParkedComponent } from './gs-tutorial-parked.component';
import { TutorialEngineService } from '../../services/tutorial-engine.service';
import en from '../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

/** The engine's own key, written directly so the strip meets a real reload. */
const SESSION_KEY = 'aihorde.generate.learn.session';

describe('GsTutorialParkedComponent', () => {
  let fixture: ComponentFixture<GsTutorialParkedComponent>;
  let engine: TutorialEngineService;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /**
   * Build the strip over whatever is in storage. Separate from the setup so a
   * test can write down a left tutorial first, which is what the engine reads
   * once, when it is built.
   */
  async function mount(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [
        GsTutorialParkedComponent,
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
    fixture = TestBed.createComponent(GsTutorialParkedComponent);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    await mount();
  });

  it('renders nothing while no tutorial is parked', () => {
    expect(el().querySelector('.gs-parked')).toBeNull();
  });

  it('names the parked tutorial and its step, and returns to it', () => {
    // A concept track needs no example fetch, so it is parked synchronously.
    void engine.start('concepts_images');
    engine.goTo(1);
    engine.pause();
    fixture.detectChanges();

    const strip = el().querySelector('.gs-parked');
    expect(strip?.textContent).toContain(
      translations['generate.learn.flows.concepts_images.task_name'],
    );
    expect(strip?.textContent).toContain('Step 2 of');

    el().querySelector<HTMLButtonElement>('.gs-parked-return')!.click();
    fixture.detectChanges();

    expect(engine.active()).toBe(true);
    expect(engine.stepIndex()).toBe(1);
    expect(el().querySelector('.gs-parked')).toBeNull();
  });

  describe('a tutorial left before a reload', () => {
    /** Write down a left tutorial, then build the strip that reads it. */
    async function remount(index: number): Promise<void> {
      localStorage.clear();
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          flowId: 'txt2img',
          index,
          world: 'w1',
          savedAt: Date.now(),
        }),
      );
      TestBed.resetTestingModule();
      await mount();
    }

    it('says where the reader was and names the tutorial', async () => {
      await remount(2);

      const strip = el().querySelector('.gs-parked');
      expect(strip?.textContent).toContain('You were on step 3 of');
      expect(strip?.textContent).toContain(
        translations['generate.tutorials.flows.txt2img.task_name'],
      );
      expect(
        el().querySelector<HTMLButtonElement>('.gs-parked-return')?.textContent,
      ).toContain(translations['generate.learn.resume_continue']);
    });

    it('drops the offer when the reader leaves the tutorial', async () => {
      await remount(1);

      el().querySelector<HTMLButtonElement>('.gs-parked-end')!.click();
      fixture.detectChanges();

      expect(engine.resumeOffered()).toBe(false);
      expect(el().querySelector('.gs-parked')).toBeNull();
    });
  });

  it('ends the parked tutorial from its own control', () => {
    void engine.start('concepts_images');
    engine.pause();
    fixture.detectChanges();

    el().querySelector<HTMLButtonElement>('.gs-parked-end')!.click();
    fixture.detectChanges();

    expect(engine.parked()).toBe(false);
    expect(engine.active()).toBe(false);
    expect(el().querySelector('.gs-parked')).toBeNull();
  });
});
