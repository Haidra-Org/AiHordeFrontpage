import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, computed, signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlchemyComponent } from './alchemy.component';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
import { clientAgentInterceptor } from '../../services/interceptors/client-agent.interceptor';
import { API_BASE } from '../../testing/api-test-helpers';
import { AlchemyFormName } from '../../types/generation';
import { AlchemySubmitOutcome } from '../../services/alchemy-queue.service';
import { AlchemyJob, toAlchemyJob } from '../../helper/alchemy-job-view';
import { AlchemyQueueService } from '../../services/alchemy-queue.service';
import { StoredAlchemyImage, StoredAlchemyJob } from '../../types/alchemy-job';
import {
  ALCHEMY_USE_CASES,
  alchemyUseCaseForGroup,
} from '../../content/alchemy-usecases';
import { referenceTopic } from '../../content/reference-topics';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { StudioHandoffService } from '../../services/studio-handoff.service';
import { By, Title } from '@angular/platform-browser';
import { IconComponent } from '../../components/icon/icon.component';

/**
 * Stands in for the root queue so the page can be exercised without a database
 * or a poll loop. The queue's own behaviour is covered in its service spec.
 */
class FakeAlchemyQueue {
  public readonly stored = signal<StoredAlchemyJob[]>([]);
  public readonly imageWrites = signal(0);
  public readonly imagesVersion = computed(() => this.imageWrites());
  public readonly jobs: Signal<AlchemyJob[]> = computed(() =>
    this.stored().map(toAlchemyJob),
  );
  public readonly submit = vi.fn((input: { forms: string[] }) => {
    const id = `job-${this.stored().length + 1}`;
    this.add(id, input.forms as AlchemyFormName[]);
    return Promise.resolve<AlchemySubmitOutcome>({ kind: 'submitted', id });
  });
  public readonly cancel = vi.fn(() => Promise.resolve());
  public readonly deleteJobs = vi.fn((ids: readonly string[]) => {
    const doomed = new Set(ids);
    this.stored.update((jobs) => jobs.filter((j) => !doomed.has(j.localId)));
    return Promise.resolve();
  });
  public readonly getThumbnail = vi.fn(() => Promise.resolve(undefined));
  public readonly getSourceImage = vi.fn(() => Promise.resolve(undefined));
  public readonly getResultImages = vi.fn(() => Promise.resolve([]));
  public readonly getResultThumbs = vi.fn(() =>
    Promise.resolve<StoredAlchemyImage[]>([]),
  );
  public whenReady(): Promise<void> {
    return Promise.resolve();
  }

  public add(
    id: string,
    forms: AlchemyFormName[] = ['caption'],
    sourceMode: 'url' | 'upload' = 'url',
  ): void {
    const now = Date.now();
    this.stored.update((jobs) => [
      {
        localId: `local-${id}`,
        jobId: id,
        createdAt: now,
        updatedAt: now,
        forms,
        slowWorkers: true,
        sourceMode,
        sourceUrl:
          sourceMode === 'url' ? 'https://example.com/i.png' : undefined,
        status: null,
        done: false,
        faulted: false,
        cancelled: false,
        notFound: false,
        storedResultForms: [],
        failedResultForms: [],
      },
      ...jobs,
    ]);
  }
}

/**
 * Stands in for the browser's image loader, which jsdom never runs, so a source
 * reads as a 1024px square as soon as it is set.
 */
class SquarePicture {
  public readonly naturalWidth = 1024;
  public readonly naturalHeight = 1024;
  public onload: (() => void) | null = null;
  public set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** Let the page's promise chains off the queue settle. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('AlchemyComponent', () => {
  let fixture: ComponentFixture<AlchemyComponent>;
  let component: AlchemyComponent;
  let http: HttpTestingController;
  let toastSuccess: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let getStoredApiKey: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let queue: FakeAlchemyQueue;

  beforeEach(async () => {
    // The component reads persisted UI preferences during construction, so no
    // test may inherit another's stored view mode / density.
    localStorage.clear();
    toastSuccess = vi.fn();
    toastError = vi.fn();
    getStoredApiKey = vi.fn(() => 'my-key');
    navigate = vi.fn().mockResolvedValue(true);
    queue = new FakeAlchemyQueue();

    await TestBed.configureTestingModule({
      imports: [AlchemyComponent],
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
        { provide: AlchemyQueueService, useValue: queue },
        {
          provide: AuthService,
          useValue: { getStoredApiKey, isLoggedIn: signal(false) },
        },
        {
          provide: ToastService,
          useValue: { success: toastSuccess, error: toastError },
        },
        // The page-title effect subscribes to this, so it has to be a stream.
        { provide: TranslatorService, useValue: { get: () => of('') } },
        // The studio's routes are not loaded here, so the trip to the image
        // studio is watched rather than followed.
        { provide: Router, useValue: { navigate, url: '/alchemy' } },
      ],
    })
      .overrideComponent(AlchemyComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(AlchemyComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The page-wide performance poll fires whenever a render happens and is not
    // what any of these cases is about, so it is drained before the check for
    // requests the test itself left behind.
    for (const req of http.match(`${API_BASE}/status/performance`)) {
      req.flush(null);
    }
    http.verify();
  });

  const select = (...forms: AlchemyFormName[]): void => {
    for (const f of forms) component.toggleForm(f);
  };

  describe('developer surface', () => {
    it('starts on the tool and switches between surfaces', () => {
      expect(component.activeTab()).toBe('tool');
      component.setTab('developers');
      expect(component.activeTab()).toBe('developers');
      component.setTab('tool');
      expect(component.activeTab()).toBe('tool');
    });

    it('documents the live request body under the required headers', () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      const sample = component.devRequestSample();
      expect(sample).toContain('apikey: 0000000000');
      expect(sample).toContain('Content-Type: application/json');
      expect(sample).toContain(component.apiPayload());
    });
  });

  describe('request preview', () => {
    it('sends the API button to the documentation and the crumb back', () => {
      expect(component.activeTab()).toBe('tool');
      component.openApi();
      expect(component.activeTab()).toBe('developers');
      component.closeApi();
      expect(component.activeTab()).toBe('tool');
    });

    it('opens and closes the whole-request modal', () => {
      expect(component.fullPayloadOpen()).toBe(false);
      component.openFullPayload();
      expect(component.fullPayloadOpen()).toBe(true);
      component.closeFullPayload();
      expect(component.fullPayloadOpen()).toBe(false);
    });

    it('takes the request modal with it when the surface is left', () => {
      component.openApi();
      component.openFullPayload();

      component.closeApi();

      expect(component.fullPayloadOpen()).toBe(false);
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

    it('includes the selected detector in an annotation form payload', () => {
      component.onSourceImage('https://example.com/i.png');
      component.annotationControlTypes.set(['depth']);
      select('annotation');

      expect(JSON.parse(component.apiPayload()).forms).toEqual([
        { name: 'annotation', payload: { control_type: 'depth' } },
      ]);
    });

    it('sends one annotation form per detector, in the order picked', () => {
      component.onSourceImage('https://example.com/i.png');
      component.annotationControlTypes.set([]);
      component.toggleDetector('depth');
      component.toggleDetector('canny');
      select('annotation');

      expect(JSON.parse(component.apiPayload()).forms).toEqual([
        { name: 'annotation', payload: { control_type: 'depth' } },
        { name: 'annotation', payload: { control_type: 'canny' } },
      ]);
    });

    it('stands a placeholder in for the encoded image the picker hands over', () => {
      // The picker emits bare base64, never a data URL, so the elision cannot
      // be decided on a `data:` prefix.
      const base64 = 'UklGRuQ'.repeat(600);
      component.onSourceImage(base64);
      select('caption');

      expect(JSON.parse(component.apiPayload()).source_image).toBe('{base64}');
      expect(JSON.parse(component.apiPayloadFull()).source_image).toBe(base64);
      expect(component.apiPayload()).not.toContain(base64);
    });

    it('cuts a long source short for the modal and reports the real length', () => {
      const base64 = 'UklGRuQ'.repeat(600);
      component.onSourceImage(base64);
      select('caption');

      expect(component.apiPayloadTruncated()).toBe(true);
      const shown = JSON.parse(component.apiPayloadPreview())
        .source_image as string;
      expect(shown.length).toBeLessThan(base64.length);
      expect(base64.startsWith(shown.slice(0, -1))).toBe(true);
      expect(component.apiPayloadLength()).toBe(
        component.apiPayloadFull().length,
      );
    });

    it('shows a short source whole', () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      expect(component.apiPayloadTruncated()).toBe(false);
      expect(component.apiPayloadPreview()).toBe(component.apiPayloadFull());
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

    it('folds every family shut, then opens them all again', () => {
      expect(component.allGroupsCollapsed()).toBe(false);

      component.toggleAllGroups();
      expect(component.allGroupsCollapsed()).toBe(true);
      for (const group of component.operationGroups) {
        expect(component.isGroupCollapsed(group.id)).toBe(true);
      }

      component.toggleAllGroups();
      expect(component.allGroupsCollapsed()).toBe(false);
      for (const group of component.operationGroups) {
        expect(component.isGroupCollapsed(group.id)).toBe(false);
      }
    });

    it('collapses the rest once one family is already shut', () => {
      component.toggleGroup('upscale');
      component.toggleAllGroups();

      expect(component.allGroupsCollapsed()).toBe(true);
    });
  });

  describe('control-map detectors', () => {
    it('adds and removes a detector, keeping the order they were picked', () => {
      component.annotationControlTypes.set([]);
      component.toggleDetector('depth');
      component.toggleDetector('canny');
      expect(component.annotationControlTypes()).toEqual(['depth', 'canny']);

      component.toggleDetector('depth');
      expect(component.annotationControlTypes()).toEqual(['canny']);
    });

    it('takes a whole group, then drops it again', () => {
      const group = component.detectorGroups[0];
      component.annotationControlTypes.set([]);

      component.toggleDetectorGroup(group);
      expect(component.isGroupFullySelected(group)).toBe(true);
      expect(component.annotationControlTypes()).toEqual([...group.types]);

      component.toggleDetectorGroup(group);
      expect(component.annotationControlTypes()).toEqual([]);
    });

    it('refuses a control map with no detector picked', () => {
      component.onSourceImage('https://example.com/i.png');
      select('annotation');
      expect(component.canSubmit()).toBe(true);

      component.clearDetectors();
      expect(component.missingDetector()).toBe(true);
      expect(component.canSubmit()).toBe(false);
    });

    it('asks for no detector when no control map is requested', () => {
      component.onSourceImage('https://example.com/i.png');
      component.clearDetectors();
      select('caption');

      expect(component.missingDetector()).toBe(false);
      expect(component.canSubmit()).toBe(true);
    });
  });

  describe('operation cards and their notes', () => {
    it('offers every operation family the registry documents', () => {
      expect(component.operationGroups.map((group) => group.id)).toEqual(
        ALCHEMY_USE_CASES.map((useCase) => useCase.groupId),
      );
    });

    it('builds each group from the forms its use case can submit', () => {
      expect(component.operationGroups.map((group) => group.forms)).toEqual(
        component.operationGroups.map(
          (group) => alchemyUseCaseForGroup(group.id)?.operableForms,
        ),
      );
    });

    it('offers no control for a form the studio cannot submit', () => {
      const offered = component.operationGroups.flatMap((group) => [
        ...group.forms,
        ...(group.subGroups ?? []).flatMap((sub) => sub.forms),
      ]);
      const submittable = new Set<string>([
        ...component.dataForms,
        ...component.postProcessorForms,
        ...component.annotationForms,
      ]);

      expect(offered.filter((form) => !submittable.has(form))).toEqual([]);
    });

    it('renders every form of a split group in one of its sub-groups', () => {
      const split = component.operationGroups.filter(
        (group) => group.subGroups,
      );

      expect(split.length).toBeGreaterThan(0);
      expect(split.map((group) => [...group.forms].sort().join())).toEqual(
        split.map((group) =>
          [...(group.subGroups ?? []).flatMap((sub) => sub.forms)]
            .sort()
            .join(),
        ),
      );
    });

    it("points each card's note at an entry the reference can answer", () => {
      const subjects = component.operationGroups.map((group) =>
        referenceTopic(group.helpTopic),
      );

      expect(subjects.map((subject) => subject?.section)).toEqual(
        component.operationGroups.map(() => 'alchemy'),
      );
      expect(subjects.filter((subject) => !subject?.hasEntry)).toEqual([]);
    });

    it('takes the docked entry with it when the studio is left', () => {
      const dock = TestBed.inject(GsHelpDockService);
      dock.open(component.operationGroups[0].helpTopic);
      expect(dock.isOpen()).toBe(true);

      fixture.destroy();
      expect(dock.isOpen()).toBe(false);
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

  describe('image to prompt', () => {
    it('takes the pair it needs and leaves other picks alone', () => {
      select('nsfw');
      component.pickImageToPrompt();

      expect(component.isFormSelected('caption')).toBe(true);
      expect(component.isFormSelected('interrogation')).toBe(true);
      expect(component.isFormSelected('nsfw')).toBe(true);
      expect(component.promptFormsPicked()).toBe(true);
    });

    it('holds the dock on the press until another operation or detector takes it', () => {
      component.pickImageToPrompt();
      expect(component.imageToPromptFocused()).toBe(true);

      component.previewDetector('depth');
      expect(component.imageToPromptFocused()).toBe(false);

      component.previewImageToPrompt();
      expect(component.imageToPromptFocused()).toBe(true);
      expect(component.activeDetector()).toBeNull();

      select('nsfw');
      expect(component.imageToPromptFocused()).toBe(false);
    });

    it('carries the request it asked for to the results pane', async () => {
      component.onSourceImage('https://example.com/i.png');
      component.pickImageToPrompt();

      component.submit();
      await settle();

      expect(component.openDraftForJobId()).toBe('job-1');
    });

    it('leaves the next request alone', async () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      component.submit();
      await settle();

      expect(component.openDraftForJobId()).toBeNull();
    });
  });

  describe('submit', () => {
    it('hands the request to the queue and shows the new job', async () => {
      component.onSourceImage('https://example.com/i.png');
      select('caption', 'nsfw');

      component.submit();
      await settle();

      expect(queue.submit).toHaveBeenCalledWith({
        forms: ['caption', 'nsfw'],
        slowWorkers: true,
        source: 'https://example.com/i.png',
      });
      expect(component.jobs().length).toBe(1);
      expect(toastSuccess).toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(false);
    });

    it('says why when the horde refuses the request', async () => {
      queue.submit.mockResolvedValueOnce({
        kind: 'refused',
        error: { status: 429, message: 'Too many', rc: 'TooManyPrompts' },
      });
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      component.submit();
      await settle();

      expect(toastError).toHaveBeenCalledWith(
        'generate.reject.too_many_prompts',
        { transloco: true },
      );
      expect(component.jobs().length).toBe(0);
      expect(component.isSubmitting()).toBe(false);
    });

    it("quotes the horde's own sentence for a refusal it has no line for", async () => {
      queue.submit.mockResolvedValueOnce({
        kind: 'refused',
        error: { status: 403, message: 'Unsafe IP', rc: 'UntrustedUnsafeIP' },
      });
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      component.submit();
      await settle();

      expect(toastError).toHaveBeenCalledWith('alchemy.submit.refused', {
        transloco: true,
        messageParams: { reason: 'Unsafe IP' },
      });
    });

    it('keeps the generic line when the horde does not answer', async () => {
      queue.submit.mockResolvedValueOnce({
        kind: 'refused',
        error: { status: 0, message: 'Request failed' },
      });
      component.onSourceImage('https://example.com/i.png');
      select('caption');

      component.submit();
      await settle();

      expect(toastError).toHaveBeenCalledWith('alchemy.submit.error', {
        transloco: true,
      });
    });

    it('does nothing when there is no image', async () => {
      select('caption');
      component.submit();
      await settle();

      expect(queue.submit).not.toHaveBeenCalled();
      expect(component.jobs().length).toBe(0);
    });
  });

  describe('results browser', () => {
    function track(id: string): void {
      queue.add(id);
      component.selectJob(id);
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
      'stays in the gallery and opens the job over it on a tile pick (narrow: %s)',
      (narrow) => {
        track('job-a');
        component.isNarrow.set(narrow);
        component.setViewMode('gallery');
        expect(component.jobPaneOpen()).toBe(false);

        component.selectJob('job-a');

        expect(component.viewMode()).toBe('gallery');
        expect(component.selectedJobId()).toBe('job-a');
        expect(component.jobPaneOpen()).toBe(true);

        component.closeJobPane();
        expect(component.jobPaneOpen()).toBe(false);
        expect(component.viewMode()).toBe('gallery');
      },
    );

    it('opens the job over the table on a row pick', () => {
      track('job-a');
      component.setViewMode('table');
      component.selectJob('job-a');
      expect(component.viewMode()).toBe('table');
      expect(component.jobPaneOpen()).toBe(true);
    });

    it('sets the form up as a finished request was, for another image', () => {
      queue.add('job-a', ['caption', 'annotation']);
      const job: AlchemyJob = {
        ...component.jobs()[0],
        annotationControlTypes: ['canny', 'depth'],
      };
      component.onSourceImage('https://example.com/i.png');
      component.repeatRequest(job);
      expect([...component.selectedForms()]).toEqual(['caption', 'annotation']);
      expect(component.annotationControlTypes()).toEqual(['canny', 'depth']);
      expect(component.sourceImage()).toBeNull();
      expect(toastSuccess).toHaveBeenCalledWith(
        'alchemy.jobs.repeat_ready',
        expect.anything(),
      );
    });

    it('hands a caption to the image studio prompt and goes there', async () => {
      await component.sendToPrompt('a dog on a couch');
      // No mode, which is the join: a caption is material for the prompt over
      // there rather than the prompt itself, so it never clears the box.
      expect(TestBed.inject(StudioHandoffService).consume()).toEqual({
        prompt: 'a dog on a couch',
      });
      expect(navigate).toHaveBeenCalledWith(['/generate/image']);
    });

    it('holds a small copy of every stored result, keyed for the browser', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:thumb');
      URL.revokeObjectURL = vi.fn();
      queue.getResultThumbs.mockResolvedValue([
        {
          localId: 'local-job-a',
          imageId: 'thumb:RealESRGAN_x4plus',
          kind: 'result-thumb',
          blob: new Blob(['x'], { type: 'image/webp' }),
          mimeType: 'image/webp',
        },
      ]);
      queue.add('job-a', ['RealESRGAN_x4plus']);
      queue.stored.update((jobs) =>
        jobs.map((job) => ({
          ...job,
          storedResultForms: ['RealESRGAN_x4plus'],
        })),
      );
      fixture.detectChanges();
      await settle();
      expect(queue.getResultThumbs).toHaveBeenCalledWith('local-job-a');
      expect(
        component.resultThumbUrls().get('local-job-a::RealESRGAN_x4plus'),
      ).toBe('blob:thumb');
    });

    it('closes the job pane when the view changes', () => {
      track('job-a');
      component.setViewMode('gallery');
      component.selectJob('job-a');
      component.setViewMode('detail');
      expect(component.jobPaneOpen()).toBe(false);
    });

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

      expect(queue.deleteJobs).toHaveBeenCalledWith(['local-job-b']);
      expect(component.jobs().map((j) => j.id)).toEqual(['job-a']);
      expect(component.selectedJobId()).toBe('job-a');
    });
  });

  describe('stored source images', () => {
    it('holds one object URL per job thumbnail and gives it back with the job', async () => {
      const created: string[] = [];
      const revoked: string[] = [];
      URL.createObjectURL = vi.fn(() => {
        const url = `blob:thumb-${created.length}`;
        created.push(url);
        return url;
      });
      URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
      queue.getThumbnail.mockResolvedValue({
        localId: 'local-job-t',
        imageId: 'thumb',
        kind: 'thumb',
        blob: new Blob(['x']),
        mimeType: 'image/webp',
      } as never);

      queue.add('job-t', ['caption'], 'upload');
      fixture.detectChanges();
      await settle();

      expect(component.jobs()[0].sourceThumb).toBe('blob:thumb-0');

      await queue.deleteJobs(['local-job-t']);
      fixture.detectChanges();
      await settle();

      expect(revoked).toContain('blob:thumb-0');
    });

    it('picks the thumbnail up when it is written after the job appears', async () => {
      // The queue stores a submission's blobs just after the job itself, so the
      // page's first look finds nothing; it must not give up on that.
      URL.createObjectURL = vi.fn(() => 'blob:late');
      URL.revokeObjectURL = vi.fn();
      queue.getThumbnail.mockResolvedValue(undefined);

      queue.add('job-late', ['caption'], 'upload');
      fixture.detectChanges();
      await settle();

      expect(component.jobs()[0].sourceThumb).toBeNull();

      queue.getThumbnail.mockResolvedValue({
        localId: 'local-job-late',
        imageId: 'thumb',
        kind: 'thumb',
        blob: new Blob(['x']),
        mimeType: 'image/webp',
      } as never);
      queue.imageWrites.update((n) => n + 1);
      fixture.detectChanges();
      await settle();

      expect(component.jobs()[0].sourceThumb).toBe('blob:late');
    });

    it('reads nothing for a job whose source is a plain URL', async () => {
      queue.add('job-url');
      fixture.detectChanges();
      await settle();

      expect(queue.getThumbnail).not.toHaveBeenCalled();
      expect(queue.getSourceImage).not.toHaveBeenCalled();
      expect(component.jobs()[0].sourceThumb).toBe('https://example.com/i.png');
    });

    it('revokes everything it created when the page goes away', async () => {
      const revoked: string[] = [];
      URL.createObjectURL = vi.fn(() => 'blob:one');
      URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
      queue.getThumbnail.mockResolvedValue({
        localId: 'local-job-u',
        imageId: 'thumb',
        kind: 'thumb',
        blob: new Blob(['x']),
        mimeType: 'image/webp',
      } as never);

      queue.add('job-u', ['caption'], 'upload');
      fixture.detectChanges();
      await settle();

      fixture.destroy();

      expect(revoked).toContain('blob:one');
    });
  });

  describe('sending a result to the image studio', () => {
    const storedResult = (): unknown => ({
      localId: 'local-job-s',
      imageId: 'RealESRGAN_x4plus',
      kind: 'result',
      blob: new Blob(['x'], { type: 'image/webp' }),
      mimeType: 'image/webp',
    });

    it('parks the stored bytes and opens the image studio', async () => {
      const image = storedResult() as { blob: Blob };
      queue.getResultImages.mockResolvedValue([image] as never);
      queue.add('job-s');

      await component.useResultInStudio({
        job: component.jobs()[0],
        key: 'RealESRGAN_x4plus',
      });

      expect(TestBed.inject(StudioHandoffService).consume()).toEqual({
        blob: image.blob,
        mimeType: 'image/webp',
      });
      expect(navigate).toHaveBeenCalledWith(['/generate/image']);
    });

    it('says so rather than navigating when the bytes are gone', async () => {
      queue.getResultImages.mockResolvedValue([] as never);
      queue.add('job-s');

      await component.useResultInStudio({
        job: component.jobs()[0],
        key: 'RealESRGAN_x4plus',
      });

      expect(TestBed.inject(StudioHandoffService).has()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith(
        'alchemy.result.use_in_studio_failed',
        { transloco: true },
      );
    });
  });

  describe('tab title', () => {
    afterEach(() => {
      Reflect.deleteProperty(document, 'hidden');
    });

    it('counts the results of jobs that finished while the tab was away', () => {
      const translator = TestBed.inject(TranslatorService);
      vi.spyOn(translator, 'get').mockImplementation(
        (key: string, params?: Record<string, unknown>) =>
          of(params ? `${key}:${String(params['count'])}` : key),
      );
      queue.add('job-a', ['RealESRGAN_x4plus']);
      queue.add('job-b', ['RealESRGAN_x4plus', 'GFPGAN']);
      TestBed.tick();

      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      queue.stored.update((jobs) =>
        jobs.map((job) => ({
          ...job,
          done: true,
          status: {
            state: 'done',
            forms: job.forms.map((form) => ({ form, state: 'done' })),
          },
          storedResultForms: [...job.forms],
        })),
      );
      TestBed.tick();

      expect(component.finishedResultsCount()).toBe(3);
      expect(TestBed.inject(Title).getTitle()).toMatch(/^studio\.tab_done:3 /);
    });
  });

  describe('kudos estimate', () => {
    beforeEach(() => {
      vi.stubGlobal('Image', SquarePicture);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function withSquareSource(): Promise<void> {
      component.onSourceImage('https://example.com/i.png');
      TestBed.tick();
      await Promise.resolve();
    }

    it('prices an upscale by the tiles the picture covers', async () => {
      await withSquareSource();
      select('RealESRGAN_x4plus');

      // Four 512px tiles at three each, then one for completion and one for
      // letting slow workers take it.
      expect(component.kudosEstimate()).toBe(14);
    });

    it('quotes nothing when a control map is asked for', async () => {
      await withSquareSource();
      select('RealESRGAN_x4plus', 'annotation');

      expect(component.kudosEstimate()).toBeNull();
      expect(component.kudosLines()).toEqual([]);
    });

    it('quotes nothing for a picture-priced form before the size is known', () => {
      component.onSourceImage('https://example.com/i.png');
      select('RealESRGAN_x4plus');

      expect(component.kudosEstimate()).toBeNull();
    });

    it('breaks the figure into rows that sum to it', async () => {
      await withSquareSource();
      select('caption', 'RealESRGAN_x4plus');

      const lines = component.kudosLines();
      expect(lines.map((line) => line.id)).toEqual([
        'form:caption',
        'form:RealESRGAN_x4plus',
        'completion',
        'slow-workers',
      ]);
      expect(lines.reduce((sum, line) => sum + line.kudos, 0)).toBe(
        component.kudosEstimate(),
      );
    });

    it('drops the slow-worker row when slow workers are off', async () => {
      await withSquareSource();
      select('caption');
      component.toggleSlowWorkers();

      expect(component.kudosLines().map((line) => line.id)).toEqual([
        'form:caption',
        'completion',
      ]);
      expect(component.kudosEstimate()).toBe(2);
    });
  });

  describe('cancelJob', () => {
    it('asks the queue to cancel the job behind the shown id', () => {
      queue.add('job-c');

      component.cancelJob('job-c');

      expect(queue.cancel).toHaveBeenCalledWith('local-job-c');
    });

    it('ignores an id that is no longer tracked', () => {
      component.cancelJob('job-gone');

      expect(queue.cancel).not.toHaveBeenCalled();
    });
  });
});

describe('AlchemyComponent developer surface (rendered)', () => {
  let fixture: ComponentFixture<AlchemyComponent>;
  let component: AlchemyComponent;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [
        AlchemyComponent,
        // No translations loaded, so the pipe echoes its key — enough to prove
        // which copy each section is wired to.
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
        { provide: AlchemyQueueService, useValue: new FakeAlchemyQueue() },
        {
          provide: AuthService,
          useValue: { getStoredApiKey: () => null, isLoggedIn: signal(false) },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
        // Rendering runs the page-title effect, which needs a real stream.
        { provide: TranslatorService, useValue: { get: () => of('') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlchemyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const text = (): string => fixture.nativeElement.textContent ?? '';

  describe('kudos button', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function priced(...forms: AlchemyFormName[]): Promise<void> {
      vi.stubGlobal('Image', SquarePicture);
      component.onSourceImage('https://example.com/i.png');
      for (const form of forms) component.toggleForm(form);
      fixture.detectChanges();
      await Promise.resolve();
      fixture.detectChanges();
    }

    it('quotes the request beside the submit button and lists its parts', async () => {
      await priced('RealESRGAN_x4plus');

      const button: HTMLButtonElement =
        fixture.nativeElement.querySelector('.gs-kudos-btn');
      expect(button.textContent).toContain('~14');

      button.click();
      fixture.detectChanges();
      const rows = fixture.nativeElement.querySelectorAll(
        '.gs-kudos-pop .gs-kudos-item',
      );
      expect(rows.length).toBe(3);
      expect(rows[0].textContent).toContain('alchemy.kudos.line_form');
    });

    it('renders nothing when a control map is asked for', async () => {
      await priced('annotation');

      expect(fixture.nativeElement.querySelector('.gs-kudos-btn')).toBeNull();
    });
  });

  it('costs the tool no standing row for the documentation', () => {
    expect(fixture.nativeElement.querySelector('.gs-devtabs')).toBeNull();
    expect(fixture.nativeElement.querySelector('.gs-devdoc')).toBeNull();
  });

  it('opens the documentation from the API button and leaves by its crumb', () => {
    component.openApi();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.gs-devdoc')).not.toBeNull();

    const back: HTMLButtonElement =
      fixture.nativeElement.querySelector('.gs-devdoc-back');
    expect(back).not.toBeNull();

    back.click();
    fixture.detectChanges();

    expect(component.activeTab()).toBe('tool');
    expect(fixture.nativeElement.querySelector('.gs-devdoc')).toBeNull();
  });

  it('renders the documentation sections once the developer surface is chosen', () => {
    component.setTab('developers');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.gs-devdoc')).not.toBeNull();
    for (const key of [
      'alchemy.dev.lead',
      'alchemy.dev.flow.heading',
      'alchemy.dev.flow.cancel_desc',
      'alchemy.dev.endpoints.col_purpose',
      'alchemy.dev.endpoints.auth_note',
      'alchemy.dev.request.forms_heading',
      'alchemy.dev.request.source_note',
      'alchemy.dev.status.result_note',
      'alchemy.dev.sdk.example_link',
    ]) {
      expect(text()).toContain(key);
    }
  });

  describe('description rail', () => {
    const dockEl = (f = fixture): HTMLElement =>
      f.nativeElement.querySelector('.gs-focus-dock') as HTMLElement;
    const isOpen = (f = fixture): boolean => {
      f.detectChanges();
      return dockEl(f).classList.contains('gs-focus-dock--open');
    };
    const sheet = (): HTMLElement =>
      fixture.nativeElement.querySelector('.gs-focus-sheet') as HTMLElement;
    const pin = (f = fixture): HTMLButtonElement =>
      f.nativeElement.querySelector('.gs-focus-pin') as HTMLButtonElement;

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts folded, with the description still in the page', () => {
      expect(isOpen()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('.gs-focus--fixed').textContent,
      ).toContain('alchemy.form_meta.caption.desc');
      expect(pin().getAttribute('aria-pressed')).toBe('false');
    });

    it('comes out when an operation is previewed', () => {
      vi.useFakeTimers();
      component.previewForm('caption');
      expect(isOpen()).toBe(true);
    });

    it('folds back ten seconds after it was asked for', () => {
      vi.useFakeTimers();
      component.previewDetector('depth');
      vi.advanceTimersByTime(9_999);
      expect(isOpen()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(isOpen()).toBe(false);
    });

    it('starts the ten seconds again on each new ask', () => {
      vi.useFakeTimers();
      component.previewForm('caption');
      vi.advanceTimersByTime(9_000);
      component.previewImageToPrompt();
      vi.advanceTimersByTime(9_000);
      expect(isOpen()).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(isOpen()).toBe(false);
    });

    it('holds the clock while the pointer rests on it', () => {
      vi.useFakeTimers();
      component.toggleForm('caption');
      vi.advanceTimersByTime(4_000);
      expect(isOpen()).toBe(true);

      sheet().dispatchEvent(new Event('pointerenter'));
      vi.advanceTimersByTime(30_000);
      expect(isOpen()).toBe(true);

      sheet().dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(5_999);
      expect(isOpen()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(isOpen()).toBe(false);
    });

    it('gets out of the way when pressed, to reach what it covers', () => {
      vi.useFakeTimers();
      component.previewForm('caption');
      expect(isOpen()).toBe(true);

      sheet().dispatchEvent(new Event('pointerdown'));
      expect(isOpen()).toBe(false);
    });

    it('comes out from a press on the rail', () => {
      vi.useFakeTimers();
      const peek = fixture.nativeElement.querySelector(
        '.gs-focus-peek',
      ) as HTMLButtonElement;
      expect(peek.getAttribute('aria-label')).toContain('alchemy.focus.show');

      peek.click();
      expect(isOpen()).toBe(true);
    });

    it('stays out once pinned, and remembers it', () => {
      vi.useFakeTimers();
      pin().click();
      expect(isOpen()).toBe(true);
      expect(dockEl().classList.contains('gs-focus-dock--pinned')).toBe(true);
      expect(pin().getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem('aihorde.alchemy.focus_pinned')).toBe('true');

      component.previewForm('caption');
      vi.advanceTimersByTime(20_000);
      expect(isOpen()).toBe(true);

      sheet().dispatchEvent(new Event('pointerdown'));
      expect(isOpen()).toBe(true);
    });

    it('folds straight away when unpinned', () => {
      vi.useFakeTimers();
      pin().click();
      expect(isOpen()).toBe(true);

      pin().click();
      expect(isOpen()).toBe(false);
      expect(pin().getAttribute('aria-pressed')).toBe('false');
      expect(localStorage.getItem('aihorde.alchemy.focus_pinned')).toBe(
        'false',
      );
    });

    it('starts pinned when the reader pinned it before', () => {
      localStorage.setItem('aihorde.alchemy.focus_pinned', 'true');
      const pinned = TestBed.createComponent(AlchemyComponent);
      pinned.detectChanges();

      expect(isOpen(pinned)).toBe(true);
      expect(dockEl(pinned).classList.contains('gs-focus-dock--pinned')).toBe(
        true,
      );
      expect(pin(pinned).getAttribute('aria-pressed')).toBe('true');
      pinned.destroy();
    });

    describe('after a press folds it, and under keyboard focus', () => {
      const descText = (): string =>
        (fixture.nativeElement.querySelector('.gs-focus--fixed') as HTMLElement)
          .textContent ?? '';
      /** An operation row other than caption, and the description key it shows. */
      const otherRow = (): { label: HTMLElement; descKey: string } => {
        const label = (
          [
            ...fixture.nativeElement.querySelectorAll(
              'label.gs-op:not(.gs-op--chip)',
            ),
          ] as HTMLElement[]
        ).find(
          (row) => !row.getAttribute('title')?.includes('caption.desc'),
        ) as HTMLElement;
        const descKey = /alchemy\.form_meta\.\w+\.desc/.exec(
          label.getAttribute('title') ?? '',
        )?.[0] as string;
        return { label, descKey };
      };
      const foldByPress = (): void => {
        component.previewForm('caption');
        expect(isOpen()).toBe(true);
        sheet().dispatchEvent(new Event('pointerdown'));
        expect(isOpen()).toBe(false);
      };
      /**
       * jsdom lays nothing out, so the rail's lower edge, the sheet's height and
       * the focused control's box are given here.
       */
      const stubFootprint = (): void => {
        const rail = fixture.nativeElement.querySelector(
          '.gs-focus-rail',
        ) as HTMLElement;
        vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
          top: 78,
          bottom: 100,
        } as DOMRect);
        Object.defineProperty(sheet(), 'offsetHeight', {
          configurable: true,
          value: 130,
        });
      };
      /** Where the source step lies; the footprint runs from 100 to 230. */
      let sourceBox: { top: number; bottom: number };
      const stubSource = (top: number, bottom: number): void => {
        sourceBox = { top, bottom };
        const source = (
          fixture.nativeElement.querySelector(
            '#alchemy-source-step',
          ) as HTMLElement
        ).parentElement as HTMLElement;
        vi.spyOn(source, 'getBoundingClientRect').mockImplementation(
          () => sourceBox as DOMRect,
        );
      };
      const layOut = (focusedTop: number): HTMLInputElement => {
        stubFootprint();
        const input = otherRow().label.querySelector(
          'input',
        ) as HTMLInputElement;
        vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
          top: focusedTop,
          bottom: focusedTop + 20,
        } as DOMRect);
        // jsdom only marks focus as visible after its focus events have run,
        // where a browser marks it before, so keyboard focus is stood in for.
        vi.spyOn(input, 'matches').mockImplementation(
          (selector: string) =>
            selector === ':focus-visible' ||
            Element.prototype.matches.call(input, selector),
        );
        return input;
      };

      it('keeps folded when the pointer lands on a row, but follows it in the text', () => {
        vi.useFakeTimers();
        foldByPress();
        const { label, descKey } = otherRow();

        label.dispatchEvent(new MouseEvent('mouseenter'));
        expect(isOpen()).toBe(false);
        expect(descText()).toContain(descKey);

        (label.querySelector('input') as HTMLInputElement).click();
        expect(isOpen()).toBe(false);
      });

      it('lets the pointer bring it out again once it leaves the panel', () => {
        vi.useFakeTimers();
        foldByPress();

        (
          fixture.nativeElement.querySelector('.gs-panel') as HTMLElement
        ).dispatchEvent(new Event('pointerleave'));
        otherRow().label.dispatchEvent(new MouseEvent('mouseenter'));
        expect(isOpen()).toBe(true);
      });

      it('lets the pointer bring it out again after a press on the rail', () => {
        vi.useFakeTimers();
        foldByPress();

        (
          fixture.nativeElement.querySelector('.gs-focus-peek') as HTMLElement
        ).click();
        expect(isOpen()).toBe(true);
        vi.advanceTimersByTime(10_000);
        expect(isOpen()).toBe(false);

        otherRow().label.dispatchEvent(new MouseEvent('mouseenter'));
        expect(isOpen()).toBe(true);
      });

      it('stays folded for keyboard focus it would cover, and folds if out', () => {
        vi.useFakeTimers();
        const input = layOut(150);
        const { descKey } = otherRow();

        input.focus();
        expect(isOpen()).toBe(false);
        expect(descText()).toContain(descKey);

        input.blur();
        component.previewForm('caption');
        expect(isOpen()).toBe(true);
        input.focus();
        expect(isOpen()).toBe(false);
      });

      it('comes out for keyboard focus below where it would lie', () => {
        vi.useFakeTimers();
        const input = layOut(300);

        input.focus();
        expect(isOpen()).toBe(true);
      });

      const peek = (): HTMLButtonElement =>
        fixture.nativeElement.querySelector(
          '.gs-focus-peek',
        ) as HTMLButtonElement;
      const caret = (): string =>
        (
          fixture.debugElement.query(By.css('.gs-focus-mark app-icon'))
            .componentInstance as IconComponent
        ).name();
      const pushHeight = (): string =>
        (fixture.nativeElement.querySelector('.gs-focus-push') as HTMLElement)
          .style.height;
      const panel = (): HTMLElement =>
        fixture.nativeElement.querySelector('.gs-panel') as HTMLElement;
      const body = (): HTMLElement =>
        fixture.nativeElement.querySelector('.gs-body') as HTMLElement;

      it('shows, hides and unpins from the rail, saying which it will do', () => {
        vi.useFakeTimers();
        fixture.detectChanges();
        expect(peek().getAttribute('aria-label')).toContain(
          'alchemy.focus.show',
        );
        expect(caret()).toBe('chevron-down');

        peek().click();
        expect(isOpen()).toBe(true);
        expect(peek().getAttribute('aria-label')).toContain(
          'alchemy.focus.hide',
        );
        expect(caret()).toBe('chevron-up');

        peek().click();
        expect(isOpen()).toBe(false);
        expect(caret()).toBe('chevron-down');

        pin().click();
        expect(isOpen()).toBe(true);
        expect(peek().getAttribute('aria-label')).toContain(
          'alchemy.focus.hide',
        );
        expect(caret()).toBe('chevron-up');

        peek().click();
        expect(isOpen()).toBe(false);
        expect(pin().getAttribute('aria-pressed')).toBe('false');
        expect(localStorage.getItem('aihorde.alchemy.focus_pinned')).toBe(
          'false',
        );
        vi.advanceTimersByTime(20_000);
        expect(isOpen()).toBe(false);
      });

      it('holds hover back after a hide on the rail, until the pointer leaves the panel', () => {
        vi.useFakeTimers();
        peek().click();
        peek().click();
        const { label, descKey } = otherRow();

        label.dispatchEvent(new MouseEvent('mouseenter'));
        expect(isOpen()).toBe(false);
        expect(descText()).toContain(descKey);

        panel().dispatchEvent(new Event('pointerleave'));
        label.dispatchEvent(new MouseEvent('mouseenter'));
        expect(isOpen()).toBe(true);
      });

      it('pushes the list where it would cover the source step, and lies over it where not', () => {
        vi.useFakeTimers();
        stubFootprint();
        stubSource(110, 400);

        component.previewForm('caption');
        expect(isOpen()).toBe(true);
        expect(component.focusPushed()).toBe(true);
        expect(pushHeight()).toBe('130px');

        peek().click();
        expect(isOpen()).toBe(false);
        expect(pushHeight()).toBe('0px');

        stubSource(-500, -20);
        panel().dispatchEvent(new Event('pointerleave'));
        component.previewForm('caption');
        expect(isOpen()).toBe(true);
        expect(component.focusPushed()).toBe(false);
        expect(pushHeight()).toBe('0px');
      });

      it('keeps a pushed sheet out when it is pressed', () => {
        vi.useFakeTimers();
        stubFootprint();
        stubSource(110, 400);
        component.previewForm('caption');
        expect(component.focusPushed()).toBe(true);

        sheet().dispatchEvent(new Event('pointerdown'));
        expect(isOpen()).toBe(true);
      });

      it('folds the overlay when a scroll brings the source step under it, without holding back', () => {
        vi.useFakeTimers();
        stubFootprint();
        stubSource(-500, -20);
        component.previewForm('caption');
        expect(isOpen()).toBe(true);
        expect(component.focusPushed()).toBe(false);

        stubSource(110, 400);
        body().dispatchEvent(new Event('scroll'));
        expect(isOpen()).toBe(false);

        otherRow().label.dispatchEvent(
          new MouseEvent('mouseenter', { clientX: 40, clientY: 60 }),
        );
        expect(isOpen()).toBe(true);
        expect(component.focusPushed()).toBe(true);
      });

      it('ignores a row that arrives under a still pointer until the pointer moves', () => {
        vi.useFakeTimers();
        const { label, descKey } = otherRow();
        panel().dispatchEvent(
          new MouseEvent('pointermove', { clientX: 40, clientY: 60 }),
        );
        body().dispatchEvent(new Event('scroll'));

        label.dispatchEvent(
          new MouseEvent('mouseenter', { clientX: 40, clientY: 60 }),
        );
        expect(isOpen()).toBe(false);
        expect(descText()).not.toContain(descKey);

        panel().dispatchEvent(
          new MouseEvent('pointermove', { clientX: 40, clientY: 60 }),
        );
        label.dispatchEvent(
          new MouseEvent('mouseenter', { clientX: 40, clientY: 60 }),
        );
        expect(isOpen()).toBe(false);

        panel().dispatchEvent(
          new MouseEvent('pointermove', { clientX: 41, clientY: 60 }),
        );
        label.dispatchEvent(
          new MouseEvent('mouseenter', { clientX: 41, clientY: 60 }),
        );
        expect(isOpen()).toBe(true);
        expect(descText()).toContain(descKey);
      });

      it('comes out for keyboard focus inside the footprint when it would push', () => {
        vi.useFakeTimers();
        const input = layOut(150);
        stubSource(110, 400);

        input.focus();
        expect(isOpen()).toBe(true);
        expect(component.focusPushed()).toBe(true);
      });
    });
  });

  it('describes the detector under the pointer in the dock, then hands it back', () => {
    component.toggleForm('annotation');
    fixture.detectChanges();

    const dock = () =>
      fixture.nativeElement.querySelector('.gs-focus--fixed') as HTMLElement;
    expect(dock().textContent).toContain('alchemy.form_meta.annotation.desc');

    const chips = [
      ...fixture.nativeElement.querySelectorAll(
        '.alchemy-detectors .gs-op--chip',
      ),
    ] as HTMLElement[];
    const depth = chips.find(
      (chip) => chip.textContent?.trim() === 'depth',
    ) as HTMLElement;

    depth.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(dock().textContent).toContain('alchemy.annotation.detector.depth');
    expect(dock().textContent).not.toContain(
      'alchemy.form_meta.annotation.desc',
    );

    // Moving back onto an operation is what returns the dock to it: there is no
    // hover to leave on a phone, so nothing is said only by leaving.
    component.previewForm('annotation');
    fixture.detectChanges();
    expect(dock().textContent).toContain('alchemy.form_meta.annotation.desc');
  });

  it('describes image to prompt in the dock like an operation, and explains it behind a ?', () => {
    const quick = fixture.nativeElement.querySelector(
      '.gs-op-quick',
    ) as HTMLElement;
    const dock = () =>
      fixture.nativeElement.querySelector('.gs-focus--fixed') as HTMLElement;
    expect(quick.querySelector('app-gs-help')).not.toBeNull();

    (quick.querySelector('.gs-op-quick-btn') as HTMLElement).dispatchEvent(
      new MouseEvent('mouseenter'),
    );
    fixture.detectChanges();
    expect(dock().textContent).toContain('alchemy.quick.image_to_prompt_desc');
    expect(dock().textContent).toContain(
      'alchemy.quick.image_to_prompt_example',
    );
    expect(dock().textContent).not.toContain('alchemy.form_meta.caption.desc');

    component.previewForm('caption');
    fixture.detectChanges();
    expect(dock().textContent).toContain('alchemy.form_meta.caption.desc');
    expect(dock().textContent).not.toContain(
      'alchemy.quick.image_to_prompt_desc',
    );
  });

  it('offers a chip per detector once a control map is asked for', () => {
    expect(
      fixture.nativeElement.querySelector('.alchemy-detectors'),
    ).toBeNull();

    component.toggleForm('annotation');
    fixture.detectChanges();

    const chips = [
      ...fixture.nativeElement.querySelectorAll(
        '.alchemy-detectors .gs-op--chip',
      ),
    ] as HTMLElement[];
    expect(chips.length).toBe(
      component.detectorGroups.reduce(
        (total, group) => total + group.types.length,
        0,
      ),
    );
    expect(
      chips.filter((chip) => chip.classList.contains('gs-op--selected')).length,
    ).toBe(1);

    const depth = chips.find(
      (chip) => chip.textContent?.trim() === 'depth',
    ) as HTMLElement;
    depth.querySelector('input')?.click();
    fixture.detectChanges();

    expect(component.annotationControlTypes()).toEqual(['canny', 'depth']);
  });

  it('lists every valid form name from the shared constants', () => {
    component.setTab('developers');
    fixture.detectChanges();

    const chips = [
      ...fixture.nativeElement.querySelectorAll('.gs-devdoc-chips code'),
    ].map((el) => (el as HTMLElement).textContent);

    expect(chips).toEqual([
      ...component.dataForms,
      ...component.postProcessorForms,
      ...component.annotationForms,
    ]);
  });
});
