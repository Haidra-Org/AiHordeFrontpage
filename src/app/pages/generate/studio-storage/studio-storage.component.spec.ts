import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioStorageComponent } from './studio-storage.component';
import { AlchemyDbService } from '../../../services/alchemy-db.service';
import { AlchemyQueueService } from '../../../services/alchemy-queue.service';
import { GenerationDbService } from '../../../services/generation-db.service';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('StudioStorageComponent', () => {
  let fixture: ComponentFixture<StudioStorageComponent>;
  let component: StudioStorageComponent;
  let alchemyCount: ReturnType<typeof vi.fn>;
  let resultCount: ReturnType<typeof vi.fn>;
  let imageCount: ReturnType<typeof vi.fn>;
  let pictureCount: ReturnType<typeof vi.fn>;
  let clearAlchemy: ReturnType<typeof vi.fn>;
  let clearImages: ReturnType<typeof vi.fn>;

  async function build(estimate?: () => Promise<StorageEstimate>) {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: estimate ? { estimate } : undefined,
    });

    await TestBed.configureTestingModule({
      imports: [
        StudioStorageComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AlchemyDbService,
          useValue: { countJobs: alchemyCount, countResults: resultCount },
        },
        {
          provide: GenerationDbService,
          useValue: {
            countJobs: imageCount,
            countResultPictures: pictureCount,
          },
        },
        {
          provide: AlchemyQueueService,
          useValue: { clearHistory: clearAlchemy },
        },
        {
          provide: GenerationQueueService,
          useValue: { clearHistory: clearImages },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudioStorageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    alchemyCount = vi.fn().mockResolvedValue(3);
    resultCount = vi.fn().mockResolvedValue(5);
    imageCount = vi.fn().mockResolvedValue(7);
    pictureCount = vi.fn().mockResolvedValue(12);
    clearAlchemy = vi.fn().mockResolvedValue(undefined);
    clearImages = vi.fn().mockResolvedValue(undefined);
  });

  it('shows what each studio has stored', async () => {
    await build(() =>
      Promise.resolve({ usage: 340_000_000, quota: 2_000_000_000 }),
    );

    expect(component.alchemyCount()).toBe(3);
    expect(component.alchemyResultCount()).toBe(5);
    expect(component.imageCount()).toBe(7);
    expect(component.imagePictureCount()).toBe(12);
    expect(component.usedMb()).toBe(340);
    expect(component.quotaMb()).toBe(2000);
  });

  it('counts image generations by picture, and offers to clear requests that hold none', async () => {
    imageCount.mockResolvedValue(2);
    pictureCount.mockResolvedValue(0);
    await build();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('studio.storage.picture_count_other');
    const clearImage = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((button) =>
      button.textContent?.includes('studio.storage.clear_image'),
    );
    expect(clearImage?.disabled).toBe(false);
  });

  it('counts alchemy by result, and offers to clear requests that hold none', async () => {
    alchemyCount.mockResolvedValue(2);
    resultCount.mockResolvedValue(0);
    await build();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('studio.storage.result_count_other');
    const clearAlchemyButton = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((button) =>
      button.textContent?.includes('studio.storage.clear_alchemy'),
    );
    expect(clearAlchemyButton?.disabled).toBe(false);
  });

  it('names a single alchemy result in the singular', async () => {
    resultCount.mockResolvedValue(1);
    await build();

    expect(fixture.nativeElement.textContent).toContain(
      'studio.storage.result_count_one',
    );
  });

  it('leaves the usage line out when the browser will not report it', async () => {
    await build();

    expect(component.usedMb()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(
      'studio.storage.usage',
    );
  });

  it('clears alchemy behind its own confirmation, leaving image history alone', async () => {
    await build();

    component.requestClear('alchemy');
    expect(clearAlchemy).not.toHaveBeenCalled();

    await component.confirmClear();

    expect(clearAlchemy).toHaveBeenCalled();
    expect(clearImages).not.toHaveBeenCalled();
    expect(component.pendingClear()).toBeNull();
  });

  it('clears image history behind its own confirmation', async () => {
    await build();

    component.requestClear('image');
    await component.confirmClear();

    expect(clearImages).toHaveBeenCalled();
    expect(clearAlchemy).not.toHaveBeenCalled();
  });

  it('does nothing when the confirmation is dismissed', async () => {
    await build();

    component.requestClear('alchemy');
    component.cancelClear();
    await component.confirmClear();

    expect(clearAlchemy).not.toHaveBeenCalled();
  });

  it('re-reads the counts after a clear', async () => {
    await build();
    alchemyCount.mockResolvedValue(0);

    component.requestClear('alchemy');
    await component.confirmClear();

    expect(component.alchemyCount()).toBe(0);
    expect(component.imageCount()).toBe(7);
  });
});
