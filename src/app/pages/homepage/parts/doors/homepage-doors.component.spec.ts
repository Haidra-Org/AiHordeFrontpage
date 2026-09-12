import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageDoorsComponent } from './homepage-doors.component';

// The reveal directive watches for the section being read, which jsdom has no
// implementation of.
globalThis.IntersectionObserver ??= class {
  observe() {
    /* no-op */
  }
  unobserve() {
    /* no-op */
  }
  disconnect() {
    /* no-op */
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
} as unknown as typeof globalThis.IntersectionObserver;

describe('HomepageDoorsComponent', () => {
  let fixture: ComponentFixture<HomepageDoorsComponent>;
  let navigate: ReturnType<typeof vi.fn>;
  let opened: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigate = vi.fn().mockResolvedValue(true);
    opened = vi.fn();
    vi.stubGlobal('open', opened);

    TestBed.configureTestingModule({
      imports: [
        HomepageDoorsComponent,
        RouterModule.forRoot([]),
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    });
    TestBed.inject(Router).navigateByUrl = navigate;

    fixture = TestBed.createComponent(HomepageDoorsComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('offers the three doors on the shared door card', () => {
    const doors = fixture.nativeElement.querySelectorAll('.gs-door');
    expect(doors).toHaveLength(3);
    expect(
      Array.from(doors).map((door) =>
        (door as HTMLElement)
          .querySelector('.gs-cap-title')!
          .textContent.trim(),
      ),
    ).toEqual([
      'homepage.doors.generate_title',
      'homepage.doors.contribute_title',
      'homepage.doors.build_title',
    ]);
  });

  it('marks the one door that leaves the site, and only that one', () => {
    const doors = fixture.componentInstance.doors;

    expect(doors.map((door) => door.external ?? false)).toEqual([
      false,
      false,
      true,
    ]);
    // The door says so where the reader is, too: one appended phrase, on the
    // press that opens a window rather than moving the page.
    const notes = fixture.nativeElement.querySelectorAll('.gs-door .sr-only');
    expect(notes).toHaveLength(1);
    expect(
      (
        fixture.nativeElement.querySelectorAll('.gs-door')[2] as HTMLElement
      ).querySelector('.sr-only'),
    ).not.toBeNull();
  });

  it('goes where each door says', () => {
    const doors = fixture.nativeElement.querySelectorAll(
      '.gs-door',
    ) as NodeListOf<HTMLButtonElement>;

    doors[0].click();
    expect(navigate).toHaveBeenCalledWith('/generate/image');

    doors[1].click();
    expect(navigate).toHaveBeenCalledWith('/contribute');

    // The API reference is published outside this site, so that door opens a
    // window rather than a route.
    doors[2].click();
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(opened).toHaveBeenCalledWith(
      'https://aihorde.net/api/',
      '_blank',
      'noopener',
    );
  });
});
