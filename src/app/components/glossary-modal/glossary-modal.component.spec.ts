import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlossaryModalComponent } from './glossary-modal.component';
import {
  GlossaryService,
  PageGlossaryEntry,
} from '../../services/glossary.service';
import { STUDIO_CONTROLS } from '../../content/studio-controls';
import en from '../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

describe('GlossaryModalComponent', () => {
  let fixture: ComponentFixture<GlossaryModalComponent>;
  let glossary: GlossaryService;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  /** Open the modal on a page context made of the given entries. */
  function open(
    entries: PageGlossaryEntry[],
    controls?: PageGlossaryEntry[],
  ): void {
    glossary.registerPageContext({
      pageId: 'studio',
      pageTitleKey: 'help.glossary.page.generate_image',
      relevantTermIds: [],
      entries,
      controls,
    });
    glossary.open();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        GlossaryModalComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    glossary = TestBed.inject(GlossaryService);
    fixture = TestBed.createComponent(GlossaryModalComponent);
    fixture.detectChanges();
  });

  it('reads an entry the page gave no action to, exactly as before', () => {
    open([
      {
        id: 'sampling',
        titleKey: 'generate.sections.sampling',
        descriptionKey: 'generate.reference.section_hint.sampling',
      },
    ]);

    const entry = find('#glossary-entry-sampling');
    expect(entry?.tagName).toBe('DIV');
    expect(entry?.querySelector('h4')?.textContent?.trim()).toBe(
      (en as Record<string, string>)['generate.sections.sampling'],
    );
    expect(all('.glossary-page-entry-action')).toHaveLength(0);
  });

  it('makes an entry the page can act on a button, and does what it says', () => {
    const action = vi.fn();
    open([
      {
        id: 'sampling',
        titleKey: 'generate.sections.sampling',
        descriptionKey: 'generate.reference.section_hint.sampling',
        action,
      },
    ]);

    const button = find<HTMLButtonElement>('#glossary-entry-sampling');
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.classList).toContain('glossary-page-entry-action');

    button?.click();
    fixture.detectChanges();

    // The page is where the action happens, so the dialog leaves first.
    expect(action).toHaveBeenCalledOnce();
    expect(glossary.isOpen()).toBe(false);
    expect(find('#glossary-entry-sampling')).toBeNull();
  });

  it('carries the entry mark and its hue on both kinds of entry', () => {
    open([
      {
        id: 'horde',
        titleKey: 'generate.sections.horde',
        descriptionKey: 'generate.reference.section_hint.horde',
        iconName: 'sec-horde',
        iconColorClass: 'glossary-sec--horde',
        action: vi.fn(),
      },
    ]);

    const icon = find('#glossary-entry-horde app-icon');
    expect(icon?.classList).toContain('glossary-page-entry-icon');
    expect(icon?.classList).toContain('glossary-sec--horde');
  });

  describe('the unlabelled buttons and marks a page declares', () => {
    const area: PageGlossaryEntry = {
      id: 'sampling',
      titleKey: 'generate.sections.sampling',
      descriptionKey: 'generate.reference.section_hint.sampling',
    };
    const controls: PageGlossaryEntry[] = STUDIO_CONTROLS.map((control) => ({
      id: control.id,
      titleKey: control.labelKey,
      descriptionKey: control.bodyKey,
      iconName: control.icon,
    }));

    it('reads them before the areas, under a heading of their own', () => {
      open([area], controls);

      const section = find('.glossary-controls-section');
      expect(section).not.toBeNull();
      expect(section?.querySelector('h3')?.textContent?.trim()).toBe(
        translations['help.glossary.controls_heading'],
      );
      expect(all('.glossary-control-entry').length).toBe(controls.length);

      // Before the areas: the panel's glyphs are the first thing asked about.
      const first = all('.glossary-page-entry')[0];
      expect(first?.classList).toContain('glossary-control-entry');
    });

    it('shows each glyph beside its name and its sentence', () => {
      open([area], controls);

      const entry = find('#glossary-entry-reset');
      expect(
        entry?.querySelector('.glossary-control-glyph app-icon'),
      ).not.toBeNull();
      expect(
        entry?.querySelector('.glossary-page-entry-title')?.textContent?.trim(),
      ).toBe(translations['help.glossary.controls.reset.title']);
      expect(
        entry?.querySelector('.glossary-page-entry-desc')?.textContent?.trim(),
      ).toBe(translations['help.glossary.controls.reset.body']);
    });

    it('leaves the section out for a page that declares none', () => {
      open([area]);

      expect(find('.glossary-controls-section')).toBeNull();
    });
  });

  describe('the this-page filter', () => {
    const ENTRIES: PageGlossaryEntry[] = [
      {
        id: 'sampling',
        titleKey: 'help.glossary.page.generate_image',
        descriptionKey: 'help.glossary.controls_note',
      },
      {
        id: 'seed',
        titleKey: 'help.glossary.related_terms',
        descriptionKey: 'help.glossary.no_results',
      },
    ];

    function typeFilter(text: string): void {
      const input = find<HTMLInputElement>(
        '[role="tabpanel"] .glossary-search input',
      );
      if (input) {
        input.value = text;
        input.dispatchEvent(new Event('input'));
      }
      fixture.detectChanges();
    }

    it('narrows the page entries and the controls beside them', () => {
      const control = STUDIO_CONTROLS[0];
      open(ENTRIES, [
        {
          id: control.id,
          titleKey: control.labelKey,
          descriptionKey: control.bodyKey,
          iconName: control.icon,
        },
      ]);
      expect(all('.glossary-page-entry')).toHaveLength(3);

      typeFilter('seed');

      const ids = all('.glossary-page-entry').map((entry) => entry.id);
      expect(ids).toEqual(['glossary-entry-seed']);
    });

    it('says so when the page holds nothing matching', () => {
      open(ENTRIES);
      typeFilter('nothing here matches this');

      expect(all('.glossary-page-entry')).toHaveLength(0);
      expect(el().textContent).toContain(
        translations['help.glossary.page_no_results'],
      );
    });

    it('is cleared when the modal closes', () => {
      open(ENTRIES);
      typeFilter('seed');
      expect(fixture.componentInstance.pageQuery()).toBe('seed');

      glossary.close();
      fixture.detectChanges();

      expect(fixture.componentInstance.pageQuery()).toBe('');
    });
  });

  describe('where the reader stands when it opens', () => {
    const ENTRIES: PageGlossaryEntry[] = [
      {
        id: 'sampling',
        titleKey: 'generate.sections.sampling',
        descriptionKey: 'generate.reference.section_hint.sampling',
      },
    ];

    /** Open, and let the dialog's own hand-over run. */
    function openAndSettle(): void {
      vi.useFakeTimers();
      try {
        open(ENTRIES);
        vi.advanceTimersByTime(200);
      } finally {
        vi.useRealTimers();
      }
      fixture.detectChanges();
    }

    it('takes the filter field of the tab it opens on', () => {
      openAndSettle();

      // A page with a context of its own opens on that tab, which is the tab
      // that used to hand the reader nowhere.
      expect(glossary.activeTab()).toBe('this-page');
      expect(document.activeElement).toBe(find('.glossary-search input'));
    });

    it('closes on Escape from that tab', () => {
      openAndSettle();

      find('.glossary-search input')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();

      expect(glossary.isOpen()).toBe(false);
    });
  });

  describe('the Tab key inside it', () => {
    const ENTRIES: PageGlossaryEntry[] = [
      {
        id: 'sampling',
        titleKey: 'help.glossary.page.generate_image',
        descriptionKey: 'help.glossary.controls_note',
      },
    ];

    const FOCUSABLE =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function tab(from: HTMLElement, shiftKey: boolean): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      from.dispatchEvent(event);
      return event;
    }

    it('comes back to the first control from the last one', () => {
      open(ENTRIES);
      const focusable = all<HTMLElement>(FOCUSABLE);
      const last = focusable[focusable.length - 1];
      last.focus();

      const event = tab(last, false);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(focusable[0]);
    });

    it('goes back to the last control from the first one', () => {
      open(ENTRIES);
      const focusable = all<HTMLElement>(FOCUSABLE);
      focusable[0].focus();

      const event = tab(focusable[0], true);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    });

    it('leaves a Tab between two controls alone', () => {
      open(ENTRIES);
      const focusable = all<HTMLElement>(FOCUSABLE);
      focusable[1].focus();

      const event = tab(focusable[1], false);

      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(focusable[1]);
    });
  });

  describe('the page behind it', () => {
    const ENTRIES: PageGlossaryEntry[] = [
      {
        id: 'sampling',
        titleKey: 'help.glossary.page.generate_image',
        descriptionKey: 'help.glossary.controls_note',
      },
    ];

    /** A page for the glossary to cover, standing where the app's own does. */
    function pageBehind(): HTMLElement {
      const page = document.createElement('div');
      page.innerHTML = '<button type="button">open the glossary</button>';
      el().parentElement?.insertBefore(page, el());
      return page;
    }

    it('is switched off while the glossary is over it', () => {
      const page = pageBehind();
      expect(page.hasAttribute('inert')).toBe(false);

      open(ENTRIES);
      expect(page.hasAttribute('inert')).toBe(true);

      glossary.close();
      fixture.detectChanges();

      expect(page.hasAttribute('inert')).toBe(false);
    });

    it('has the reader back on the control that opened the glossary', () => {
      const page = pageBehind();
      const trigger = page.querySelector('button') as HTMLButtonElement;
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      open(ENTRIES);
      (find('.modal-close') as HTMLButtonElement).focus();
      expect(document.activeElement).not.toBe(trigger);

      glossary.close();
      fixture.detectChanges();

      expect(document.activeElement).toBe(trigger);
    });
  });
});
