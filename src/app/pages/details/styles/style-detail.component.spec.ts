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
    });

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
    });

    await component.copyToClipboard('style-999');

    expect(writeText).toHaveBeenCalledWith('style-999');
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to copy style details to clipboard.',
    );
  });
});

const STYLE_ID = '11111111-2222-3333-4444-555555555555';

const IMAGE_STYLE: ImageStyle = {
  id: STYLE_ID,
  name: 'Watercolour',
  prompt: '{p}, watercolour ### {np}',
  public: true,
  nsfw: false,
  use_count: 3,
  creator: 'somebody#1',
  examples: [],
};

async function createDetail(
  routeStyleId: string,
  styleService: Record<string, unknown>,
  user: { id: number; username: string } | null = null,
  type: 'image' | 'text' = 'image',
) {
  TestBed.resetTestingModule();
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
          params: of({ type, styleId: routeStyleId }),
          snapshot: { params: { type, styleId: routeStyleId } },
        },
      },
      { provide: StyleService, useValue: styleService },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal(user),
          isLoggedIn: signal(user !== null),
          isInitialized: signal(true),
        },
      },
    ],
  }).compileComponents();

  const detail = TestBed.createComponent(StyleDetailComponent);
  detail.detectChanges();
  return detail;
}

describe('StyleDetailComponent link into the studio', () => {
  it('offers an image style a way into the studio, by its id', async () => {
    const detail = await createDetail(STYLE_ID, {
      getImageStyle: vi.fn().mockReturnValue(of(IMAGE_STYLE)),
      getImageStyleByName: vi.fn(),
      getTextStyle: vi.fn().mockReturnValue(of(null)),
      getTextStyleByName: vi.fn(),
    });

    const link = detail.nativeElement.querySelector(
      'a[href^="/generate/image"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      `/generate/image?styleId=${STYLE_ID}`,
    );
    expect(link?.textContent?.trim()).toBe('Use this style');
  });

  it('asks the horde by name when the address carries one', async () => {
    const getImageStyle = vi.fn();
    const getImageStyleByName = vi.fn().mockReturnValue(of(IMAGE_STYLE));

    const detail = await createDetail('Watercolour', {
      getImageStyle,
      getImageStyleByName,
      getTextStyle: vi.fn(),
      getTextStyleByName: vi.fn(),
    });

    expect(getImageStyleByName).toHaveBeenCalledWith('Watercolour');
    expect(getImageStyle).not.toHaveBeenCalled();
    expect(detail.componentInstance.style()?.name).toBe('Watercolour');
  });

  it('offers the owner the editor beside the delete action', async () => {
    const detail = await createDetail(
      STYLE_ID,
      {
        getImageStyle: vi.fn().mockReturnValue(of(IMAGE_STYLE)),
        getImageStyleByName: vi.fn(),
        getTextStyle: vi.fn(),
        getTextStyleByName: vi.fn(),
      },
      { id: 1, username: 'somebody' },
    );

    const link = detail.nativeElement.querySelector(
      'a[href^="/profile/styles"]',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe(
      `/profile/styles?editId=${STYLE_ID}&type=image`,
    );
  });
});

describe('StyleDetailComponent parameters', () => {
  const withParams = (params: Record<string, unknown>) => ({
    ...IMAGE_STYLE,
    params,
  });

  it('leaves the flags out when the style turns none of them on', async () => {
    const detail = await createDetail(STYLE_ID, {
      getImageStyle: vi
        .fn()
        .mockReturnValue(of(withParams({ steps: 4, karras: false }))),
      getImageStyleByName: vi.fn(),
      getTextStyle: vi.fn(),
      getTextStyleByName: vi.fn(),
    });

    expect(
      detail.nativeElement.querySelector('.style-detail-param-flags'),
    ).toBeNull();
  });

  it('names the flags a style turns on', async () => {
    const detail = await createDetail(STYLE_ID, {
      getImageStyle: vi
        .fn()
        .mockReturnValue(of(withParams({ steps: 4, karras: true }))),
      getImageStyleByName: vi.fn(),
      getTextStyle: vi.fn(),
      getTextStyleByName: vi.fn(),
    });

    const flags = detail.nativeElement.querySelector(
      '.style-detail-param-flags',
    ) as HTMLElement | null;
    expect(flags?.textContent).toContain('Karras');
  });

  it('tells a reader a text style has no way into the studio', async () => {
    const textStyle = {
      id: STYLE_ID,
      name: 'Storyteller',
      prompt: '{p} ### {np}',
      public: true,
      nsfw: false,
      use_count: 3,
      creator: 'somebody#1',
      params: { temperature: 0.8, singleline: false },
    };

    const detail = await createDetail(
      STYLE_ID,
      {
        getImageStyle: vi.fn(),
        getImageStyleByName: vi.fn(),
        getTextStyle: vi.fn().mockReturnValue(of(textStyle)),
        getTextStyleByName: vi.fn(),
      },
      null,
      'text',
    );

    expect(
      detail.nativeElement.querySelector('a[href^="/generate/image"]'),
    ).toBeNull();
    const note = detail.nativeElement.querySelector(
      '.style-detail-no-studio',
    ) as HTMLElement | null;
    expect(note?.textContent).toContain('cannot be opened in the studio');
    expect(
      detail.nativeElement.querySelector('.style-detail-param-flags'),
    ).toBeNull();
  });
});
