import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { SharedKeyCardComponent } from './shared-key-card.component';
import {
  SharedKeyDetails,
  SharedKeyUsageSummary,
} from '../../../types/shared-key';
import en from '../../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

const IDLE: SharedKeyUsageSummary = {
  requests: 0,
  queued: 0,
  processing: 0,
  finished: 0,
  oldest_queued_age: 0,
};

const BASE_KEY: SharedKeyDetails = {
  id: 'sk-1',
  name: 'Family',
  kudos: -1,
  utilized: 10,
};

describe('SharedKeyCardComponent', () => {
  let fixture: ComponentFixture<SharedKeyCardComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const usage = (): HTMLElement | null =>
    el().querySelector<HTMLElement>('.shared-key-usage');
  const kinds = (): HTMLElement[] =>
    Array.from(el().querySelectorAll<HTMLElement>('.shared-key-usage-kind'));

  function render(key: SharedKeyDetails): void {
    fixture.componentRef.setInput('sharedKey', key);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SharedKeyCardComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SharedKeyCardComponent);
  });

  it('shows no usage section when the horde sends no counts', () => {
    render(BASE_KEY);
    expect(usage()).toBeNull();
  });

  it('says nothing is running when every count is zero', () => {
    render({ ...BASE_KEY, active_usage: { image: IDLE, text: IDLE } });
    const section = usage();
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain(
      translations['profile.shared_keys.usage.idle'],
    );
    expect(kinds()).toHaveLength(0);
  });

  it('lists only the kinds of work that are running, with their counts', () => {
    render({
      ...BASE_KEY,
      active_usage: {
        image: {
          requests: 2,
          queued: 7,
          processing: 3,
          finished: 1,
          oldest_queued_age: 150,
        },
        text: IDLE,
      },
    });

    const section = usage()!;
    expect(section.textContent).not.toContain(
      translations['profile.shared_keys.usage.idle'],
    );
    const shown = kinds();
    expect(shown).toHaveLength(1);
    const text = shown[0].textContent ?? '';
    expect(text).toContain(translations['profile.shared_keys.usage.image']);
    expect(text).not.toContain(translations['profile.shared_keys.usage.text']);

    const values = Array.from(
      shown[0].querySelectorAll('.hd-row-val'),
      (node) => node.textContent?.trim(),
    );
    expect(values).toEqual(['2', '7', '3', 'about 3 minutes']);
  });

  it('shows text work and leaves out the wait when nothing is queued', () => {
    render({
      ...BASE_KEY,
      active_usage: {
        image: IDLE,
        text: {
          requests: 1,
          queued: 0,
          processing: 1,
          finished: 0,
          oldest_queued_age: 0,
        },
      },
    });

    const shown = kinds();
    expect(shown).toHaveLength(1);
    expect(shown[0].textContent).toContain(
      translations['profile.shared_keys.usage.text'],
    );
    expect(shown[0].textContent).not.toContain(
      translations['profile.shared_keys.usage.oldest_wait'],
    );
    expect(shown[0].querySelectorAll('.hd-row')).toHaveLength(3);
  });

  it('labels the section it heads', () => {
    render({ ...BASE_KEY, active_usage: { image: IDLE, text: IDLE } });
    const section = usage()!;
    const labelId = section.getAttribute('aria-labelledby');
    expect(labelId).toBe('shared-key-usage-sk-1');
    expect(section.querySelector(`#${labelId}`)?.textContent?.trim()).toBe(
      translations['profile.shared_keys.usage.title'],
    );
  });

  it('words the longest wait in seconds, minutes or hours', () => {
    const waitFor = (seconds: number): string | undefined => {
      render({
        ...BASE_KEY,
        active_usage: {
          image: {
            requests: 1,
            queued: 1,
            processing: 0,
            finished: 0,
            oldest_queued_age: seconds,
          },
          text: IDLE,
        },
      });
      const values = kinds()[0].querySelectorAll('.hd-row-val');
      return values[values.length - 1].textContent?.trim();
    };

    expect(waitFor(1)).toBe('1 second');
    expect(waitFor(45)).toBe('45 seconds');
    expect(waitFor(60)).toBe('about 1 minute');
    expect(waitFor(3599)).toBe('about 1 hour');
    expect(waitFor(7200)).toBe('about 2 hours');
  });
});
