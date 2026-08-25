import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import { ModelsListComponent } from './models-list.component';
import { AiHordeService } from '../../../services/ai-horde.service';
import { TranslatorService } from '../../../services/translator.service';

describe('ModelsListComponent', () => {
  let fixture: ComponentFixture<ModelsListComponent>;

  beforeEach(async () => {
    // The list's scroll fade watches its element, which jsdom has no observer
    // for; nothing here depends on the measurement it would take.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        public observe(): void {
          /* nothing to measure */
        }
        public unobserve(): void {
          /* nothing to measure */
        }
        public disconnect(): void {
          /* nothing to measure */
        }
      },
    );

    await TestBed.configureTestingModule({
      imports: [
        ModelsListComponent,
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
          provide: AiHordeService,
          useValue: {
            getImageModels: () =>
              of([
                {
                  name: 'Deliberate',
                  count: 4,
                  queued: 0,
                  jobs: 0,
                  eta: 0,
                  performance: 0,
                  type: 'image',
                },
              ]),
            getTextModels: () => of([]),
          },
        },
        { provide: TranslatorService, useValue: { get: () => of('') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelsListComponent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers every model a way into the studio', () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      'a[href^="/generate/image"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/generate/image?model=Deliberate');
    expect(link?.textContent?.trim()).toBe('Try this model');
  });
});
