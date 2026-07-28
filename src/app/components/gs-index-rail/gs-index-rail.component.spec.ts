import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    <app-gs-index-rail [entries]="entries()" [labelKey]="labelKey()" />
    @for (entry of entries(); track entry.id) {
      <section [id]="entry.targetId"></section>
    }
  `,
})
class HostComponent {
  public readonly entries = signal<readonly GsIndexRailEntry[]>(ENTRIES);
  public readonly labelKey = signal('generate.guide.toc_label');
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
      translations['generate.guide.toc_label'],
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

  it('keeps the last section marked when none is in view', () => {
    observer().emit([
      { target: { id: 'spec-target-horde' }, isIntersecting: true },
    ]);
    observer().emit([
      { target: { id: 'spec-target-horde' }, isIntersecting: false },
    ]);
    fixture.detectChanges();

    expect(entries()[1].getAttribute('aria-current')).toBe('true');
  });

  it('lets the observer go when the rail does', () => {
    const instance = observer();

    fixture.destroy();

    expect(instance.disconnected).toBe(true);
  });
});
