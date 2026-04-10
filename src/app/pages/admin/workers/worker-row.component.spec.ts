import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { WorkerRowComponent } from './worker-row.component';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import {
  SynthesizedUnit,
  UnitConversionService,
} from '../../../services/unit-conversion.service';
import { HordeWorker } from '../../../types/horde-worker';

function makeWorker(overrides: Partial<HordeWorker> = {}): HordeWorker {
  return {
    type: 'image',
    name: 'WorkerOne',
    id: 'worker-1',
    online: true,
    requests_fulfilled: 12,
    kudos_rewards: 34,
    performance: '1.5 megapixelsteps per second',
    threads: 2,
    uptime: 100,
    maintenance_mode: false,
    paused: false,
    nsfw: false,
    trusted: false,
    flagged: false,
    suspicious: 0,
    uncompleted_jobs: 1,
    bridge_agent: 'agent',
    ...overrides,
  };
}

describe('WorkerRowComponent', () => {
  let fixture: ComponentFixture<WorkerRowComponent>;
  let component: WorkerRowComponent;

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  };

  const mockAuth = {
    currentUser: signal(null),
    isLoggedIn: signal(false),
    isInitialized: signal(true),
  };

  const imageUnit: SynthesizedUnit = {
    value: 1.5,
    unit: 'MPS',
    precision: 1,
  };

  const textUnit: SynthesizedUnit = {
    value: 5,
    unit: 'TPS',
    precision: 1,
  };

  const mockUnitConversion = {
    parseWorkerPerformance: vi.fn(() => 1.5),
    formatWorkerPerformanceImage: vi.fn(() => imageUnit),
    formatWorkerPerformanceText: vi.fn(() => textUnit),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [WorkerRowComponent],
      providers: [
        { provide: ToastService, useValue: mockToast },
        { provide: AuthService, useValue: mockAuth },
        { provide: UnitConversionService, useValue: mockUnitConversion },
      ],
    })
      .overrideComponent(WorkerRowComponent, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(WorkerRowComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('worker', makeWorker());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('copyName stops row click and shows success toast when copy works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const stopPropagation = vi.fn();

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyName({ stopPropagation } as unknown as Event);

    expect(stopPropagation).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('WorkerOne');
    expect(mockToast.success).toHaveBeenCalledWith(
      'admin.workers.toast.name_copied',
      {
        transloco: true,
        messageParams: { name: 'WorkerOne' },
      },
    );
  });

  it('copyId stops row click and skips toast when copy fails', async () => {
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
    const stopPropagation = vi.fn();

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyId({ stopPropagation } as unknown as Event);

    expect(stopPropagation).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('worker-1');
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});
