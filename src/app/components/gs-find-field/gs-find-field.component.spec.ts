import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GsFindFieldComponent,
  findHighlightParts,
} from './gs-find-field.component';
import en from '../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

@Component({
  template: `<app-gs-find-field
    [matches]="matches()"
    (queryChange)="seen.set($event)"
  />`,
  imports: [GsFindFieldComponent],
})
class TestHostComponent {
  public readonly matches = signal(0);
  public readonly seen = signal<string | null>(null);
}

describe('GsFindFieldComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const field = (): HTMLInputElement =>
    el().querySelector<HTMLInputElement>('.gs-find-input')!;
  const status = (): HTMLElement =>
    el().querySelector<HTMLElement>('[aria-live="polite"]')!;

  function type(text: string): void {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TestHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('labels the field and offers no clear button while it is empty', () => {
    expect(el().querySelector('.gs-find-label')?.textContent?.trim()).toBe(
      translations['docs.find.label'],
    );
    expect(field().getAttribute('type')).toBe('search');
    expect(el().querySelector('.gs-find-label')?.getAttribute('for')).toBe(
      field().id,
    );
    expect(el().querySelector('.gs-find-clear')).toBeNull();
    expect(status().textContent?.trim()).toBe('');
  });

  it('emits what is typed', () => {
    type('guidance');

    expect(host.seen()).toBe('guidance');
  });

  it('says how many things the page kept', () => {
    host.matches.set(4);
    type('seed');

    expect(status().textContent?.trim()).toBe(
      translations['docs.find.count'].replace('{{ count }}', '4'),
    );

    host.matches.set(1);
    fixture.detectChanges();

    expect(status().textContent?.trim()).toBe(
      translations['docs.find.count_one'],
    );
    // Said in the open as well as announced: a reader watching the page shrink
    // is owed the number too, and one element says it once to both.
    expect(status().classList).not.toContain('sr-only');
    expect(status().classList).toContain('gs-find-status');
  });

  it('clears on Escape and leaves the caret in the field', () => {
    type('cfg');
    field().focus();

    field().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(host.seen()).toBe('');
    expect(field().value).toBe('');
    expect(document.activeElement).toBe(field());
    expect(status().textContent?.trim()).toBe('');
  });

  it('clears from the button, which says what it does', () => {
    type('cfg');
    const clear = el().querySelector<HTMLButtonElement>('.gs-find-clear')!;

    expect(clear.getAttribute('aria-label')).toBe(
      translations['docs.find.clear'],
    );

    clear.click();
    fixture.detectChanges();

    expect(host.seen()).toBe('');
    expect(el().querySelector('.gs-find-clear')).toBeNull();
  });
});

describe('findHighlightParts', () => {
  it('returns the whole string unmarked when nothing is being looked for', () => {
    expect(findHighlightParts('Guidance', '')).toEqual([
      { text: 'Guidance', hit: false },
    ]);
  });

  it('marks every run of the query, whatever its case', () => {
    expect(findHighlightParts('Seed and seedling', 'SEED')).toEqual([
      { text: 'Seed', hit: true },
      { text: ' and ', hit: false },
      { text: 'seed', hit: true },
      { text: 'ling', hit: false },
    ]);
  });

  it('reads the query as text rather than as a pattern', () => {
    expect(findHighlightParts('Guidance', '.*')).toEqual([
      { text: 'Guidance', hit: false },
    ]);
  });
});
