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
import { environment } from '../../../environments/environment';
import stubIndex from '../../testing/fixtures/sweep-index.stub.json';

@Component({
  template: `
    <app-gs-help topic="steps" />
    <app-gs-help topic="batch" />
  `,
  imports: [GsHelpComponent],
})
class TestHostComponent {}

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

  describe('parameter sweeps', () => {
    const SWEEP_INDEX = `${environment.sweepLibraryBaseUrl}/index.json`;

    it('offers the sweep inside a note whose field has one', async () => {
      const { fixture, click } = setup();

      // The first trigger is `steps`, which a strip covers.
      click(0);
      TestBed.inject(HttpTestingController)
        .expectOne(SWEEP_INDEX)
        .flush(stubIndex);
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelectorAll('.gs-sweep-offer'),
      ).toHaveLength(1);
    });

    it('offers nothing inside a note whose field has no strip', () => {
      const { fixture, click } = setup();

      // The second trigger is `batch`, which nothing sweeps.
      click(1);

      expect(
        fixture.nativeElement.querySelectorAll('.gs-sweep-offer'),
      ).toHaveLength(0);
      TestBed.inject(HttpTestingController).expectNone(SWEEP_INDEX);
    });

    it('leaves the note intact when the library cannot be reached', async () => {
      const { fixture, notes, click } = setup();

      click(0);
      TestBed.inject(HttpTestingController)
        .expectOne(SWEEP_INDEX)
        .error(new ProgressEvent('offline'), { status: 0, statusText: '' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(notes()).toHaveLength(1);
      expect(fixture.nativeElement.querySelectorAll('.gs-sweep')).toHaveLength(
        0,
      );
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
