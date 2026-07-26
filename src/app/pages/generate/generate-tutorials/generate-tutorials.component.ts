import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { forkJoin, map, of } from 'rxjs';
import { IconComponent } from '../../../components/icon/icon.component';
import { highlightJson } from '../../../helper/json-formatter';

/** Where the committed example set lives, relative to the served root. */
const TUTORIALS_ROOT = '/assets/tutorials';

/** One entry of `manifest.json`. */
export interface TutorialFlow {
  id: string;
  directory: string;
  title: string;
  summary: string;
  status: 'available' | 'skipped';
  skipped_reason?: string;
  model?: string;
  seed?: string;
  result?: string;
  source?: string;
  mask?: string;
  before?: string;
  request?: string;
  files: string[];
}

export interface TutorialManifest {
  /** The API the examples were actually submitted to. */
  generated_against: string;
  flows: TutorialFlow[];
}

/** The subset of a flow's `meta.json` this page reports. */
interface TutorialMeta {
  model?: string;
  seed?: string;
  worker_name?: string;
  kudos_charged?: number;
  wall_time_seconds?: number;
  deviations?: string;
}

/** A flow's fetched companion files, once they have arrived. */
interface TutorialDetail {
  meta: TutorialMeta;
  /**
   * The payload exactly as committed. Kept as text rather than parsed and
   * re-serialised so what a reader copies is the file, byte for byte.
   */
  request: string;
  /** facefix only: the same request without the post-processor. */
  requestBefore: string | null;
}

/**
 * The walkthrough each flow gets, in the order the control panel presents the
 * fields being set. Written per flow rather than shared, because the point of
 * each example is the one or two fields that make it that flow.
 */
export const TUTORIAL_FLOW_STEPS: Readonly<Record<string, readonly string[]>> =
  {
    txt2img: ['prompt', 'model', 'dimensions', 'sampling', 'seed', 'generate'],
    img2img: ['source', 'mode', 'denoise', 'prompt', 'model', 'generate'],
    controlnet: [
      'source',
      'mode',
      'control_type',
      'denoise',
      'prompt',
      'model',
      'dimensions',
      'generate',
    ],
    inpainting: ['source', 'mode', 'mask', 'prompt', 'model', 'generate'],
    qr_code: ['prompt', 'qr', 'model', 'dimensions', 'cfg', 'generate'],
    transparent: ['prompt', 'transparent', 'model', 'dimensions', 'generate'],
    facefix: [
      'prompt',
      'model',
      'dimensions',
      'generate_before',
      'facefixer',
      'regenerate',
    ],
  };

/** The three calls every image request makes, in order. */
const LIFECYCLE = ['submit', 'check', 'status'] as const;

/** The headers the submit call needs. */
const REQUEST_HEADERS = ['apikey', 'client_agent', 'content_type'] as const;

/**
 * The learning surface for the image studio: for each flow, the request that
 * was actually submitted, the image that came back, and the steps that produce
 * the same thing from the control panel. Everything shown is read from the
 * committed asset set, so the page cannot describe a request that was never
 * sent.
 */
@Component({
  selector: 'app-generate-tutorials',
  imports: [TranslocoPipe, RouterLink, IconComponent],
  templateUrl: './generate-tutorials.component.html',
  host: {
    class: 'gs-tut',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateTutorialsComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  public readonly manifest = signal<TutorialManifest | null>(null);
  public readonly loadFailed = signal(false);

  /** Same steps and images either way; developer adds the wire detail. */
  public readonly mode = signal<'user' | 'developer'>('user');

  public readonly lifecycle = LIFECYCLE;
  public readonly requestHeaders = REQUEST_HEADERS;

  private readonly details = signal<Readonly<Record<string, TutorialDetail>>>(
    {},
  );

  private readonly routeFlowId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('flow'))),
    { initialValue: null },
  );

  public readonly flows = computed(() => this.manifest()?.flows ?? []);

  /**
   * The flow on screen. An unknown or absent `:flow` segment falls back to the
   * first entry rather than erroring: the picker is always usable from here.
   */
  public readonly activeFlow = computed<TutorialFlow | null>(() => {
    const flows = this.flows();
    const id = this.routeFlowId();
    return flows.find((flow) => flow.id === id) ?? flows[0] ?? null;
  });

  public readonly activeDetail = computed<TutorialDetail | null>(() => {
    const flow = this.activeFlow();
    return flow ? (this.details()[flow.id] ?? null) : null;
  });

  public readonly steps = computed<readonly string[]>(
    () => TUTORIAL_FLOW_STEPS[this.activeFlow()?.id ?? ''] ?? [],
  );

  /** The submit endpoint, named against the API the examples were run on. */
  public readonly submitUrl = computed(
    () => `${this.manifest()?.generated_against ?? ''}/generate/async`,
  );

  public readonly requestJson = computed(() =>
    highlightJson(this.activeDetail()?.request ?? ''),
  );

  public readonly requestBeforeJson = computed(() =>
    highlightJson(this.activeDetail()?.requestBefore ?? ''),
  );

  constructor() {
    this.http
      .get<TutorialManifest>(`${TUTORIALS_ROOT}/manifest.json`)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (manifest) => this.manifest.set(manifest),
        error: () => this.loadFailed.set(true),
      });

    effect(() => {
      const flow = this.activeFlow();
      if (flow && flow.status === 'available' && !this.details()[flow.id]) {
        this.loadDetail(flow);
      }
    });
  }

  /** An asset of the active flow, by its manifest file name. */
  public assetUrl(file: string | undefined): string {
    const flow = this.activeFlow();
    return flow && file ? `${TUTORIALS_ROOT}/${flow.directory}/${file}` : '';
  }

  public isMode(mode: 'user' | 'developer'): boolean {
    return this.mode() === mode;
  }

  public setMode(mode: 'user' | 'developer'): void {
    this.mode.set(mode);
  }

  /**
   * The key naming a flow by what it makes. The manifest's own title names the
   * technique instead, which is the wrong thing to lead a reader with, so it is
   * kept as a second line rather than as the name.
   */
  public taskNameKey(flow: TutorialFlow): string {
    return `generate.tutorials.flows.${flow.id}.task_name`;
  }

  public isActive(flow: TutorialFlow): boolean {
    return flow.id === this.activeFlow()?.id;
  }

  /**
   * Whether the payload carries a placeholder in place of a base64 blob. Worth
   * saying out loud: the committed file is not something you could POST as-is.
   */
  public hasImagePlaceholder(): boolean {
    return (this.activeDetail()?.request ?? '').includes('<base64');
  }

  private loadDetail(flow: TutorialFlow): void {
    const before = flow.files.includes('request-before.json');
    forkJoin({
      meta: this.http.get<TutorialMeta>(
        `${TUTORIALS_ROOT}/${flow.directory}/meta.json`,
      ),
      request: this.http.get(
        `${TUTORIALS_ROOT}/${flow.directory}/${flow.request ?? 'request.json'}`,
        { responseType: 'text' },
      ),
      requestBefore: before
        ? this.http.get(
            `${TUTORIALS_ROOT}/${flow.directory}/request-before.json`,
            { responseType: 'text' },
          )
        : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) =>
          this.details.update((current) => ({
            ...current,
            [flow.id]: detail,
          })),
        error: () => this.loadFailed.set(true),
      });
  }
}
