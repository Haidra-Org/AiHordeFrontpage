import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsHelpComponent } from './gs-help.component';
import { GsHelpService } from '../../services/gs-help.service';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { hasReference } from '../../content/settings';
import { SweepLibraryService } from '../../services/sweep-library.service';
import { environment } from '../../../environments/environment';
import stubIndex from '../../testing/fixtures/sweep-index.stub.json';

@Component({
  template: `
    <app-gs-help topic="steps" />
    <app-gs-help topic="sampling" />
  `,
  imports: [GsHelpComponent],
})
class TestHostComponent {}

/**
 * Answer the library's one fetch. Passing nothing publishes nothing, which is
 * the state the app is in before the library exists and the state every offer
 * has to survive.
 */
async function publish(strips: unknown = stubIndex): Promise<void> {
  const http = TestBed.inject(HttpTestingController);
  http
    .expectOne(`${environment.evidenceBaseUrl}/index.json`)
    .flush(strips ?? { schema_version: 1, seed: 0, strips: [] });
  // The service settles on a promise, so the answer has landed only once that
  // promise has: a synchronous render after `flush` still sees nothing.
  await TestBed.inject(SweepLibraryService).ensureLoaded();
}

function setup() {
  const fixture = TestBed.createComponent(TestHostComponent);
  fixture.detectChanges();
  const triggers = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.gs-help-btn'));
  const notes = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="note"]'));
  const click = (index: number): void => {
    triggers()[index].click();
    fixture.detectChanges();
  };
  return { fixture, triggers, notes, click };
}

describe('GsHelpComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TestHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    TestBed.inject(GsHelpService).close();
    TestBed.inject(GsHelpDockService).close();
  });

  it('starts collapsed with no note rendered', () => {
    const { triggers, notes } = setup();

    expect(triggers()).toHaveLength(2);
    expect(notes()).toHaveLength(0);
    for (const trigger of triggers()) {
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('aria-describedby')).toBeNull();
      expect(trigger.getAttribute('aria-controls')).toBeTruthy();
    }
  });

  it('expands a note the trigger points at and describes itself with it', () => {
    const { triggers, notes, click } = setup();

    click(0);

    expect(notes()).toHaveLength(1);
    const [trigger] = triggers();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(notes()[0].id).toBe(trigger.getAttribute('aria-controls'));
    expect(trigger.getAttribute('aria-describedby')).toBe(notes()[0].id);
  });

  it('collapses again when its own trigger is pressed', () => {
    const { triggers, notes, click } = setup();

    click(0);
    click(0);

    expect(notes()).toHaveLength(0);
    expect(triggers()[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps at most one note open across instances', () => {
    const { triggers, notes, click } = setup();

    click(0);
    click(1);

    expect(notes()).toHaveLength(1);
    expect(triggers()[0].getAttribute('aria-expanded')).toBe('false');
    expect(triggers()[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('gives every instance its own note id', () => {
    const { triggers } = setup();

    expect(triggers()[0].getAttribute('aria-controls')).not.toBe(
      triggers()[1].getAttribute('aria-controls'),
    );
  });

  describe('the way on to the entry', () => {
    it('keeps the note to prose, mounting no media of its own', async () => {
      const { fixture, click } = setup();
      await publish();

      click(0);

      // The note asks the library whether there is anything to see, but it
      // never becomes the place the pictures are shown.
      expect(
        fixture.nativeElement.querySelector('app-gs-sweep-scrub'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('app-gs-sweep-grid'),
      ).toBeNull();
    });

    it('withholds the offer while the library has published nothing', async () => {
      // "See it in action" is a promise. Until the library answers, and unless
      // it answers with a picture of this setting, the promise is not made.
      const { fixture, click } = setup();
      await publish(null);

      click(0);
      fixture.detectChanges();

      expect(hasReference('steps')).toBe(true);
      expect(fixture.nativeElement.querySelector('.gs-help-see')).toBeNull();
    });

    it('offers the entry from a note whose setting has one', async () => {
      const { fixture, click } = setup();
      await publish();

      // The first trigger is `steps`, which the reference has written up.
      click(0);
      fixture.detectChanges();

      const see = fixture.nativeElement.querySelector('.gs-help-see');
      expect(see).not.toBeNull();
      expect(hasReference('steps')).toBe(true);

      // The offer wears the evidence family's grammar at the size a field note
      // has room for: the ends of the strip it is offering, the badge naming
      // the area, and the chevron that says the pictures open in place.
      expect(
        Array.from(
          see.querySelectorAll<HTMLImageElement>('.gs-cap-peek-frame'),
        ),
      ).toHaveLength(2);
      // This suite renders against an empty table, so the badge is asserted by
      // the key it resolves and by the area it takes its hue from.
      expect(see.querySelector('.gs-cap-eyebrow')?.textContent?.trim()).toBe(
        'generate.sweeps.badge_explorer',
      );
      expect(see.classList.contains('gs-sec--sampling')).toBe(true);
      expect(see.querySelector('.gs-cap-go')).not.toBeNull();

      see.click();
      fixture.detectChanges();

      expect(TestBed.inject(GsHelpDockService).topic()).toBe('steps');
      // The note stays put: it is what said the entry was there.
      expect(
        fixture.nativeElement.querySelectorAll('[role="note"]'),
      ).toHaveLength(1);
    });

    it('offers nothing from a note the reference has not reached', async () => {
      const { fixture, click } = setup();

      await publish();
      // The second trigger is `sampling`, which carries no reference entry.
      click(1);

      expect(hasReference('sampling')).toBe(false);
      expect(fixture.nativeElement.querySelector('.gs-help-see')).toBeNull();
    });
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    const { fixture, triggers, notes, click } = setup();

    click(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(notes()).toHaveLength(0);
    expect(triggers()[0].getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(triggers()[0]);
  });
});
