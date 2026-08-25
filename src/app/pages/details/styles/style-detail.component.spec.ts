import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../assets/i18n/en.json';
import { ImageStyle } from '../../../types/style';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { StyleDetailComponent } from './style-detail.component';
import { StyleService } from '../../../services/style.service';
import { AuthService } from '../../../services/auth.service';

describe('StyleDetailComponent', () => {
  let fixture: ComponentFixture<StyleDetailComponent>;
  let component: StyleDetailComponent;

  const mockRoute = {
    params: of({}),
    snapshot: { params: {} },
  };

  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  const mockStyleService = {
    getImageStyle: vi.fn().mockReturnValue(of(null)),
    getTextStyle: vi.fn().mockReturnValue(of(null)),
    deleteImageStyle: vi.fn().mockReturnValue(of(null)),
    deleteTextStyle: vi.fn().mockReturnValue(of(null)),
  };

  const mockAuth = {
    currentUser: signal(null),
    isLoggedIn: signal(false),
    isInitialized: signal(true),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StyleDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: StyleService, useValue: mockStyleService },
        { provide: AuthService, useValue: mockAuth },
      ],
    })
      .overrideComponent(StyleDetailComponent, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(StyleDetailComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('copyToClipboard does not log errors when copy succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* empty */
    });

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyToClipboard('style-123');

    expect(writeText).toHaveBeenCalledWith('style-123');
    expect(errorSpy).not.toHaveBeenCalledWith(
      'Failed to copy style details to clipboard.',
    );
  });

  it('copyToClipboard logs when copy fails', async () => {
    const doc = document as Document & {
      execCommand?: (commandId: string) => boolean;
    };

    if (!doc.execCommand) {
      Object.defineProperty(doc, 'execCommand', {
        value: () => false,
        configurable: true,
        writable: true,
      });
    }

    vi.spyOn(doc, 'execCommand').mockReturnValue(false);
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* empty */
    });

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyToClipboard('style-999');

    expect(writeText).toHaveBeenCalledWith('style-999');
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to copy style details to clipboard.',
    );
  });
});

describe('StyleDetailComponent link into the studio', () => {
  it('offers an image style a way into the studio', async () => {
    const style: ImageStyle = {
      id: 'style-1',
      name: 'Watercolour',
      prompt: '{p}, watercolour ### {np}',
      public: true,
      nsfw: false,
      use_count: 3,
      creator: 'somebody#1',
      examples: [],
    };

    await TestBed.configureTestingModule({
      imports: [
        StyleDetailComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ type: 'image', styleId: 'style-1' }),
            snapshot: { params: { type: 'image', styleId: 'style-1' } },
          },
        },
        {
          provide: StyleService,
          useValue: {
            getImageStyle: vi.fn().mockReturnValue(of(style)),
            getTextStyle: vi.fn().mockReturnValue(of(null)),
          },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser: signal(null),
            isLoggedIn: signal(false),
            isInitialized: signal(true),
          },
        },
      ],
    }).compileComponents();

    const detail = TestBed.createComponent(StyleDetailComponent);
    detail.detectChanges();

    const link = detail.nativeElement.querySelector(
      'a[href^="/generate/image"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      '/generate/image?style=Watercolour',
    );
    expect(link?.textContent?.trim()).toBe('Use this style');
  });
});
