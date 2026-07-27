import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlossaryModalComponent } from './glossary-modal.component';
import {
  GlossaryService,
  PageGlossaryEntry,
} from '../../services/glossary.service';
import en from '../../../assets/i18n/en.json';

describe('GlossaryModalComponent', () => {
  let fixture: ComponentFixture<GlossaryModalComponent>;
  let glossary: GlossaryService;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  /** Open the modal on a page context made of the given entries. */
  function open(entries: PageGlossaryEntry[]): void {
    glossary.registerPageContext({
      pageId: 'studio',
      pageTitleKey: 'help.glossary.page.generate_image',
      relevantTermIds: [],
      entries,
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
});
