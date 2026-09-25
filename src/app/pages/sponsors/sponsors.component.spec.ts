import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SponsorsComponent } from './sponsors.component';
import { AiHordeService } from '../../services/ai-horde.service';

const DOCUMENT = [
  'Sponsors',
  '========',
  '',
  '* [GetIPIntel.net - Free Proxy/VPN Detection](https://getipintel.net)',
  '* [Eric Monson](None)',
  '',
  '[Patrons](https://www.patreon.com/db0)',
  '======================================',
  '',
  'Courage of Link, patron@example.com',
].join('\n');

const COPY = {
  sponsors: 'Sponsors',
  'sponsors.lead': 'Who pays for it.',
  'sponsors.patrons_title': 'Patrons',
  'sponsors.patrons_lead': 'People who give regularly.',
  'sponsors.donate_title': 'Help pay for it',
  'sponsors.donate_hint': 'Donations go to Haidra.',
  'sponsors.donate_action': 'Ways to give',
  'sponsors.loading': 'Loading the list.',
  'sponsors.unavailable': 'The list is unavailable right now.',
};

async function mount(
  reply: 'ok' | 'error',
): Promise<ComponentFixture<SponsorsComponent>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [
      SponsorsComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: COPY },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      {
        provide: AiHordeService,
        useValue: {
          sponsorsDocument:
            reply === 'ok'
              ? of(DOCUMENT)
              : throwError(() => new Error('unreachable')),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(SponsorsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('SponsorsComponent', () => {
  it('draws a card per sponsor', async () => {
    const fixture = await mount('ok');
    const host = fixture.nativeElement as HTMLElement;
    const cards = host.querySelectorAll<HTMLElement>('.sponsors-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('GetIPIntel.net');
    expect(cards[0]?.textContent).toContain('Free Proxy/VPN Detection');
  });

  it('links a sponsor that has an address and leaves the rest unlinked', async () => {
    const fixture = await mount('ok');
    const host = fixture.nativeElement as HTMLElement;
    const links = host.querySelectorAll<HTMLAnchorElement>(
      'a.sponsors-card--link',
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://getipintel.net');
    expect(fixture.nativeElement.innerHTML).not.toContain('None');
  });

  it('names the patrons without publishing an address', async () => {
    const fixture = await mount('ok');
    const patrons = fixture.nativeElement.querySelector(
      '.sponsors-patron-list',
    );
    expect(patrons.textContent).toContain('Courage of Link');
    expect(patrons.textContent).toContain('patron');
    expect(patrons.textContent).not.toContain('@');
  });

  it('sends a reader who wants to help to Haidra, not to Patreon', async () => {
    const fixture = await mount('ok');
    const host = fixture.nativeElement as HTMLElement;
    const donate = host.querySelector<HTMLAnchorElement>('a.sponsors-donate');
    expect(donate?.getAttribute('href')).toBe('https://haidra.net/donate/');
    expect(fixture.nativeElement.innerHTML).not.toContain('patreon');
  });

  it('says so when the document cannot be read', async () => {
    const fixture = await mount('error');
    expect(fixture.nativeElement.textContent).toContain(
      'The list is unavailable right now.',
    );
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.sponsors-card')).toHaveLength(0);
  });
});
