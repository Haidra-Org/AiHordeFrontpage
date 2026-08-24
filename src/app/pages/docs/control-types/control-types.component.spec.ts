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

  it('says nothing was published where the library has no example', () => {
    // The stub publishes canny and openpose, so every other mode keeps its
    // place and says that nothing has been published for it.
    expect(all('.gs-ref-zoom').length).toBe(2);
    expect(all('.gs-ref-map-gap').length).toBe(TYPE_COUNT - 2);
  });

  it('names hough on the mlsd tile rather than giving it one of its own', () => {
    const mlsd = el().querySelector('#gs-ref-ctl-mlsd');

    expect(el().querySelector('#gs-ref-ctl-hough')).toBeNull();
    expect(mlsd?.textContent).toContain('hough');
  });
});
