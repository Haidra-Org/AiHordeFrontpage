import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  NavigationExtras,
  Router,
  convertToParamMap,
} from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, map } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { GalleryComponent } from './gallery.component';
import stubManifest from '../../testing/fixtures/promo-gallery.stub.json';

describe('GalleryComponent', () => {
  let fixture: ComponentFixture<GalleryComponent>;
  let component: GalleryComponent;
  let http: HttpTestingController;
  let queryParams: BehaviorSubject<Record<string, string>>;
  let navigate: ReturnType<typeof vi.fn>;

  const manifestUrl = `${environment.promoBaseUrl}/gallery/gallery.json`;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string =>
    find(selector)?.textContent?.trim() ?? '';
  const chip = (label: string): HTMLButtonElement =>
    all<HTMLButtonElement>('.hd-chip').find(
      (button) => button.textContent?.trim() === label,
    )!;

  /** The manifest lands, which is what every tile on the page waits for. */
  const settle = async (fail = false): Promise<void> => {
    const request = http.expectOne(manifestUrl);
    if (fail) {
      request.error(new ProgressEvent('offline'), {
        status: 0,
        statusText: '',
      });
    } else {
      request.flush(stubManifest);
    }
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    queryParams = new BehaviorSubject<Record<string, string>>({});
    // The dialog follows the address, so the address is the thing under test:
    // a navigation writes the parameters back into the route the page reads.
    navigate = vi.fn((_commands: unknown[], extras?: NavigationExtras) => {
      const next = { ...queryParams.value };
      for (const [key, value] of Object.entries(extras?.queryParams ?? {})) {
        if (value === null || value === undefined) {
          delete next[key];
        } else {
          next[key] = String(value);
        }
      }
      queryParams.next(next);
      return Promise.resolve(true);
    });

    await TestBed.configureTestingModule({
      imports: [
        GalleryComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate, url: '/gallery' } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParams.pipe(map(convertToParamMap)),
          },
        },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('draws the pictures in the studio own justified grid', async () => {
    await settle();

    // The grid, the tile and the picture are the studio's, reached through the
    // scope the page root carries; only the shape of each tile is this page's
    // to supply.
    expect(find('.gallery-page')?.classList.contains('gen-studio')).toBe(true);
    expect(find('.gallery-grid')?.classList.contains('gs-tile-grid')).toBe(
      true,
    );
    expect(
      all<HTMLElement>('.gallery-tile').map((tile) =>
        tile.style.getPropertyValue('--gs-tile-ar').trim(),
      ),
    ).toEqual(['1024/1024', '512/768', '1024/1024']);
    expect(all('.gs-tile-img')).toHaveLength(3);
  });

  it('draws every picture the manifest offers, censored ones excepted', async () => {
    await settle();

    expect(all('.gallery-tile')).toHaveLength(3);
    expect(el().textContent).not.toContain('lighthouse standing in a teacup');
    expect(text('.gallery-count')).toBe('3 pictures');
  });

  it('filters by tag, and says how many are left', async () => {
    await settle();

    chip('Whimsy').click();
    fixture.detectChanges();

    expect(component.tiles().map((tile) => tile.picture.id)).toEqual([
      'snail-cathedral',
      'tram-rainbow',
    ]);
    expect(text('.gallery-count')).toBe('2 pictures');

    chip('All').click();
    fixture.detectChanges();
    expect(all('.gallery-tile')).toHaveLength(3);
  });

  it('filters by model', async () => {
    await settle();

    const select = find<HTMLSelectElement>('.gallery-model-select')!;
    select.value = 'Realistic Vision';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.tiles().map((tile) => tile.picture.id)).toEqual([
      'fox-snow',
    ]);
    expect(text('.gallery-count')).toBe('1 picture');
  });

  it('opens a tile by putting the picture in the address', async () => {
    await settle();

    find<HTMLButtonElement>('.gallery-tile-press')!.click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { picture: 'snail-cathedral' },
        scroll: 'manual',
      }),
    );
    expect(find('app-gs-picture-dialog')).not.toBeNull();
    expect(text('.gs-picdlg-count')).toBe('1 of 3');
  });

  it('closes the picture without asking the router to scroll the gallery', async () => {
    await settle();
    component.openPicture('snail-cathedral');
    fixture.detectChanges();

    component.closePicture();
    fixture.detectChanges();

    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        queryParams: { picture: null },
        scroll: 'manual',
      }),
    );
    expect(find('app-gs-picture-dialog')).toBeNull();
  });

  it('walks the set in the order the filter left it', async () => {
    await settle();

    chip('Whimsy').click();
    fixture.detectChanges();
    find<HTMLButtonElement>('.gallery-tile-press')!.click();
    fixture.detectChanges();
    expect(text('.gs-picdlg-count')).toBe('1 of 2');

    component.step(1);
    fixture.detectChanges();
    expect(component.open()?.picture.id).toBe('tram-rainbow');
    expect(text('.gs-picdlg-count')).toBe('2 of 2');
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        queryParams: { picture: 'tram-rainbow' },
        scroll: 'manual',
      }),
    );

    // The ends join, so the arrows never run out under the reader's hand.
    component.step(1);
    fixture.detectChanges();
    expect(component.open()?.picture.id).toBe('snail-cathedral');
  });

  it('opens the picture an address names as soon as the manifest lands', async () => {
    queryParams.next({ picture: 'fox-snow' });
    fixture.detectChanges();
    expect(find('app-gs-picture-dialog')).toBeNull();

    await settle();

    expect(component.open()?.picture.id).toBe('fox-snow');
    expect(find('app-gs-picture-dialog')).not.toBeNull();
  });

  it('never opens a picture the manifest lists as censored', async () => {
    queryParams.next({ picture: 'teacup-pool' });
    await settle();

    expect(component.open()).toBeNull();
    expect(find('app-gs-picture-dialog')).toBeNull();
  });

  it('says so plainly when the gallery cannot be reached, and retries', async () => {
    await settle(true);

    expect(el().textContent).toContain('The gallery could not be loaded.');
    expect(all('.gallery-tile')).toHaveLength(0);

    find<HTMLButtonElement>('.hd-btn--tonal')!.click();
    await settle();

    expect(all('.gallery-tile')).toHaveLength(3);
  });
});
