import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, merge, startWith, switchMap } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import {
  CivitaiDetailComponent,
  type CivitaiDetailTarget,
} from '../civitai-detail/civitai-detail.component';
import {
  CivitaiModel,
  CivitaiModelType,
  CivitaiPeriod,
  CivitaiService,
  CivitaiSort,
} from '../../services/civitai.service';
import { CivitaiCacheService } from '../../services/civitai-cache.service';
import {
  CIVITAI_BASE_MODEL_GROUPS,
  civitaiBaseModelMatchesBaseline,
  civitaiBaseModelsFor,
} from '../../services/civitai-base-models';
import { DatabaseService } from '../../services/database.service';
import {
  DEFAULT_LORA_STRENGTH,
  isNumericAssetId,
  manualLoraSelection,
  manualTiSelection,
  pickDefaultVersion,
  type CivitaiAssetKind,
  type LoraSelection,
  type TiSelection,
} from '../../types/civitai-asset';

const MATURE_PREF_KEY = 'aihorde.civitai.mature';
const COLUMNS_PREF_KEY = 'aihorde.civitai.columns';
const COLUMN_OPTIONS = [2, 3, 4, 5, 6] as const;
const DEFAULT_COLUMNS = 3;

/** Keeps a stored or selected column count inside the range the grid offers. */
function clampColumns(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return DEFAULT_COLUMNS;
  }
  return Math.min(6, Math.max(2, Math.round(parsed)));
}
const FILTERS_OPEN_KEY = 'aihorde.civitai.filters_open';

/** CivitAI's tamest maturity rating; anything above it is covered until asked. */
const SAFE_NSFW_LEVEL = 1;

export const CIVITAI_SORTS: readonly CivitaiSort[] = [
  'Most Downloaded',
  'Highest Rated',
  'Most Liked',
  'Newest',
];

export const CIVITAI_PERIODS: readonly CivitaiPeriod[] = [
  'AllTime',
  'Year',
  'Month',
  'Week',
  'Day',
];

/**
 * The base-model filter: the literal 'mine' for the host's own family, 'all'
 * for no filter, or a baseline naming one group from the table.
 */
type BaseModelChoice = string;

/**
 * Browse the CivitAI catalogue and choose LoRAs or embeddings from it.
 *
 * Value in, value out: the host owns the form and decides what an edit means,
 * which is what lets the studio and the style editor share this.
 *
 * A LoRA is pinned to a specific published version as it is added, so a saved
 * request keeps meaning the same thing after the author publishes an update. An
 * embedding is named by its model page instead, because the horde's payload has
 * no field to carry a version for one.
 */
@Component({
  selector: 'app-civitai-picker',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    IconComponent,
    CivitaiDetailComponent,
  ],
  templateUrl: './civitai-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CivitaiPickerComponent implements OnInit {
  private readonly civitai = inject(CivitaiService);
  private readonly cache = inject(CivitaiCacheService);
  private readonly db = inject(DatabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Watched to fetch the next page as the end of the grid comes into view. */
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  public readonly kind = input<CivitaiAssetKind>('lora');
  public readonly loras = input<readonly LoraSelection[]>([]);
  public readonly tis = input<readonly TiSelection[]>([]);
  /** The host model's normalised baseline; drives the default filter. */
  public readonly baseline = input<string | null>(null);
  public readonly allowSha256 = input(false);

  public readonly lorasChange = output<LoraSelection[]>();
  public readonly tisChange = output<TiSelection[]>();
  public readonly appendToPrompt = output<string>();
  public readonly closed = output<void>();

  public readonly queryControl = new FormControl('', { nonNullable: true });
  public readonly tagControl = new FormControl('', { nonNullable: true });
  public readonly creatorControl = new FormControl('', { nonNullable: true });

  public readonly tab = signal<CivitaiAssetKind>('lora');
  public readonly results = signal<CivitaiModel[]>([]);
  public readonly cursor = signal<string | null>(null);
  public readonly loading = signal(false);
  public readonly loadingMore = signal(false);
  public readonly errored = signal(false);

  public readonly sorts = CIVITAI_SORTS;
  public readonly periods = CIVITAI_PERIODS;
  public readonly baseModelGroups = CIVITAI_BASE_MODEL_GROUPS;

  public readonly sort = signal<CivitaiSort>('Most Downloaded');
  public readonly period = signal<CivitaiPeriod>('AllTime');
  public readonly baseModelChoice = signal<BaseModelChoice>('mine');

  public readonly showMature = signal(
    this.db.get<boolean>(MATURE_PREF_KEY, false) === true,
  );
  public readonly filtersOpen = signal(
    this.db.get<boolean>(FILTERS_OPEN_KEY, false) === true,
  );
  public readonly columnOptions = COLUMN_OPTIONS;
  public readonly columns = signal(clampColumns(this.db.get(COLUMNS_PREF_KEY)));
  public readonly manualOpen = signal(false);
  public readonly revealed = signal<ReadonlySet<string>>(new Set());

  public readonly manualName = new FormControl('', { nonNullable: true });
  public readonly manualIsVersion = signal(false);

  public readonly detailTarget = signal<CivitaiDetailTarget | null>(null);

  /**
   * Fetch the next page as the end of the grid is reached.
   *
   * The button beside it is not a fallback but the keyboard path: an observer
   * only fires on scroll, so someone tabbing through the results would never
   * reach anything past the first page.
   */
  private readonly scrollPaging = effect((onCleanup) => {
    const element = this.sentinel()?.nativeElement;
    if (
      !element ||
      !this.isBrowser ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }
    let observer: IntersectionObserver | null = null;
    afterNextRender(
      () => {
        observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.onLoadMore();
          }
        });
        observer.observe(element);
      },
      { injector: this.injector },
    );
    // Each completed search remounts the sentinel, so the previous observer is
    // dropped here rather than left to pile up until the picker closes.
    onCleanup(() => observer?.disconnect());
  });

  private readonly retrigger = new Subject<void>();
  private readonly loadMore = new Subject<void>();

  public readonly selectedCount = computed(
    () => this.loras().length + this.tis().length,
  );

  /** The labels the current base-model choice searches; empty means no filter. */
  public readonly activeBaseModels = computed<readonly string[]>(() => {
    const choice = this.baseModelChoice();
    if (choice === 'all') {
      return [];
    }
    if (choice === 'mine') {
      return civitaiBaseModelsFor(this.baseline());
    }
    return civitaiBaseModelsFor(choice);
  });

  /** What "fits my model" is offered as, or null when nothing is known. */
  public readonly myBaseModels = computed(() =>
    civitaiBaseModelsFor(this.baseline()),
  );

  public readonly filtersActive = computed(
    () =>
      this.sort() !== 'Most Downloaded' ||
      this.period() !== 'AllTime' ||
      this.baseModelChoice() !== 'mine' ||
      this.tagControl.value.trim() !== '' ||
      this.creatorControl.value.trim() !== '',
  );

  public ngOnInit(): void {
    this.tab.set(this.kind());
    // A tab change, a filter change or a fresh query all start a new list; only
    // "load more" continues the one on screen.
    merge(
      this.queryControl.valueChanges.pipe(debounceTime(350)),
      this.tagControl.valueChanges.pipe(debounceTime(350)),
      this.creatorControl.valueChanges.pipe(debounceTime(350)),
      this.retrigger,
    )
      .pipe(
        startWith(null),
        switchMap(() => {
          this.results.set([]);
          this.cursor.set(null);
          this.loading.set(true);
          this.errored.set(false);
          return this.civitai.searchModels(this.searchParams(null));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result.kind === 'success') {
          this.results.set(this.presentable(result.items));
          this.cursor.set(result.metadata.nextCursor);
        } else {
          this.errored.set(true);
          this.results.set([]);
          this.cursor.set(null);
        }
      });

    this.loadMore
      .pipe(
        switchMap(() => {
          this.loadingMore.set(true);
          return this.civitai.searchModels(this.searchParams(this.cursor()));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loadingMore.set(false);
        if (result.kind === 'success') {
          this.results.update((current) => [
            ...current,
            ...this.presentable(result.items),
          ]);
          this.cursor.set(result.metadata.nextCursor);
        } else {
          this.cursor.set(null);
        }
      });
  }

  private searchParams(
    cursor: string | null,
  ): Parameters<CivitaiService['searchModels']>[0] {
    const type: CivitaiModelType =
      this.tab() === 'ti' ? 'TextualInversion' : 'LORA';
    return {
      query: this.queryControl.value.trim() || undefined,
      type,
      baseModels: this.activeBaseModels(),
      sort: this.sort(),
      period: this.period(),
      nsfw: this.showMature() ? true : undefined,
      tag: this.tagControl.value.trim() || undefined,
      username: this.creatorControl.value.trim() || undefined,
      cursor: cursor ?? undefined,
    };
  }

  /**
   * What may be shown at all. CivitAI flags models depicting minors, and those
   * are dropped whatever the maturity toggle says: that is not a preference.
   */
  private presentable(items: CivitaiModel[]): CivitaiModel[] {
    return items.filter((model) => !model.minor);
  }

  public setTab(tab: CivitaiAssetKind): void {
    if (this.tab() !== tab) {
      this.tab.set(tab);
      this.retrigger.next();
    }
  }

  public setSort(sort: CivitaiSort): void {
    this.sort.set(sort);
    this.retrigger.next();
  }

  public setPeriod(period: CivitaiPeriod): void {
    this.period.set(period);
    this.retrigger.next();
  }

  public setBaseModel(choice: BaseModelChoice): void {
    this.baseModelChoice.set(choice);
    this.retrigger.next();
  }

  public resetFilters(): void {
    this.sort.set('Most Downloaded');
    this.period.set('AllTime');
    this.baseModelChoice.set('mine');
    this.tagControl.setValue('');
    this.creatorControl.setValue('');
    this.retrigger.next();
  }

  public toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
    this.db.store(FILTERS_OPEN_KEY, this.filtersOpen());
  }

  public setColumns(value: string): void {
    this.columns.set(clampColumns(value));
    this.db.store(COLUMNS_PREF_KEY, this.columns());
  }

  public toggleMature(): void {
    this.showMature.update((on) => !on);
    this.db.store(MATURE_PREF_KEY, this.showMature());
    this.retrigger.next();
  }

  public onLoadMore(): void {
    if (this.cursor() !== null && !this.loadingMore()) {
      this.loadMore.next();
    }
  }

  public selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  // --- Covering previews ----------------------------------------------------

  public isCovered(url: string, level: number): boolean {
    return level > SAFE_NSFW_LEVEL && !this.revealed().has(url);
  }

  public reveal(url: string): void {
    this.revealed.update((current) => new Set(current).add(url));
  }

  // --- Choosing -------------------------------------------------------------

  public isAdded(model: CivitaiModel): boolean {
    return this.entryFor(model) !== null;
  }

  /** The chosen entry that stands for this catalogue model, if any. */
  private entryFor(model: CivitaiModel): LoraSelection | TiSelection | null {
    if (model.type === 'TextualInversion') {
      return this.tis().find((ti) => ti.name === String(model.id)) ?? null;
    }
    const versionIds = new Set(model.versions.map((v) => String(v.id)));
    return (
      this.loras().find(
        (lora) =>
          lora.name === String(model.id) ||
          (lora.is_version === true && versionIds.has(lora.name)),
      ) ?? null
    );
  }

  public suits(model: CivitaiModel): boolean {
    return model.versions.some((version) =>
      civitaiBaseModelMatchesBaseline(version.baseModel, this.baseline()),
    );
  }

  /** Add the model, or take it out again if it is already chosen. */
  public toggle(model: CivitaiModel): void {
    const existing = this.entryFor(model);
    if (existing) {
      this.removeEntry(model, existing);
      return;
    }
    // Remembered whole and now, not when something later asks: a freshly chosen
    // entry already knows its name, so nothing would ever look it up, and the
    // first time it mattered would be a reload with no network.
    void this.cache.putSearchResult(model);

    if (model.type === 'TextualInversion') {
      const version = model.versions[0];
      this.tisChange.emit([
        ...this.tis(),
        {
          // Always the model page: the horde's embedding payload has no field
          // for a version.
          name: String(model.id),
          strength: DEFAULT_LORA_STRENGTH,
          label: model.name,
          baseModel: version?.baseModel,
          thumbnailUrl: model.preview?.url,
          modelId: model.id,
          triggerWords: version?.trainedWords,
        },
      ]);
      return;
    }

    const version = pickDefaultVersion(model.versions, (baseModel) =>
      civitaiBaseModelMatchesBaseline(baseModel, this.baseline()),
    );
    const entry: LoraSelection = {
      name: version ? String(version.id) : String(model.id),
      model: DEFAULT_LORA_STRENGTH,
      clip: DEFAULT_LORA_STRENGTH,
      label: model.name,
      versionLabel: version?.name,
      baseModel: version?.baseModel,
      thumbnailUrl: model.preview?.url,
      modelId: model.id,
      triggerWords: version?.trainedWords,
    };
    if (version) {
      entry.is_version = true;
    }
    this.lorasChange.emit([...this.loras(), entry]);
  }

  private removeEntry(
    model: CivitaiModel,
    entry: LoraSelection | TiSelection,
  ): void {
    if (model.type === 'TextualInversion') {
      this.tisChange.emit(this.tis().filter((ti) => ti !== entry));
    } else {
      this.lorasChange.emit(this.loras().filter((lora) => lora !== entry));
    }
  }

  // --- Details --------------------------------------------------------------

  public openDetails(model: CivitaiModel): void {
    this.detailTarget.set({
      kind: model.type === 'TextualInversion' ? 'ti' : 'lora',
      modelId: model.id,
      versionId: null,
    });
  }

  public closeDetails(): void {
    this.detailTarget.set(null);
  }

  public onDetailApply(entry: LoraSelection | TiSelection): void {
    if ('clip' in entry) {
      const without = this.loras().filter(
        (lora) => lora.modelId !== entry.modelId || lora.name === entry.name,
      );
      const index = without.findIndex((lora) => lora.name === entry.name);
      this.lorasChange.emit(
        index >= 0
          ? without.map((lora, i) => (i === index ? entry : lora))
          : [...without, entry],
      );
    } else {
      const index = this.tis().findIndex((ti) => ti.name === entry.name);
      this.tisChange.emit(
        index >= 0
          ? this.tis().map((ti, i) => (i === index ? entry : ti))
          : [...this.tis(), entry],
      );
    }
    this.closeDetails();
  }

  // --- Adding by hand -------------------------------------------------------

  public toggleManual(): void {
    this.manualOpen.update((open) => !open);
  }

  /**
   * Whether the version question applies at all. It is asked only for an
   * all-digit name on the LoRA tab, because the horde refuses the flag anywhere
   * else. Showing it only when it applies teaches the rule at the moment it
   * matters, rather than letting a request be built that will be turned away.
   */
  public canBeVersion(): boolean {
    return (
      this.tab() === 'lora' && isNumericAssetId(this.manualName.value.trim())
    );
  }

  public setManualIsVersion(value: boolean): void {
    this.manualIsVersion.set(value);
  }

  public addManual(): void {
    const name = this.manualName.value.trim();
    if (!name) {
      return;
    }
    if (this.tab() === 'ti') {
      const entry = manualTiSelection({ name });
      if (entry) {
        this.tisChange.emit([...this.tis(), entry]);
      }
    } else {
      const entry = manualLoraSelection({
        name,
        isVersion: this.canBeVersion() && this.manualIsVersion(),
      });
      if (entry) {
        this.lorasChange.emit([...this.loras(), entry]);
      }
    }
    this.manualName.setValue('');
    this.manualIsVersion.set(false);
  }

  public onClose(): void {
    this.closed.emit();
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  /** Deterministic placeholder for a result with no preview. */
  public gradient(index: number): string {
    const grads = [
      'linear-gradient(135deg,#6366f1,#a855f7)',
      'linear-gradient(135deg,#0ea5e9,#22d3ee)',
      'linear-gradient(135deg,#f59e0b,#ef4444)',
      'linear-gradient(135deg,#10b981,#34d399)',
      'linear-gradient(135deg,#ec4899,#f472b6)',
      'linear-gradient(135deg,#8b5cf6,#6366f1)',
    ];
    return grads[index % grads.length];
  }
}
