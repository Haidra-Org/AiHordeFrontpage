import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { GsParamEntryComponent } from './gs-param-entry.component';
import { GsTryItService } from '../../services/gs-try-it.service';
import { GlossaryService } from '../../services/glossary.service';
import { environment } from '../../../environments/environment';
import {
  settingReference,
  settingSweepGrid,
  settingSweepStrip,
} from '../../content/settings';
import en from '../../../assets/i18n/en.json';
import stubIndex from '../../testing/fixtures/sweep-index.stub.json';

const translations = en as Record<string, string>;

@Component({
  imports: [GsParamEntryComponent],
  template: `<app-gs-param-entry [topic]="topic" [mode]="mode" />`,
})
class HostComponent {
  public topic = 'steps';
  public mode: 'page' | 'dock' = 'page';
}

describe('GsParamEntryComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  async function setUp(options?: {
    topic?: string;
    mode?: 'page' | 'dock';
    /** Language table to render against, for the entries not yet written. */
    langs?: Record<string, string>;
  }): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: options?.langs ?? en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.topic = options?.topic ?? 'steps';
    fixture.componentInstance.mode = options?.mode ?? 'page';
    fixture.detectChanges();

    // A setting with no strip mounts no sweep, so the library is never fetched.
    for (const request of http.match(
      `${environment.evidenceBaseUrl}/index.json`,
    )) {
      request.flush(stubIndex);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  it('heads the entry with its area mark and the name the panel uses', async () => {
    await setUp({ topic: 'steps' });

    expect(find('.gs-ref-head .gs-sec-chip--lg')).not.toBeNull();
    expect(find('.gs-ref-title')?.tagName).toBe('H1');
    expect(find('.gs-ref-title')?.textContent?.trim()).toBe(
      translations['generate.help.steps.title'],
    );
    // Sampling's hue, taken from the section identity rather than restated.
    expect(find('app-gs-param-entry')?.classList).toContain('gs-sec--sampling');
  });

  it('leads with the sentence for someone meeting the setting, then the depth', async () => {
    await setUp({ topic: 'steps' });

    expect(find('.gs-ref-lead')?.textContent?.trim()).toBe(
      translations['generate.reference.steps.lead'],
    );
    expect(find('.gs-ref-body')?.textContent?.trim()).toBe(
      translations['generate.reference.steps.body'],
    );
  });

  it('renders nothing where a piece of the prose has not been written', async () => {
    const partial = { ...translations };
    delete partial['generate.reference.steps.body'];

    await setUp({ topic: 'steps', langs: partial });

    expect(find('.gs-ref-body')).toBeNull();
    expect(el().textContent).not.toContain('generate.reference.steps.body');
    // The lead is untouched: one missing key does not take the entry down.
    expect(find('.gs-ref-lead')).not.toBeNull();
  });

  it('states what the setting costs, only where the registry knows', async () => {
    await setUp({ topic: 'steps' });
    const costs = all('.gs-ref-cost').map((node) => node.textContent?.trim());

    expect(costs).toEqual([
      translations['generate.reference.tradeoff_speed_slower'],
      translations['generate.reference.tradeoff_kudos_costlier'],
      translations['generate.reference.quality_steps'],
    ]);

    await setUp({ topic: 'seed' });
    expect(settingReference('seed')?.tradeoffs).toBeUndefined();
    expect(find('.gs-ref-costs')).toBeNull();
  });

  it('shows the typical and default values as quiet chips', async () => {
    await setUp({ topic: 'steps' });

    expect(
      all('.gs-ref-chip:not(.gs-ref-chip--try)').map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['Typical 20-40', 'Default 25']);

    // A range whose typical value is the form's default carries one chip only.
    await setUp({ topic: 'denoise' });
    expect(all('.gs-ref-chip:not(.gs-ref-chip--try)')).toHaveLength(1);

    await setUp({ topic: 'seed' });
    expect(find('.gs-ref-range')).toBeNull();
  });

  describe('try-it chips', () => {
    it('writes the value and flashes the field when the studio is beside it', async () => {
      await setUp({ topic: 'steps', mode: 'dock' });
      const host = {
        applyFields: vi.fn(),
        currentMode: vi.fn().mockReturnValue('advanced'),
        currentSourceMode: vi.fn().mockReturnValue('img2img'),
        setMode: vi.fn(),
      };
      TestBed.inject(GsTryItService).registerHost(host);

      const chips = all<HTMLButtonElement>('.gs-ref-chip--try');
      expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
        'Try 20',
        'Try 40',
      ]);

      chips[1].click();

      expect(host.applyFields).toHaveBeenCalledWith({ steps: 40 }, []);
    });

    it('arms the value and goes to the studio from the routed page', async () => {
      await setUp({ topic: 'steps', mode: 'page' });
      const router = TestBed.inject(Router);
      const navigate = vi
        .spyOn(router, 'navigateByUrl')
        .mockResolvedValue(true);

      const chips = all<HTMLButtonElement>('.gs-ref-chip--try');
      expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
        'Try 20 in the studio',
        'Try 40 in the studio',
      ]);

      chips[0].click();

      expect(navigate).toHaveBeenCalledWith('/generate/image');
      expect(TestBed.inject(GsTryItService).consumeArmed()?.fields).toEqual({
        steps: 20,
      });
    });

    it('offers nothing on an entry with no value worth naming', async () => {
      await setUp({ topic: 'seed', mode: 'dock' });

      expect(settingReference('seed')?.applies).toBeUndefined();
      expect(all('.gs-ref-chip--try')).toHaveLength(0);
    });
  });

  it('offers the strip and the plate the library published for the setting', async () => {
    await setUp({ topic: 'steps' });

    expect(settingSweepStrip('steps')).toBe('steps');
    expect(settingSweepGrid('steps')).toBe('steps_cfg_grid');
    expect(find('app-gs-sweep-scrub')).not.toBeNull();
    expect(find('app-gs-sweep-grid')).not.toBeNull();

    await setUp({ topic: 'webhook' });
    expect(find('app-gs-sweep-scrub')).toBeNull();
    expect(find('app-gs-sweep-grid')).toBeNull();
  });

  it('points on to its siblings, each wearing its own area mark', async () => {
    await setUp({ topic: 'steps' });
    const links = all<HTMLAnchorElement>('.gs-ref-related-link');

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/docs/image/settings/cfg',
      '/docs/image/settings/sampler',
      '/docs/image/settings/requirements',
    ]);
    expect(links[0].querySelector('.gs-sec-chip')).not.toBeNull();
  });

  it('offers the model list from the entries that are about models', async () => {
    await setUp({ topic: 'loras' });

    expect(find<HTMLAnchorElement>('.gs-ref-link')?.getAttribute('href')).toBe(
      '/details/models',
    );

    await setUp({ topic: 'steps' });
    expect(find('.gs-ref-link')).toBeNull();
  });

  it('offers the horde words an entry leans on, and opens the dictionary at them', async () => {
    await setUp({ topic: 'trusted_workers' });
    const chips = all<HTMLButtonElement>('.gs-ref-term');

    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      translations['help.glossary.terms.worker.title'],
      translations['help.glossary.terms.trusted.title'],
    ]);
    expect(el().querySelector('.gs-ref-terms-head')?.textContent?.trim()).toBe(
      translations['generate.reference.terms_head'],
    );

    chips[1].click();
    const glossary = TestBed.inject(GlossaryService);

    expect(glossary.isOpen()).toBe(true);
    expect(glossary.activeTermId()).toBe('trusted');
  });

  it('says nothing about the glossary on an entry that needs none', async () => {
    await setUp({ topic: 'steps' });

    expect(settingReference('steps')?.glossaryTerms).toBeUndefined();
    expect(find('.gs-ref-terms')).toBeNull();
  });

  it('says where the rest of the reference is only when it is docked', async () => {
    await setUp({ topic: 'steps', mode: 'page' });
    expect(find('.gs-ref-foot')).toBeNull();

    await setUp({ topic: 'steps', mode: 'dock' });
    expect(find<HTMLAnchorElement>('.gs-ref-full')?.getAttribute('href')).toBe(
      '/docs/image/settings/steps',
    );
    expect(find('.gs-ref-full')?.textContent?.trim()).toBe(
      translations['generate.reference.open_full'],
    );
    // A docked entry is not the page's own heading.
    expect(find('.gs-ref-title')?.tagName).toBe('H2');
  });
});
