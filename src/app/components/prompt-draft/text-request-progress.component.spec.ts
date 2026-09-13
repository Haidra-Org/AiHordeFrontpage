import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { TextRequestProgressComponent } from './text-request-progress.component';
import type {
  StoredTextRequest,
  TextRequestFigures,
} from '../../services/text-generation-db.service';

const NOW = 1_700_000_000_000;

function request(overrides: Partial<StoredTextRequest>): StoredTextRequest {
  return {
    localId: 'local-1',
    hordeId: 'text-1',
    createdAt: NOW - 30_000,
    updatedAt: NOW,
    context: { kind: 'studio' },
    origin: 'studio',
    input: { prompt: 'a dog' },
    pick: 'auto',
    takes: 1,
    anonymous: true,
    modelLabel: null,
    request: { prompt: 'the body' },
    state: 'queued',
    acknowledged: false,
    ...overrides,
  };
}

function figures(overrides: Partial<TextRequestFigures>): TextRequestFigures {
  return {
    finished: 0,
    processing: 0,
    waiting: 1,
    restarted: 0,
    queuePosition: 2,
    waitTime: 30,
    isPossible: true,
    ...overrides,
  };
}

describe('TextRequestProgressComponent', () => {
  let fixture: ComponentFixture<TextRequestProgressComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TextRequestProgressComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
    });
  });

  const build = (value: StoredTextRequest): void => {
    fixture = TestBed.createComponent(TextRequestProgressComponent);
    fixture.componentRef.setInput('request', value);
    fixture.componentRef.setInput('now', NOW);
    fixture.detectChanges();
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const press = (key: string): void => {
    const button = [...el().querySelectorAll('button')].find((candidate) =>
      (candidate.textContent ?? '').includes(key),
    );
    if (!button) throw new Error(`no button for ${key}`);
    button.click();
  };

  it('says a duration in seconds under a minute and in minutes above', () => {
    build(request({}));
    const component = fixture.componentInstance;
    expect(component.duration(1)).toBe('en.prompt_draft.queue.seconds_one');
    expect(component.duration(42)).toBe('en.prompt_draft.queue.seconds_other');
    expect(component.duration(80)).toBe('en.prompt_draft.queue.minutes_one');
    expect(component.duration(600)).toBe('en.prompt_draft.queue.minutes_other');
  });

  it('counts no worker only while the request is queued', () => {
    build(request({ figures: figures({ eligibleWorkers: 0 }) }));
    expect(fixture.componentInstance.noWorker()).toBe(true);

    fixture.componentRef.setInput(
      'request',
      request({ state: 'writing', figures: figures({ isPossible: false }) }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.noWorker()).toBe(false);
  });

  it('names a queue movement where there is one', () => {
    build(request({ figures: figures({}) }));
    fixture.componentRef.setInput('trend', 'worsened');
    fixture.detectChanges();
    expect(el().textContent).toContain('generate.results.queue_trend_worsened');
  });

  it('hands each press to the card', () => {
    build(request({ figures: figures({ isPossible: false }) }));
    const events: string[] = [];
    fixture.componentInstance.cancelRequest.subscribe(() =>
      events.push('cancel'),
    );
    fixture.componentInstance.repick.subscribe((pick) =>
      events.push(`repick:${pick}`),
    );
    fixture.componentInstance.retry.subscribe(() => events.push('retry'));

    press('prompt_draft.queue.use_value');
    press('prompt_draft.queue.use_any');
    press('prompt_draft.queue.cancel');

    fixture.componentRef.setInput('request', request({ state: 'refused' }));
    fixture.detectChanges();
    press('prompt_draft.again');

    expect(events).toEqual(['repick:auto', 'repick:any', 'cancel', 'retry']);
  });

  it('holds the presses that send while the card is still sending', () => {
    build(request({ state: 'expired' }));
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const buttons = [...el().querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    const sending = buttons.filter(
      (button) => !(button.textContent ?? '').includes('prompt_draft.details'),
    );
    expect(sending.length).toBeGreaterThan(0);
    expect(sending.every((button) => button.disabled)).toBe(true);
    // Reading what was sent asks the horde for nothing, so it stays open.
    const details = buttons.find((button) =>
      (button.textContent ?? '').includes('prompt_draft.details'),
    );
    expect(details?.disabled).toBe(false);
  });

  it('names the worker behind an answer with nothing in it, and why', () => {
    build(
      request({
        state: 'empty',
        results: [
          {
            draftId: 'text-1-0',
            text: '',
            negative: '',
            rawText: '   ',
            reason: 'blank',
            model: 'm',
            seed: null,
            workerId: 'worker-1',
            workerName: 'a friendly worker',
          },
        ],
      }),
    );
    expect(fixture.componentInstance.worker()).toBe('a friendly worker');
    expect(el().textContent).toContain('prompt_draft.empty');
    expect(el().textContent).toContain('prompt_draft.empty_blank');
    expect(el().textContent).toContain('prompt_draft.empty_next');
  });

  it('promises a different worker only when one is being kept off', () => {
    const take = {
      draftId: 'text-1-0',
      text: '',
      negative: '',
      rawText: '',
      reason: 'blank' as const,
      model: 'm',
      seed: null,
    };
    build(
      request({
        state: 'empty',
        results: [{ ...take, workerId: 'worker-1' }],
      }),
    );
    expect(fixture.componentInstance.avoided()).toBe(true);
    expect(el().textContent).toContain('prompt_draft.empty_next');

    build(
      request({
        state: 'empty',
        results: [{ ...take, workerName: 'a friendly worker' }],
      }),
    );
    expect(fixture.componentInstance.avoided()).toBe(false);
    expect(el().textContent).toContain('prompt_draft.empty');
    expect(el().textContent).not.toContain('prompt_draft.empty_next');
  });

  it('leaves the reason off when the takes do not agree on one', () => {
    build(
      request({
        state: 'empty',
        results: [
          {
            draftId: 'a',
            text: '',
            negative: '',
            rawText: '',
            reason: 'blank',
            model: 'm',
            seed: null,
          },
          {
            draftId: 'b',
            text: '',
            negative: '',
            rawText: '',
            reason: 'censored',
            model: 'm',
            seed: null,
          },
        ],
      }),
    );
    expect(fixture.componentInstance.emptyReason()).toBeNull();
    expect(el().textContent).toContain('prompt_draft.empty_unknown');
  });

  it('hands the details press to the card', () => {
    build(request({ state: 'faulted' }));
    const events: string[] = [];
    fixture.componentInstance.details.subscribe(() => events.push('details'));
    press('prompt_draft.details');
    expect(events).toEqual(['details']);
  });
});
