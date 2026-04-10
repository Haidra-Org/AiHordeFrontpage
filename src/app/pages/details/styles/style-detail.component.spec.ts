import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
