import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('emits closed from the back-to-results button', () => {
    const closed = vi.fn();
    component.closed.subscribe(closed);

    query<HTMLButtonElement>('.gs-guide-close')[0].click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
