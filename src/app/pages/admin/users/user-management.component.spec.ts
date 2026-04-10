import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { UserManagementComponent } from './user-management.component';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminUserService } from '../../../services/admin-user.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { AiHordeService } from '../../../services/ai-horde.service';
import { FloatingActionService } from '../../../services/floating-action.service';
import { ToastService } from '../../../services/toast.service';
import { AdminUserDetails } from '../../../types/horde-user-admin';

function makeAdminUser(
  overrides: Partial<AdminUserDetails> = {},
): AdminUserDetails {
  return {
    account_age: 100,
    concurrency: 2,
    contributions: {
      fulfillments: 0,
      megapixelsteps: 0,
    },
    evaluating_kudos: 0,
    flagged: false,
    id: 123,
    kudos: 100,
    kudos_details: {
      accumulated: 0,
      gifted: 0,
      admin: 0,
      received: 0,
      recurring: 0,
      awarded: 0,
    },
    moderator: false,
    monthly_kudos: {
      amount: 0,
      last_received: '',
    },
    pseudonymous: false,
    suspicious: 0,
    trusted: false,
    usage: {
      requests: 0,
      megapixelsteps: 0,
    },
    username: 'test-user',
    worker_count: 0,
    worker_invited: 0,
    ...overrides,
  };
}

describe('UserManagementComponent', () => {
  let fixture: ComponentFixture<UserManagementComponent>;
  let component: UserManagementComponent;

  const mockTranslator = {
    translate: vi.fn((key: string) => key),
  };

  const mockAuth = {
    currentUser: signal(null),
    isLoading: signal(false),
    isLoggedIn: signal(false),
    isInitialized: signal(true),
  };

  const mockUserService = {
    getUser: vi.fn().mockReturnValue(of(null)),
    searchUsers: vi.fn().mockReturnValue(of([])),
    updateUser: vi.fn().mockReturnValue(of(null)),
    resetSuspicion: vi.fn().mockReturnValue(of(null)),
    getSharedKeysByIds: vi.fn().mockReturnValue(of([])),
  };

  const mockWorkerService = {
    getWorkersByIds: vi.fn().mockReturnValue(of([])),
  };

  const mockAiHorde = {
    getImageGenerationStatus: vi.fn().mockReturnValue(of(null)),
    getTextGenerationStatus: vi.fn().mockReturnValue(of(null)),
    getAlchemyStatus: vi.fn().mockReturnValue(of(null)),
  };

  const mockFloatingActions = {
    register: vi.fn(),
    unregister: vi.fn(),
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        UserManagementComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({}),
            snapshot: { paramMap: { get: () => null } },
          },
        },
        { provide: TranslatorService, useValue: mockTranslator },
        { provide: AuthService, useValue: mockAuth },
        { provide: AdminUserService, useValue: mockUserService },
        { provide: AdminWorkerService, useValue: mockWorkerService },
        { provide: AiHordeService, useValue: mockAiHorde },
        { provide: FloatingActionService, useValue: mockFloatingActions },
        { provide: ToastService, useValue: mockToast },
      ],
    })
      .overrideComponent(UserManagementComponent, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns preview ids when active generation list is collapsed', () => {
    const imageIds = Array.from({ length: 15 }, (_, index) => `img-${index}`);

    component.selectedUser.set(
      makeAdminUser({
        active_generations: {
          image: imageIds,
          text: [],
          alchemy: [],
        },
      }),
    );

    expect(component.activeGenerationIdsTotal('image')).toBe(15);
    expect(component.hasExpandableActiveGenerationIds('image')).toBe(true);
    expect(component.hiddenActiveGenerationCount('image')).toBe(5);
    expect(component.getVisibleActiveGenerationIds('image')).toEqual(
      imageIds.slice(0, 10),
    );
  });

  it('returns all ids after expanding the list', () => {
    const textIds = Array.from({ length: 12 }, (_, index) => `txt-${index}`);

    component.selectedUser.set(
      makeAdminUser({
        active_generations: {
          image: [],
          text: textIds,
          alchemy: [],
        },
      }),
    );

    component.toggleActiveGenerationIdsExpansion('text');

    expect(component.isActiveGenerationIdsExpanded('text')).toBe(true);
    expect(component.isActiveGenerationIdsExpanded('image')).toBe(false);
    expect(component.getVisibleActiveGenerationIds('text')).toEqual(textIds);
  });

  it('returns zero hidden count when list does not exceed preview size', () => {
    const alchemyIds = Array.from({ length: 3 }, (_, index) => `alc-${index}`);

    component.selectedUser.set(
      makeAdminUser({
        active_generations: {
          image: [],
          text: [],
          alchemy: alchemyIds,
        },
      }),
    );

    expect(component.hasExpandableActiveGenerationIds('alchemy')).toBe(false);
    expect(component.hiddenActiveGenerationCount('alchemy')).toBe(0);
    expect(component.getVisibleActiveGenerationIds('alchemy')).toEqual(
      alchemyIds,
    );
  });

  it('copyActiveGenerationId stores copied id and clears it after timeout', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyActiveGenerationId('img-copy');

    expect(writeText).toHaveBeenCalledWith('img-copy');
    expect(component.copiedActiveGenerationId()).toBe('img-copy');

    vi.advanceTimersByTime(2000);

    expect(component.copiedActiveGenerationId()).toBeNull();
  });

  it('copyActiveGenerationId leaves copied state unchanged when copy fails', async () => {
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
    const execSpy = vi.spyOn(doc, 'execCommand').mockReturnValue(false);
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    component.copiedActiveGenerationId.set('existing-id');

    await component.copyActiveGenerationId('img-copy');

    expect(component.copiedActiveGenerationId()).toBe('existing-id');
    expect(execSpy).toHaveBeenCalledWith('copy');
  });

  it('resets active-generation UI state whenever selected user is replaced', () => {
    component.expandedActiveGenerationTypes.set({
      image: true,
      text: true,
      alchemy: true,
    });
    component.copiedActiveGenerationId.set('img-123');

    (
      component as unknown as {
        setSelectedUser: (user: AdminUserDetails) => void;
      }
    ).setSelectedUser(makeAdminUser({ id: 777, username: 'new-user' }));

    expect(component.expandedActiveGenerationTypes()).toEqual({
      image: false,
      text: false,
      alchemy: false,
    });
    expect(component.copiedActiveGenerationId()).toBeNull();
  });
});
