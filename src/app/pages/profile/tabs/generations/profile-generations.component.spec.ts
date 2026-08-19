import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileGenerationsComponent } from './profile-generations.component';
import { GenerateComponent } from '../../../generate/generate.component';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { GenerationQueueService } from '../../../../services/generation-queue.service';
import { ToastService } from '../../../../services/toast.service';
import { TranslatorService } from '../../../../services/translator.service';
import { HordeStylesService } from '../../../../services/horde-styles.service';

describe('ProfileGenerationsComponent', () => {
  let fixture: ComponentFixture<ProfileGenerationsComponent>;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [ProfileGenerationsComponent],
      providers: [
        { provide: AiHordeService, useValue: { getImageModels: () => of([]) } },
        {
          provide: GenerationQueueService,
          useValue: {
            estimateKudos: () => Promise.resolve(0),
            enqueue: () => Promise.resolve('local-1'),
            jobs: signal([]),
            pendingJobs: signal([]),
            finishedJobs: signal([]),
          },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
        { provide: TranslatorService, useValue: { get: () => of('') } },
        {
          provide: HordeStylesService,
          useValue: {
            getStyles: () => of([]),
            getCategoryGroups: () => of([]),
          },
        },
      ],
    })
      // The canonical page is exercised by its own spec; here we only assert the
      // tab hosts it, so its template is stubbed to avoid pulling in its markup.
      .overrideComponent(GenerateComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ProfileGenerationsComponent);
    fixture.detectChanges();
  });

  it('renders the canonical generate page', () => {
    const generate = fixture.debugElement.query(
      By.directive(GenerateComponent),
    );
    expect(generate).not.toBeNull();
  });

  it('hosts the generate page in embedded mode', () => {
    const generate = fixture.debugElement.query(By.directive(GenerateComponent))
      .componentInstance as GenerateComponent;
    expect(generate.embedded()).toBe(true);
  });
});
