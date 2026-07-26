import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlchemyComponent } from './alchemy.component';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
import { clientAgentInterceptor } from '../../services/interceptors/client-agent.interceptor';
import { API_BASE } from '../../testing/api-test-helpers';
import { AlchemyFormName } from '../../types/generation';
import {
  formsProgressLabel,
  isJobSettled,
} from '../../helper/alchemy-job-view';

describe('AlchemyComponent', () => {
  let fixture: ComponentFixture<AlchemyComponent>;
  let component: AlchemyComponent;
  let http: HttpTestingController;
  let toastSuccess: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let getStoredApiKey: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // The component reads persisted UI preferences during construction, so no
    // test may inherit another's stored view mode / density.
    localStorage.clear();
    toastSuccess = vi.fn();
    toastError = vi.fn();
    getStoredApiKey = vi.fn(() => 'my-key');

    await TestBed.configureTestingModule({
      imports: [AlchemyComponent],
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { getStoredApiKey, isLoggedIn: signal(false) },
        },
        {
          provide: ToastService,
          useValue: { success: toastSuccess, error: toastError },
        },
        { provide: TranslatorService, useValue: { get: () => signal('') } },
      ],
    })
      .overrideComponent(AlchemyComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(AlchemyComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const select = (...forms: AlchemyFormName[]): void => {
    for (const f of forms) component.toggleForm(f);
  };

  describe('api modal', () => {
    it('opens and closes the API request preview', () => {
      expect(component.apiModalOpen()).toBe(false);
      component.openApi();
      expect(component.apiModalOpen()).toBe(true);
      component.closeApi();
      expect(component.apiModalOpen()).toBe(false);
    });

    it('previews the request body built from the current selection', () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption', 'nsfw');

      const payload = JSON.parse(component.apiPayload());
      expect(payload).toEqual({
        forms: [{ name: 'caption' }, { name: 'nsfw' }],
        source_image: 'https://example.com/i.png',
        slow_workers: true,
      });
    });
  });

  describe('panel size', () => {
    it('cycles normal -> double -> full -> normal on each toggle', () => {
      expect(component.panelSize()).toBe('normal');
      component.cyclePanel();
      expect(component.panelSize()).toBe('double');
      component.cyclePanel();
      expect(component.panelSize()).toBe('full');
      component.cyclePanel();
      expect(component.panelSize()).toBe('normal');
    });
  });

  describe('collapsible groups', () => {
    it('starts expanded and toggles a group closed then open', () => {
      expect(component.isGroupCollapsed('upscale')).toBe(false);
      component.toggleGroup('upscale');
      expect(component.isGroupCollapsed('upscale')).toBe(true);
      expect(component.isGroupCollapsed('analyze')).toBe(false);
      component.toggleGroup('upscale');
      expect(component.isGroupCollapsed('upscale')).toBe(false);
    });
  });

  describe('canSubmit', () => {
    it('is false without an image or forms', () => {
      expect(component.canSubmit()).toBe(false);
    });

    it('is false with an image but no forms', () => {
      component.onSourceImage('https://example.com/i.png');
      expect(component.canSubmit()).toBe(false);
    });

    it('is true with an image and at least one form', () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption');
      expect(component.canSubmit()).toBe(true);
    });
  });

  describe('toggleForm', () => {
    it('adds and removes a form', () => {
      select('caption');
      expect(component.isFormSelected('caption')).toBe(true);
      select('caption');
      expect(component.isFormSelected('caption')).toBe(false);
    });
  });

  describe('submit', () => {
    it('POSTs the request and tracks the returned job', () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption', 'nsfw');

      component.submit();

      const req = http.expectOne(`${API_BASE}/interrogate/async`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      expect(req.request.body).toEqual({
        forms: [{ name: 'caption' }, { name: 'nsfw' }],
        source_image: 'https://example.com/i.png',
        slow_workers: true,
      });
      req.flush({ id: 'job-1' });

      expect(component.jobs().length).toBe(1);
      expect(component.jobs()[0].id).toBe('job-1');
      expect(toastSuccess).toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(false);
    });

    it('falls back to the anonymous API key when not logged in', () => {
      getStoredApiKey.mockReturnValue(null);
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      component.submit();

      const req = http.expectOne(`${API_BASE}/interrogate/async`);
      expect(req.request.headers.get('apikey')).toBe('0000000000');
      req.flush({ id: 'job-anon' });
    });

    it('shows an error toast on failure and does not track a job', () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      component.submit();

      http
        .expectOne(`${API_BASE}/interrogate/async`)
        .flush('Bad request', { status: 400, statusText: 'Bad Request' });

      expect(toastError).toHaveBeenCalled();
      expect(component.jobs().length).toBe(0);
    });

    it('does nothing when there is no image', () => {
      select('caption');
      component.submit();
      http.expectNone(`${API_BASE}/interrogate/async`);
      expect(component.jobs().length).toBe(0);
    });
  });

  describe('polling', () => {
    function trackJob(id: string): void {
      component.onSourceImage('https://example.com/i.png');
      select('caption');
      component.submit();
      http.expectOne(`${API_BASE}/interrogate/async`).flush({ id });
      // reset the form selection for clarity
      select('caption');
    }

    it('updates a job from the status endpoint and marks it done', () => {
      trackJob('job-2');

      (component as unknown as { pollJobs(): void }).pollJobs();

      http.expectOne(`${API_BASE}/interrogate/status/job-2`).flush({
        state: 'done',
        forms: [{ form: 'caption', state: 'done', result: { caption: 'hi' } }],
      });

      const job = component.jobs()[0];
      expect(job.done).toBe(true);
      expect(isJobSettled(job)).toBe(true);
      expect(formsProgressLabel(job)).toBe('1/1');
    });

    it('marks a job not found on 404', () => {
      trackJob('job-404');

      (component as unknown as { pollJobs(): void }).pollJobs();

      http
        .expectOne(`${API_BASE}/interrogate/status/job-404`)
        .flush('gone', { status: 404, statusText: 'Not Found' });

      expect(component.jobs()[0].notFound).toBe(true);
    });

    it('does not poll settled jobs', () => {
      trackJob('job-3');
      (component as unknown as { pollJobs(): void }).pollJobs();
      http.expectOne(`${API_BASE}/interrogate/status/job-3`).flush({
        state: 'done',
        forms: [{ form: 'caption', state: 'done', result: { caption: 'x' } }],
      });

      (component as unknown as { pollJobs(): void }).pollJobs();
      http.expectNone(`${API_BASE}/interrogate/status/job-3`);
      expect(component.jobs()[0].done).toBe(true);
    });
  });

  describe('results browser', () => {
    function track(id: string): void {
      component.onSourceImage('https://example.com/i.png');
      select('caption');
      component.submit();
      http.expectOne(`${API_BASE}/interrogate/async`).flush({ id });
      select('caption');
    }

    it('auto-selects the newest tracked request', () => {
      track('job-a');
      expect(component.selectedJobId()).toBe('job-a');
      track('job-b');
      expect(component.selectedJobId()).toBe('job-b');
    });

    it('shows a picked job in place on wide viewports', () => {
      track('job-a');
      track('job-b');
      component.selectJob('job-a');
      expect(component.selectedJobId()).toBe('job-a');
      expect(component.viewMode()).toBe('detail');
    });

    it('only changes the selection when a job is picked on narrow viewports', () => {
      track('job-a');
      track('job-b');
      component.isNarrow.set(true);
      component.selectJob('job-a');
      expect(component.selectedJobId()).toBe('job-a');
      expect(component.viewMode()).toBe('detail');
    });

    it.each([true, false])(
      'leaves the gallery for the detail view on a tile pick (narrow: %s)',
      (narrow) => {
        track('job-a');
        component.isNarrow.set(narrow);
        component.setViewMode('gallery');

        component.selectJob('job-a');

        expect(component.viewMode()).toBe('detail');
        expect(component.selectedJobId()).toBe('job-a');
      },
    );

    it('toggles between detail and gallery view', () => {
      expect(component.viewMode()).toBe('detail');
      component.setViewMode('gallery');
      expect(component.viewMode()).toBe('gallery');
      component.setViewMode('detail');
      expect(component.viewMode()).toBe('detail');
    });

    it('persists the view mode and restores a valid stored value', () => {
      component.setViewMode('gallery');
      expect(localStorage.getItem('aihorde.alchemy.view')).toContain('gallery');

      const internals = component as unknown as {
        loadViewMode(): 'detail' | 'gallery';
      };
      expect(internals.loadViewMode()).toBe('gallery');
    });

    it('falls back to the detail view for a bogus stored value', () => {
      localStorage.setItem('aihorde.alchemy.view', JSON.stringify('nonsense'));
      const internals = component as unknown as {
        loadViewMode(): 'detail' | 'gallery';
      };
      expect(internals.loadViewMode()).toBe('detail');
    });

    it('persists and clamps gallery column density', () => {
      component.setGalleryColumns(5);
      expect(component.galleryColumns()).toBe(5);
      component.setGalleryColumns(99);
      expect(component.galleryColumns()).toBe(6);
      component.setGalleryColumns(0);
      expect(component.galleryColumns()).toBe(2);
    });

    it('reassigns the shown job after the selected one is deleted', () => {
      track('job-a');
      track('job-b');
      expect(component.selectedJobId()).toBe('job-b');

      component.toggleSelectMode();
      component.toggleJobSelected('job-b');
      component.requestDeleteSelected();
      component.confirmDelete();

      expect(component.jobs().map((j) => j.id)).toEqual(['job-a']);
      expect(component.selectedJobId()).toBe('job-a');
    });
  });

  describe('persistence', () => {
    const STORAGE_KEY = 'aihorde.alchemy.recent_jobs';

    interface JobInternals {
      restoreJobs(): void;
      persistJobs(jobs: unknown[]): void;
      pruneStaleJobs(): void;
      restored: boolean;
    }

    const internals = (): JobInternals => component as unknown as JobInternals;

    const makeJob = (id: string, ageMs: number): Record<string, unknown> => ({
      id,
      forms: ['caption'] as AlchemyFormName[],
      status: null,
      done: false,
      faulted: false,
      cancelled: false,
      notFound: false,
      firstSeenAt: Date.now() - ageMs,
    });

    beforeEach(() => {
      localStorage.clear();
    });

    it('restores fresh jobs, drops stale ones, and selects the newest', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([makeJob('fresh', 1000), makeJob('stale', 41 * 60_000)]),
      );

      internals().restoreJobs();

      expect(component.jobs().map((j) => j.id)).toEqual(['fresh']);
      expect(component.selectedJobId()).toBe('fresh');
    });

    it('normalizes a legacy job with no source thumbnail to null', () => {
      // makeJob() omits sourceThumb, mimicking a job stored before the field.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([makeJob('legacy', 1000)]),
      );

      internals().restoreJobs();

      expect(component.jobs()[0].sourceThumb).toBeNull();
    });

    it('does not persist before a restore has run', () => {
      internals().persistJobs([makeJob('a', 1000)]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('persists only fresh jobs once restored', () => {
      internals().restored = true;
      internals().persistJobs([
        makeJob('a', 1000),
        makeJob('old', 41 * 60_000),
      ]);

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as {
        id: string;
      }[];
      expect(saved.map((j) => j.id)).toEqual(['a']);
    });

    it('clears storage when nothing fresh remains', () => {
      internals().restored = true;
      localStorage.setItem(STORAGE_KEY, 'placeholder');

      internals().persistJobs([makeJob('old', 41 * 60_000)]);

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('prunes stale jobs from the live list', () => {
      component.jobs.set([
        makeJob('fresh', 1000),
        makeJob('stale', 41 * 60_000),
      ] as never);

      internals().pruneStaleJobs();

      expect(component.jobs().map((j) => j.id)).toEqual(['fresh']);
    });
  });

  describe('cancelJob', () => {
    it('DELETEs and marks the job cancelled', () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption');
      component.submit();
      http.expectOne(`${API_BASE}/interrogate/async`).flush({ id: 'job-c' });

      component.cancelJob('job-c');

      const req = http.expectOne(`${API_BASE}/interrogate/status/job-c`);
      expect(req.request.method).toBe('DELETE');
      req.flush({
        state: 'partial',
        forms: [{ form: 'caption', state: 'cancelled' }],
      });

      const job = component.jobs()[0];
      expect(job.cancelled).toBe(true);
      expect(isJobSettled(job)).toBe(true);
    });
  });
});
