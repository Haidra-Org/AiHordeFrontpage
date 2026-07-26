import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsHelpComponent } from './gs-help.component';
import { GsHelpService } from '../../services/gs-help.service';

@Component({
  template: `
    <app-gs-help topic="steps" />
    <app-gs-help topic="seed" />
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
