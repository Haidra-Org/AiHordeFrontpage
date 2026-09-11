import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { DocsControlTypesComponent } from './control-types.component';
import { ANNOTATION_DETECTOR_GROUPS } from '../../../content/alchemy-usecases';
import { environment } from '../../../../environments/environment';
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';

const TYPE_COUNT = ANNOTATION_DETECTOR_GROUPS.reduce(
  (total, group) => total + group.types.length,
  0,
);

describe('DocsControlTypesComponent', () => {
  let fixture: ComponentFixture<DocsControlTypesComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        DocsControlTypesComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocsControlTypesComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne(`${environment.evidenceBaseUrl}/index.json`)
      .flush(stubIndex);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('reads the modes in the groups and the order the picker offers them', () => {
    const headings = all('.gs-ref-maps-head').map((node) =>
      (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

    expect(headings.length).toBe(ANNOTATION_DETECTOR_GROUPS.length);
    expect(headings[0]).toContain('Edges and outlines');
    expect(headings.at(-1)).toContain('Colour and texture');
  });

  it('gives every group and every mode a place to be linked to', () => {
    for (const group of ANNOTATION_DETECTOR_GROUPS) {
      expect(el().querySelector(`#gs-ref-sec-${group.id}`)).not.toBeNull();
      for (const type of group.types) {
        expect(el().querySelector(`#gs-ref-ctl-${type}`)).not.toBeNull();
      }
    }
  });

  it('lays out one tile per mode the picker offers', () => {
    expect(all('.gs-ref-map').length).toBe(TYPE_COUNT);
    expect(TYPE_COUNT).toBe(33);
  });

  it('leaves the strength dial to the mode it belongs to', () => {
    // The dial is read per mode, inside the layer a tile opens, so the page
    // body carries none of its own.
    expect(all('app-gs-sweep-scrub').length).toBe(0);
  });

  it('leads with the one sentence that answers what a control type is', () => {
    const lead = el().querySelector('.gs-ref-lead')?.textContent ?? '';

    expect(lead).toContain('reads something different from your picture');
    // The rest of the introduction is a fold rather than a fourth paragraph
    // before the first picture, so the lead is one sentence long.
    expect(lead).not.toContain('three pictures');
  });

  it('keeps the rest of the introduction behind a fold that opens', () => {
    const toggle = el().querySelector<HTMLButtonElement>('.gs-tut-raw-toggle');

    expect(toggle?.textContent).toContain('Examples');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('#gs-ref-how-body')).toBeNull();

    toggle?.click();
    fixture.detectChanges();

    const body = el().querySelector('#gs-ref-how-body')?.textContent ?? '';

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(body).toContain('three pictures');
    expect(body).toContain('The strength examples show');
    // Each of those examples comes on more than one kind of picture, which is
    // the second choice a tile's layer offers.
    expect(body).toContain('a character, a building and a flat colour drawing');
    // What a control map is at all, which the lead no longer has room for.
    expect(body).toContain('A detector creates a control map');
  });

  it('offers the groups as contents aimed at the sections they name', () => {
    const entries = all<HTMLElement>('.gs-index-entry');

    expect(entries.length).toBe(ANNOTATION_DETECTOR_GROUPS.length);
    expect(entries[0].textContent).toContain('Edges and outlines');
    for (const group of ANNOTATION_DETECTOR_GROUPS) {
      expect(el().querySelector(`#gs-ref-sec-${group.id}`)).not.toBeNull();
    }
  });

  it('gives every published mode a way in that says what it opens', () => {
    // The stub publishes canny and openpose, so two tiles have somewhere to
    // go and the other thirty-one say nothing has been published for them.
    const doors = all<HTMLButtonElement>('.gs-ctl-more');

    expect(all('.gs-ref-map').length).toBe(33);
    expect(doors.length).toBe(all('.gs-ref-zoom').length);
    expect(doors[0].textContent).toContain('See more examples');
  });

  it('says nothing was published where the library has no example', () => {
    // The stub publishes canny and openpose, so every other mode keeps its
    // place and says that nothing has been published for it.
    expect(all('.gs-ref-zoom').length).toBe(2);
    expect(all('.gs-ref-map-gap').length).toBe(TYPE_COUNT - 2);
  });

  it('heads an opened mode with the name a reader would say aloud', () => {
    all<HTMLButtonElement>('.gs-ref-zoom')[0].click();
    fixture.detectChanges();

    // The tile carries the horde's own id and the layer says it as a name,
    // with the id kept beside it for the request that has to carry it.
    expect(el().querySelector('.gs-ctl-title')?.textContent?.trim()) //
      .toBe('Canny');
    expect(el().querySelector('.gs-ctl-id')?.textContent?.trim()).toBe('canny');
  });

  it('names hough on the mlsd tile rather than giving it one of its own', () => {
    const mlsd = el().querySelector('#gs-ref-ctl-mlsd');

    expect(el().querySelector('#gs-ref-ctl-hough')).toBeNull();
    expect(mlsd?.textContent).toContain('hough');
  });
});
