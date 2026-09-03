import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import { DatabaseService } from '../../../services/database.service';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';
import { isConceptFlow } from '../../../content/flows';
import {
  GenerateWelcomeComponent,
  WELCOME_SNOOZE_MS,
} from './generate-welcome.component';

const TRANSLATIONS = en as Record<string, string>;

describe('GenerateWelcomeComponent', () => {
  let fixture: ComponentFixture<GenerateWelcomeComponent>;
  let component: GenerateWelcomeComponent;
  let el: HTMLElement;
  let dbStore: ReturnType<typeof vi.fn>;
  let closed: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dbStore = vi.fn();
    closed = vi.fn();

    await TestBed.configureTestingModule({
      imports: [
        GenerateWelcomeComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: DatabaseService,
          useValue: { get: vi.fn().mockReturnValue(undefined), store: dbStore },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateWelcomeComponent);
    component = fixture.componentInstance;
    component.closed.subscribe(closed);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(TutorialEngineService).stop();
    fixture.destroy();
  });

  it('offers three ways in, each worded', () => {
    const doors = el.querySelectorAll<HTMLButtonElement>('.gs-welcome-door');

    expect(doors).toHaveLength(3);
    // Three registers, none repeated: the door is the only thing that settles
    // how much the studio explains.
    expect(component.doors.map((door) => door.level)).toEqual([
      'new_to_this',
      'comfortable',
      'expert',
    ]);
    for (const [index, door] of component.doors.entries()) {
      const title = TRANSLATIONS[`generate.welcome.${door.id}.title`];
      const hint = TRANSLATIONS[`generate.welcome.${door.id}.hint`];
      expect(title).toBeTruthy();
      expect(hint).toBeTruthy();
      expect(doors[index].textContent).toContain(title);
      expect(doors[index].textContent).toContain(hint);
    }
  });

  it('asks the question over the page rather than in a pane', () => {
    const panel = el.querySelector('.gs-welcome-panel');

    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-labelledby')).toBe('gs-welcome-title');
    expect(el.querySelector('#gs-welcome-title')?.textContent).toContain(
      TRANSLATIONS['generate.welcome.heading'],
    );
    // The dialog takes focus, not the first door: the press that opened the
    // studio must not carry into starting a walkthrough.
    expect(document.activeElement).toBe(panel);
  });

  it('takes the bottom sheet where the studio has no room beside the panel', () => {
    fixture.componentRef.setInput('narrow', true);
    fixture.detectChanges();

    expect(el.querySelector('app-gs-sheet')).not.toBeNull();
    expect(el.querySelector('.gs-modal-overlay')).toBeNull();
    // The same doors, in the same order: the sheet is where there is room to
    // read them rather than a different offer.
    expect(el.querySelectorAll('.gs-welcome-door')).toHaveLength(3);
  });

  it('puts the answers that decline above the doors in the sheet', () => {
    fixture.componentRef.setInput('narrow', true);
    fixture.detectChanges();

    const decline = el.querySelector('.gs-welcome-decline')!;
    expect(decline.querySelector('.gs-welcome-remember')).not.toBeNull();
    expect(decline.querySelector('.gs-welcome-skip')).not.toBeNull();
    // One of each, so the reader tabs through the offer once. The doors follow
    // the row rather than standing between it and the reader.
    expect(el.querySelectorAll('.gs-welcome-skip')).toHaveLength(1);
    expect(el.querySelectorAll('.gs-welcome-remember')).toHaveLength(1);
    expect(
      decline.compareDocumentPosition(el.querySelector('.gs-welcome-doors')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The reading link is another offer, so it stays with the doors.
    expect(
      el.querySelector('.gs-welcome-foot .gs-welcome-learn'),
    ).not.toBeNull();
  });

  it('settles the level and starts the tutorial behind a guided door', () => {
    const engine = TestBed.inject(TutorialEngineService);

    for (const door of component.doors.filter((d) => d.flowId)) {
      engine.stop();
      component.enterVia(door);

      expect(engine.level()).toBe(door.level);
      expect(engine.activeFlowId()).toBe(door.flowId);
    }
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('sends the second door through the concepts before the walkthrough', () => {
    const [door1, door2] = component.doors;

    expect(isConceptFlow(door1.flowId)).toBe(false);
    expect(isConceptFlow(door2.flowId)).toBe(true);
  });

  it('settles the level and leaves the studio alone behind the last door', () => {
    const engine = TestBed.inject(TutorialEngineService);

    component.enterVia(component.doors[2]);

    expect(engine.level()).toBe('expert');
    expect(engine.active()).toBe(false);
  });

  it('lets the offer be skipped without settling on a level', () => {
    const engine = TestBed.inject(TutorialEngineService);
    const before = engine.level();

    el.querySelector<HTMLButtonElement>('.gs-welcome-skip')!.click();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(engine.level()).toBe(before);
    expect(dbStore).not.toHaveBeenCalledWith(
      'aihorde.generate.learn.welcomed',
      true,
    );
  });

  it('buys a week of quiet when the offer is declined', () => {
    const now = Date.now();

    el.querySelector<HTMLButtonElement>('.gs-welcome-skip')!.click();

    const [key, value] = dbStore.mock.calls[0] as [string, number];
    expect(key).toBe('aihorde.generate.learn.welcomed_until');
    expect(value).toBeGreaterThanOrEqual(now + WELCOME_SNOOZE_MS);
    expect(value).toBeLessThan(now + WELCOME_SNOOZE_MS + 5000);
  });

  it('keeps the offer away for good only when the reader asks it to', () => {
    const checkbox = el.querySelector<HTMLInputElement>(
      '.gs-welcome-remember input',
    )!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.gs-welcome-skip')!.click();

    expect(dbStore).toHaveBeenCalledWith(
      'aihorde.generate.learn.welcomed',
      true,
    );
    // The permanent answer stands on its own; nothing dates it.
    expect(dbStore).not.toHaveBeenCalledWith(
      'aihorde.generate.learn.welcomed_until',
      expect.anything(),
    );
  });

  it('closes on Escape and on the backdrop', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el.querySelector<HTMLElement>('.gs-modal-overlay')!.click();

    expect(closed).toHaveBeenCalledTimes(2);
    expect(dbStore).not.toHaveBeenCalledWith(
      'aihorde.generate.learn.welcomed',
      true,
    );
  });
});
