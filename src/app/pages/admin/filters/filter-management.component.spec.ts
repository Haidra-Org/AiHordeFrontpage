import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { Title } from '@angular/platform-browser';
import { FilterManagementComponent } from './filter-management.component';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminFilterService } from '../../../services/admin-filter.service';
import { ToastService } from '../../../services/toast.service';

describe('FilterManagementComponent', () => {
  let fixture: ComponentFixture<FilterManagementComponent>;
  let component: FilterManagementComponent;

  const mockTitle = {
    setTitle: vi.fn(),
  };

  const mockTranslator = {
    translate: vi.fn((key: string) => key),
  };

  const mockAuth = {
    currentUser: signal(null),
    isLoggedIn: signal(false),
    isInitialized: signal(true),
  };

  const mockFilterService = {
    getFilters: vi.fn().mockReturnValue(of([])),
    getCompiledRegex: vi.fn().mockReturnValue(of([])),
    createFilter: vi.fn().mockReturnValue(of(null)),
    updateFilter: vi.fn().mockReturnValue(of(null)),
    deleteFilter: vi.fn().mockReturnValue(of(null)),
    testPrompt: vi.fn().mockReturnValue(of({ suspicion: 0 })),
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [FilterManagementComponent],
      providers: [
        { provide: Title, useValue: mockTitle },
        { provide: TranslatorService, useValue: mockTranslator },
        { provide: AuthService, useValue: mockAuth },
        { provide: AdminFilterService, useValue: mockFilterService },
        { provide: ToastService, useValue: mockToast },
      ],
    })
      .overrideComponent(FilterManagementComponent, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(FilterManagementComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows success toast when copyToClipboard succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await Promise.resolve(component.copyToClipboard('filter-id-123'));

    expect(writeText).toHaveBeenCalledWith('filter-id-123');
    expect(mockToast.success).toHaveBeenCalledWith('Copied to clipboard.');
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('shows error toast when copyToClipboard fails', async () => {
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

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await Promise.resolve(component.copyToClipboard('filter-id-999'));

    expect(writeText).toHaveBeenCalledWith('filter-id-999');
    expect(mockToast.error).toHaveBeenCalledWith(
      'Failed to copy to clipboard.',
    );
  });
});
