import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsImageGuideComponent } from './image-guide.component';
import { hasReference } from '../../../content/settings';
import en from '../../../../assets/i18n/en.json';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { StickyRegistryService } from '../../../services/sticky-registry.service';

describe('DocsImageGuideComponent', () => {
  let fixture: ComponentFixture<DocsImageGuideComponent>;
  let component: DocsImageGuideComponent;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DocsImageGuideComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DocsImageGuideComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('indexes the walkthrough and every section, each aimed at its anchor', () => {
    const lines = query<HTMLButtonElement>('.gs-index-entry');

    expect(lines).toHaveLength(component.sections.length + 1);
    expect(component.railEntries.map((entry) => entry.targetId)).toEqual(
      ['walkthrough', ...component.sections.map((section) => section.id)].map(
        (id) => component.sectionId(id),
      ),
    );
    for (const entry of component.railEntries) {
      expect(query(`#${entry.targetId}`)).toHaveLength(1);
    }
  });

  it('renders the walkthrough steps in order, numbered', () => {
    const steps = query<HTMLElement>('.gs-guide-step');

    expect(steps).toHaveLength(component.steps.length);
    expect(
      steps.map((step) => step.querySelector('.gs-guide-step-n')?.textContent),
    ).toEqual(component.steps.map((_, index) => String(index + 1)));
  });

  it('draws the walkthrough as an ordered list of cards', () => {
    const list = query<HTMLElement>('.gs-guide-steps');
    const steps = query<HTMLElement>('.gs-guide-step');

    expect(list).toHaveLength(1);
    expect(list[0].tagName).toBe('OL');
    // A step is a card in its own right rather than a row of a spine, so the
    // ordered list has to be the list itself rather than a wrapper around one.
    for (const step of steps) {
      expect(step.tagName).toBe('LI');
      expect(step.parentElement).toBe(list[0]);
    }
  });

  it('gives a step the mark and hue of the panel area it is about', () => {
    const steps = query<HTMLElement>('.gs-guide-step');
    const marked = steps.filter((step) =>
      Array.from(step.classList).some((name) => name.startsWith('gs-sec--')),
    );

    // Every step but the one about reading the results pane, which is about the
    // page rather than about a card of the panel and so takes no area.
    expect(marked).toHaveLength(component.steps.length - 1);
    for (const step of marked) {
      expect(step.querySelector('.gs-learn-eyebrow .gs-sec-chip')).toBeTruthy();
    }
  });

  it('keeps the headings in order: page, half, step', () => {
    const levels = query<HTMLElement>('h1, h2, h3').map((head) =>
      Number(head.tagName.slice(1)),
    );

    expect(levels[0]).toBe(1);
    for (const [index, level] of levels.entries()) {
      expect(level - (levels[index - 1] ?? level)).toBeLessThanOrEqual(1);
    }
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

  it('asks every strip on the page for the compact card', () => {
    // The guide stacks a strip under most of its steps and most of its terms.
    // At full size that is a page of near-identical cards, which is the state
    // the compact register exists to answer.
    const strips = fixture.debugElement.queryAll(
      By.directive(GsSweepScrubComponent),
    );

    expect(strips.length).toBeGreaterThan(1);
    for (const strip of strips) {
      expect(strip.componentInstance.register()).toBe('filmcard');
    }
  });

  it('hands off to the studio through a door rather than a link', () => {
    const door = query<HTMLButtonElement>('.gs-guide-practice')[0];

    // A press that leaves carries the arrow and the panel's own peek; only
    // evidence that opens where it stands carries the chevron.
    expect(door.querySelector('.gs-door-arrow')).not.toBeNull();
    expect(door.querySelector('.gs-door-panel')).not.toBeNull();
    expect(door.querySelector('.gs-cap-go')).toBeNull();
    expect(door.querySelector('.gs-cap-meta')?.textContent?.trim()).toBe(
      (en as Record<string, string>)['generate.sweeps.studio_door_note'],
    );
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

  it('groups the reference notes by panel area, each under its own mark', () => {
    const groups = query<HTMLElement>('.gs-guide-area');

    expect(groups).toHaveLength(component.sections.length);
    component.sections.forEach((section, index) => {
      const identity = component.identityFor(section.id);

      expect(identity).toBeTruthy();
      expect(groups[index].id).toBe(component.sectionId(section.id));
      expect(groups[index].classList).toContain(identity?.className);
      expect(
        groups[index].querySelector('.gs-guide-area-head .gs-sec-chip'),
      ).toBeTruthy();
      expect(groups[index].querySelectorAll('.gs-guide-term-row')).toHaveLength(
        section.topics.length,
      );
    });
  });

  it('links a note to the setting page only where the book has one', () => {
    const topics = component.sections.flatMap((section) => section.topics);
    const linked = query<HTMLAnchorElement>('.gs-guide-term-link');

    // Every topic the guide lists has a page today, so the list of links is the
    // list of topics; the guard is what keeps a topic added without one from
    // becoming a link into nothing.
    expect(topics.every(hasReference)).toBe(true);
    expect(linked.map((link) => link.getAttribute('href'))).toEqual(
      topics.filter(hasReference).map((topic) => component.settingLink(topic)),
    );
    for (const link of linked) {
      expect(link.textContent?.trim()).toBeTruthy();
    }
  });

  it('scrolls the pane to a section when its rail entry is pressed', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    query<HTMLButtonElement>('.gs-index-entry')[1].click();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('offers the way into the Learn tutorials with the intro', () => {
    const translations = en as Record<string, string>;
    const link = query<HTMLAnchorElement>('.gs-guide-cta')[0];
    const firstSection = query<HTMLElement>('.gs-guide-sec')[0];

    expect(link.getAttribute('href')).toBe('/docs/image');
    expect(link.textContent).toContain(
      translations['generate.guide.tutorials_link'],
    );
    expect(query<HTMLElement>('.gs-guide-note')[0].textContent).toContain(
      translations['generate.guide.tutorials_note'],
    );
    // Above the reference, not a page's worth of scrolling below it.
    expect(
      link.compareDocumentPosition(firstSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('offers practice only on the sections a worked example exercises', () => {
    const translations = en as Record<string, string>;
    const cards = query<HTMLElement>('.gs-guide-area');
    const withPractice = component.sections.filter(
      (section) => section.practiceFlow,
    );

    expect(withPractice.map((section) => section.id)).toEqual(['sampling']);
    expect(query('.gs-guide-practice')).toHaveLength(withPractice.length);
    component.sections.forEach((section, index) => {
      expect(
        cards[index].querySelector('.gs-guide-practice') !== null,
        `practice on ${section.id}`,
      ).toBe(Boolean(section.practiceFlow));
    });
    expect(translations['generate.guide.practice_link']).toBeTruthy();
  });

  it('arms the section example and goes to the studio', () => {
    const engine = TestBed.inject(TutorialEngineService);
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);

    query<HTMLButtonElement>('.gs-guide-practice')[0].click();

    expect(navigate).toHaveBeenCalledWith('/generate/image');
    // Held in memory rather than routed, as every other handoff is.
    expect(engine.consumeArmed()).toBe('txt2img');
  });

  describe('find on this page', () => {
    const translations = en as Record<string, string>;
    const type = (text: string): void => {
      const field = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLInputElement>('.gs-find-input')!;
      field.value = text;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    it('marks the matched run of a title it kept', () => {
      type('describe');
      const marks = query<HTMLElement>('.gs-guide-step-title .gs-find-mark');

      expect(marks.length).toBeGreaterThan(0);
      expect(marks[0].tagName).toBe('MARK');
      expect(marks[0].textContent).toBe('Describe');
      // The rest of the title is still there, unmarked.
      expect(query<HTMLElement>('.gs-guide-step-title')[0].textContent).toBe(
        translations['generate.guide.steps.prompt.title'],
      );
    });

    it('keeps a step its own number rather than renumbering what is left', () => {
      type('describe');
      const steps = query<HTMLElement>('.gs-guide-step');

      expect(steps).toHaveLength(1);
      expect(steps[0].querySelector('.gs-guide-step-n')?.textContent).toBe('1');
    });

    it('drops the sections that do not carry the word', () => {
      type('facefixer');
      const heads = query<HTMLElement>('.gs-guide-area-head');

      expect(query('.gs-guide-step')).toHaveLength(0);
      expect(heads.map((head) => head.textContent?.trim())).toEqual([
        translations['generate.form.post_processing_section'],
      ]);
    });

    it('finds a section by its own name', () => {
      type('sampling');
      const marks = query<HTMLElement>('.gs-guide-area-head .gs-find-mark');

      expect(marks.map((mark) => mark.textContent)).toContain('Sampling');
    });

    it('says so when nothing on the page carries the word', () => {
      type('zzzz');

      expect(query('.gs-guide-sec')).toHaveLength(0);
      expect(query('.gs-guide-area')).toHaveLength(0);
      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('.gs-find-empty')
          ?.textContent?.trim(),
      ).toBe(translations['docs.find.empty'].replace('{{ query }}', 'zzzz'));
    });

    it('puts the whole guide back when the field is emptied', () => {
      type('zzzz');
      type('');

      expect(query('.gs-guide-step')).toHaveLength(component.steps.length);
      expect(query('.gs-guide-area')).toHaveLength(component.sections.length);
    });
  });

  it('keeps its head on screen by way of the sticky registry', () => {
    // The title and the find field pin under whatever the shell already pins,
    // and the registry is what knows how much that is, so the page hands it its
    // head rather than naming a height of its own.
    const registry = TestBed.inject(StickyRegistryService);
    const register = vi.spyOn(registry, 'register');

    const pinned = TestBed.createComponent(DocsImageGuideComponent);
    pinned.detectChanges();

    const head = (pinned.nativeElement as HTMLElement).querySelector(
      '.gs-guide-top',
    );
    expect(head).not.toBeNull();
    expect(register).toHaveBeenCalledWith(head, 20);
    // The find field is part of that head rather than a row below it.
    expect(head?.querySelector('.gs-find')).not.toBeNull();
  });

  it('reads as a page of its own rather than a pane of the studio', () => {
    const translations = en as Record<string, string>;

    expect(query('h1.gs-guide-title')[0].textContent).toContain(
      translations['generate.guide.title'],
    );
    // Nothing to close: leaving is the subnav's job now.
    expect(query('.gs-guide-close')).toHaveLength(0);
    expect(
      (fixture.nativeElement as HTMLElement).classList.contains(
        'gs-results-body',
      ),
    ).toBe(false);
  });
});
