import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateGuideComponent } from './generate-guide.component';
import en from '../../../../assets/i18n/en.json';

describe('GenerateGuideComponent', () => {
  let fixture: ComponentFixture<GenerateGuideComponent>;
  let component: GenerateGuideComponent;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GenerateGuideComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateGuideComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('offers a contents chip for the walkthrough and every section', () => {
    expect(query('.gs-guide-toc-chip')).toHaveLength(
      component.sections.length + 1,
    );
  });

  it('renders the walkthrough steps in order, numbered', () => {
    const steps = query<HTMLElement>('.gs-guide-step');

    expect(steps).toHaveLength(component.steps.length);
    expect(
      steps.map((step) => step.querySelector('.gs-guide-step-n')?.textContent),
    ).toEqual(component.steps.map((_, index) => String(index + 1)));
  });

  it('carries each walkthrough step its own copy and its own strips', () => {
    const translations = en as Record<string, string>;
    const steps = query<HTMLElement>('.gs-guide-step');

    component.steps.forEach((step, index) => {
      expect(
        translations[`generate.guide.steps.${step.id}.title`],
      ).toBeTruthy();
      expect(translations[`generate.guide.steps.${step.id}.body`]).toBeTruthy();
      expect(steps[index].querySelectorAll('app-gs-sweep-scrub')).toHaveLength(
        step.sweeps.length,
      );
    });

    // Prompt and size carry no `?` glyph, so the reference half below has no
    // entry for them and the walkthrough is where their pictures live.
    expect(component.steps.flatMap((step) => step.sweeps)).toEqual([
      'prompt_emphasis',
      'negative_prompt',
      'resolution',
    ]);
  });

  it('reuses the panel help topics without repeating one', () => {
    const topics = component.sections.flatMap((section) => section.topics);

    expect(new Set(topics).size).toBe(topics.length);
    expect(query('.gs-guide-term')).toHaveLength(topics.length);
  });

  it('renders each topic from its existing help translations', () => {
    const translations = en as Record<string, string>;
    const topics = component.sections.flatMap((section) => section.topics);
    const terms = query<HTMLElement>('.gs-guide-term').map((el) =>
      el.textContent?.trim(),
    );

    for (const topic of topics) {
      expect(translations[`generate.help.${topic}.title`]).toBeTruthy();
      expect(translations[`generate.help.${topic}.body`]).toBeTruthy();
      expect(terms).toContain(translations[`generate.help.${topic}.title`]);
    }
  });

  it('names every section with the label the control panel uses', () => {
    const translations = en as Record<string, string>;

    for (const section of component.sections) {
      expect(translations[section.labelKey]).toBeTruthy();
    }
  });

  it('scrolls the pane to a section when its chip is pressed', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    query<HTMLButtonElement>('.gs-guide-toc-chip')[1].click();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('offers the way into the Learn tutorials with the intro', () => {
    const translations = en as Record<string, string>;
    const link = query<HTMLAnchorElement>('.gs-guide-cta')[0];
    const firstSection = query<HTMLElement>('.gs-guide-card')[0];

    expect(link.getAttribute('href')).toBe('/generate/tutorials');
    expect(link.textContent).toContain(
      translations['generate.guide.tutorials_link'],
    );
    expect(query<HTMLElement>('.gs-guide-note')[0].textContent).toContain(
      translations['generate.guide.tutorials_note'],
    );
    // Above the reference, not a pane's worth of scrolling below it.
    expect(
      link.compareDocumentPosition(firstSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('emits closed from the back-to-results button', () => {
    const closed = vi.fn();
    component.closed.subscribe(closed);

    query<HTMLButtonElement>('.gs-guide-close')[0].click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
