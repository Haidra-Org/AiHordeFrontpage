import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from './gs-index-rail.component';
import en from '../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

/** Records made by the stub, so a test can say what came into view. */
interface StubRecord {
  target: { id: string };
  isIntersecting: boolean;
}

type SpyCallback = (records: StubRecord[]) => void;

/** jsdom has no IntersectionObserver; this one lets a test drive the scroll. */
class FakeIntersectionObserver {
  public static last: FakeIntersectionObserver | null = null;

  public readonly observed: Element[] = [];
  public disconnected = false;

  constructor(private readonly callback: SpyCallback) {
    FakeIntersectionObserver.last = this;
  }

  public observe(element: Element): void {
    this.observed.push(element);
  }

  public unobserve(element: Element): void {
    const at = this.observed.indexOf(element);
    if (at !== -1) {
      this.observed.splice(at, 1);
    }
  }

  public disconnect(): void {
    this.disconnected = true;
  }

  /** Report what is on screen, as the real observer would on a scroll. */
  public emit(records: StubRecord[]): void {
    this.callback(records);
  }
}

const ENTRIES: readonly GsIndexRailEntry[] = [
  {
    id: 'sampling',
    labelKey: 'generate.form.sampling_section',
    icon: 'sec-sampling',
    hueClass: 'gs-sec--sampling',
    targetId: 'spec-target-sampling',
  },
  {
    id: 'horde',
    labelKey: 'generate.form.horde_section',
    icon: 'sec-horde',
    hueClass: 'gs-sec--horde',
    targetId: 'spec-target-horde',
  },
];

@Component({
  imports: [GsIndexRailComponent],
  template: `
    <app-gs-index-rail
      [entries]="entries()"
      [labelKey]="labelKey()"
      [barForm]="barForm()"
    />
    @for (entry of entries(); track entry.id) {
      <section [id]="entry.targetId"></section>
    }
  `,
})
class HostComponent {
  public readonly entries = signal<readonly GsIndexRailEntry[]>(ENTRIES);
  public readonly labelKey = signal('generate.learn.settings_rail_label');
  public readonly barForm = signal(false);
}

describe('GsIndexRailComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const entries = (): HTMLButtonElement[] =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.gs-index-entry'));
  const observer = (): FakeIntersectionObserver => {
    const instance = FakeIntersectionObserver.last;
    if (!instance) {
      throw new Error('the rail never observed anything');
    }
    return instance;
  };

  beforeEach(async () => {
    FakeIntersectionObserver.last = null;
    // jsdom lays nothing out and so implements no scrolling.
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;

    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('offers one line per entry, named and marked and hued from the entry', () => {
    const lines = entries();

    expect(lines).toHaveLength(ENTRIES.length);
    expect(lines.map((line) => line.textContent?.trim())).toEqual([
      translations['generate.form.sampling_section'],
      translations['generate.form.horde_section'],
    ]);
    expect(lines[0].classList).toContain('gs-sec--sampling');
    expect(
      lines[0].querySelector('app-icon.gs-index-entry-mark'),
    ).not.toBeNull();
  });

  it('is a landmark the caller names', () => {
    expect(el().querySelector('nav')?.getAttribute('aria-label')).toBe(
      translations['generate.learn.settings_rail_label'],
    );
  });

  it('scrolls to the entry that was pressed', () => {
    const target = document.getElementById('spec-target-horde');
    const scrollIntoView = vi.fn();
    (target as HTMLElement).scrollIntoView = scrollIntoView;

    entries()[1].click();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('marks the first entry until something has been scrolled past', () => {
    expect(entries()[0].getAttribute('aria-current')).toBe('true');
    expect(entries()[1].getAttribute('aria-current')).toBeNull();
  });

  it('moves the mark to the entry pressed, without waiting for the scroll', () => {
    entries()[1].click();
    fixture.detectChanges();

    expect(entries()[1].getAttribute('aria-current')).toBe('true');
    expect(entries()[0].getAttribute('aria-current')).toBeNull();
  });

  it('follows the section the reader has reached', () => {
    expect(observer().observed.map((node) => node.id)).toEqual([
      'spec-target-sampling',
      'spec-target-horde',
    ]);

    observer().emit([
      { target: { id: 'spec-target-sampling' }, isIntersecting: false },
      { target: { id: 'spec-target-horde' }, isIntersecting: true },
    ]);
    fixture.detectChanges();

    expect(entries()[1].getAttribute('aria-current')).toBe('true');

    // Two sections framed together: the mark stays with the higher one rather
    // than running ahead of the eye.
    observer().emit([
      { target: { id: 'spec-target-sampling' }, isIntersecting: true },
    ]);
    fixture.detectChanges();

    expect(entries()[0].getAttribute('aria-current')).toBe('true');
  });

  it('falls back to the first entry when nothing is in view', () => {
    observer().emit([
      { target: { id: 'spec-target-horde' }, isIntersecting: true },
    ]);
    observer().emit([
      { target: { id: 'spec-target-horde' }, isIntersecting: false },
    ]);
    fixture.detectChanges();

    // A reader who has gone back to the top of the page is at the top of it,
    // and a mark left on the section they were last over says otherwise.
    expect(entries()[0].getAttribute('aria-current')).toBe('true');
    expect(entries()[1].getAttribute('aria-current')).toBeNull();
  });

  it('follows a jump that changes both sections at once', () => {
    // An instant jump reports the section left and the section reached in one
    // batch, so the mark is read off everything in view rather than off the
    // records that happened to say "now intersecting".
    observer().emit([
      { target: { id: 'spec-target-sampling' }, isIntersecting: true },
    ]);
    fixture.detectChanges();
    expect(entries()[0].getAttribute('aria-current')).toBe('true');

    observer().emit([
      { target: { id: 'spec-target-sampling' }, isIntersecting: false },
      { target: { id: 'spec-target-horde' }, isIntersecting: true },
    ]);
    fixture.detectChanges();

    expect(entries()[1].getAttribute('aria-current')).toBe('true');
    expect(entries()[0].getAttribute('aria-current')).toBeNull();
  });

  it('carries the bar form only where the caller asks for it', () => {
    const rail = (): HTMLElement =>
      el().querySelector<HTMLElement>('app-gs-index-rail')!;

    // The class is what holds the row form past the width the column form
    // would otherwise take over at, so a page that wants the bar on a wide
    // screen is the only page carrying it.
    expect(rail().classList).not.toContain('gs-index-rail--bar');

    fixture.componentInstance.barForm.set(true);
    fixture.detectChanges();

    expect(rail().classList).toContain('gs-index-rail--bar');
  });

  it('lets the observer go when the rail does', () => {
    const instance = observer();

    fixture.destroy();

    expect(instance.disconnected).toBe(true);
  });
});

/** The link form: entries that route, with the page saying which one is on. */
const LINK_ENTRIES: readonly GsIndexRailEntry[] = [
  {
    id: 'txt2img',
    labelKey: 'generate.tutorials.flows.txt2img.task_name',
    icon: 'sec-prompt',
    hueClass: 'gs-sec--prompt',
    link: ['/docs/image/learn', 'txt2img'],
    subLabelKey: 'generate.tutorials.flows.txt2img.technique',
  },
  {
    id: 'remix',
    labelKey: 'generate.tutorials.flows.remix.task_name',
    hueClass: 'gs-sec--source',
    link: ['/docs/image/learn', 'remix'],
    noteKey: 'generate.tutorials.unavailable_tag',
  },
];

@Component({
  imports: [GsIndexRailComponent],
  template: `
    <app-gs-index-rail [entries]="entries" [currentId]="currentId()" />
  `,
})
class LinkHostComponent {
  public readonly entries = LINK_ENTRIES;
  public readonly currentId = signal<string | null>(null);
}

describe('GsIndexRailComponent (link mode)', () => {
  let fixture: ComponentFixture<LinkHostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const entries = (): HTMLAnchorElement[] =>
    Array.from(el().querySelectorAll<HTMLAnchorElement>('.gs-index-entry'));

  beforeEach(async () => {
    FakeIntersectionObserver.last = null;
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;

    await TestBed.configureTestingModule({
      imports: [
        LinkHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LinkHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('offers each entry as a link to where it goes', () => {
    const lines = entries();

    expect(lines.map((line) => line.tagName)).toEqual(['A', 'A']);
    expect(lines.map((line) => line.getAttribute('href'))).toEqual([
      '/docs/image/learn/txt2img',
      '/docs/image/learn/remix',
    ]);
    expect(lines[0].classList).toContain('gs-sec--prompt');
    expect(
      lines[0].querySelector('app-icon.gs-index-entry-mark'),
    ).not.toBeNull();
  });

  it('marks the entry the page says it is on, and guesses at none', () => {
    expect(entries().map((line) => line.getAttribute('aria-current'))).toEqual([
      null,
      null,
    ]);

    fixture.componentInstance.currentId.set('remix');
    fixture.detectChanges();

    expect(entries().map((line) => line.getAttribute('aria-current'))).toEqual([
      null,
      'page',
    ]);
  });

  it('mutes and annotates an entry that comes with a caveat', () => {
    const [plain, noted] = entries();

    expect(plain.classList).not.toContain('gs-index-entry--muted');
    expect(plain.querySelector('.gs-index-entry-note')).toBeNull();
    expect(noted.classList).toContain('gs-index-entry--muted');
    expect(
      noted.querySelector('.gs-index-entry-note')?.textContent?.trim(),
    ).toBe(translations['generate.tutorials.unavailable_tag']);
    // Still a way in: what is missing is worth reading before it is clicked.
    expect(noted.getAttribute('href')).toBe('/docs/image/learn/remix');
  });

  it('sets a second name under the first, where an entry has one', () => {
    const [named, plain] = entries();

    expect(
      named.querySelector('.gs-index-entry-sub')?.textContent?.trim(),
    ).toBe(translations['generate.tutorials.flows.txt2img.technique']);
    expect(plain.querySelector('.gs-index-entry-sub')).toBeNull();
  });

  it('watches nothing, having no section on the page to follow', () => {
    expect(FakeIntersectionObserver.last?.observed ?? []).toHaveLength(0);
  });
});
