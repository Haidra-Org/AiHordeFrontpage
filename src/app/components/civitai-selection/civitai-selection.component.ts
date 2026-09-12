import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CivitaiDetailComponent,
  type CivitaiDetailTarget,
} from '../civitai-detail/civitai-detail.component';
import { CivitaiResolverService } from '../../services/civitai-resolver.service';
import {
  HORDE_MAX_LORAS,
  HORDE_MAX_TIS,
  MAX_LORA_STRENGTH,
  MIN_LORA_STRENGTH,
  activeLoras,
  activeTis,
  isNumericAssetId,
  type CivitaiAssetKind,
  type LoraSelection,
  type TiSelection,
} from '../../types/civitai-asset';
import { rangeFillPercent } from '../../pages/generate/generate-form.model';

/** A row as the template draws it: the entry plus where it sits. */
interface SelectionRow<T> {
  entry: T;
  index: number;
  /** False once the row is past the cap, so it will not be sent. */
  active: boolean;
}

/**
 * The chosen LoRAs and embeddings, with their strengths and their order.
 *
 * Shared by the generate studio and the style editor, so it takes and emits
 * plain values rather than reaching into a form: what "dirty" means belongs to
 * whichever form is hosting it.
 *
 * Selections past the horde's cap are kept rather than refused. They are drawn
 * as inactive and can be moved up into the sent set, which is the whole reason
 * the list is reorderable.
 */
@Component({
  selector: 'app-civitai-selection',
  imports: [TranslocoPipe, DecimalPipe, CivitaiDetailComponent],
  templateUrl: './civitai-selection.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CivitaiSelectionComponent {
  private readonly resolver = inject(CivitaiResolverService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  public readonly loras = input<readonly LoraSelection[]>([]);
  public readonly tis = input<readonly TiSelection[]>([]);
  /** Null where the host does not enforce a cap, as the style editor does not. */
  public readonly maxLoras = input<number | null>(HORDE_MAX_LORAS);
  public readonly maxTis = input<number | null>(HORDE_MAX_TIS);
  /** Whether to draw the cap at all; a style is a document, not a submission. */
  public readonly showCap = input(true);
  /** The host model's baseline, for the detail panel's compatibility marks. */
  public readonly baseline = input<string | null>(null);
  /** A style may pin a file hash; a generation never does. */
  public readonly allowSha256 = input(false);

  public readonly lorasChange = output<LoraSelection[]>();
  public readonly tisChange = output<TiSelection[]>();
  /** Raw trigger text for the host to put wherever it keeps a prompt. */
  public readonly appendToPrompt = output<string>();
  /** Which row's details are open, so an edit can be put back in place. */
  public readonly openRow = signal<{
    kind: CivitaiAssetKind;
    index: number;
    target: CivitaiDetailTarget;
  } | null>(null);

  public readonly minStrength = MIN_LORA_STRENGTH;
  public readonly maxStrength = MAX_LORA_STRENGTH;

  /** Announced when a row moves, because only a sighted reader sees it move. */
  public readonly announcement = signal('');

  public readonly loraRows = computed<SelectionRow<LoraSelection>[]>(() => {
    const sent = new Set(activeLoras(this.loras()));
    return this.loras().map((entry, index) => ({
      entry,
      index,
      active: !this.cappedLoras() || sent.has(entry),
    }));
  });

  public readonly tiRows = computed<SelectionRow<TiSelection>[]>(() => {
    const sent = new Set(activeTis(this.tis()));
    return this.tis().map((entry, index) => ({
      entry,
      index,
      active: !this.cappedTis() || sent.has(entry),
    }));
  });

  public readonly loraCount = computed(() => this.loras().length);
  public readonly sentLoraCount = computed(
    () => activeLoras(this.loras()).length,
  );
  public readonly tiCount = computed(() => this.tis().length);
  public readonly sentTiCount = computed(() => activeTis(this.tis()).length);

  public readonly lorasOverCap = computed(
    () => this.cappedLoras() && this.loraCount() > this.sentLoraCount(),
  );
  public readonly tisOverCap = computed(
    () => this.cappedTis() && this.tiCount() > this.sentTiCount(),
  );

  public readonly isEmpty = computed(
    () => this.loras().length === 0 && this.tis().length === 0,
  );

  /**
   * Ask the catalogue about any row that arrived without a name. Rows loaded
   * from history are the only ones that need it: a freshly picked one already
   * knows what it is called.
   */
  private readonly nameLookups = effect(() => {
    const entries: (LoraSelection | TiSelection)[] = [
      ...this.loras(),
      ...this.tis(),
    ];
    this.resolver.requestAll(
      entries
        .filter((entry) => !entry.label)
        .map((entry) => ({
          id: entry.name,
          isVersion: this.isLora(entry) && entry.is_version === true,
        })),
    );
  });

  private cappedLoras(): boolean {
    return this.showCap() && this.maxLoras() !== null;
  }

  private cappedTis(): boolean {
    return this.showCap() && this.maxTis() !== null;
  }

  /**
   * What a row is called: the name chosen with it, then whatever the catalogue
   * could supply, and null when only an identifier is known so the template can
   * word it rather than print a bare number.
   */
  public rowName(entry: LoraSelection | TiSelection): string | null {
    if (entry.label) {
      return entry.label;
    }
    const resolved = this.resolver.metaFor({
      id: entry.name,
      isVersion: this.isLora(entry) && entry.is_version === true,
    })?.label;
    return resolved ?? (isNumericAssetId(entry.name) ? null : entry.name);
  }

  public isLora(entry: LoraSelection | TiSelection): entry is LoraSelection {
    return 'clip' in entry;
  }

  /** Deterministic chip colour, cycled by position so rows stay tellable apart. */
  public gradient(index: number): string {
    const grads = [
      'linear-gradient(135deg,#c7d2fe,#a5b4fc)',
      'linear-gradient(135deg,#e9d5ff,#c4b5fd)',
      'linear-gradient(135deg,#bfdbfe,#93c5fd)',
      'linear-gradient(135deg,#fbcfe8,#f0abfc)',
    ] as const;
    return grads[index % grads.length] ?? grads[0];
  }

  public fill(value: number): number {
    return rangeFillPercent(value, MIN_LORA_STRENGTH, MAX_LORA_STRENGTH);
  }

  public rangeValue(event: Event): number {
    return +(event.target as HTMLInputElement).value;
  }

  public setLoraStrength(
    index: number,
    field: 'model' | 'clip',
    value: number,
  ): void {
    const next = this.loras().map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry,
    );
    this.lorasChange.emit(next);
  }

  public setTiStrength(index: number, value: number): void {
    this.tisChange.emit(
      this.tis().map((entry, i) =>
        i === index ? { ...entry, strength: value } : entry,
      ),
    );
  }

  public remove(kind: CivitaiAssetKind, index: number): void {
    if (kind === 'lora') {
      this.lorasChange.emit(this.loras().filter((_, i) => i !== index));
    } else {
      this.tisChange.emit(this.tis().filter((_, i) => i !== index));
    }
  }

  public canMove(
    kind: CivitaiAssetKind,
    index: number,
    delta: -1 | 1,
  ): boolean {
    const length = kind === 'lora' ? this.loras().length : this.tis().length;
    const target = index + delta;
    return target >= 0 && target < length;
  }

  /**
   * Move a row one place, and say so.
   *
   * Focus is put back on the same button afterwards: the list re-renders around
   * the moved row, and without this the first press would throw focus away and
   * a second press would need the reader to find the button again. That would
   * make the keyboard path unusable, which is the path this exists for.
   */
  public move(kind: CivitaiAssetKind, index: number, delta: -1 | 1): void {
    if (!this.canMove(kind, index, delta)) {
      return;
    }
    const target = index + delta;
    const swap = <T>(list: readonly T[]): { next: T[]; moved: T } | null => {
      const next = [...list];
      const moved = next.at(index);
      const displaced = next.at(target);
      if (moved === undefined || displaced === undefined) {
        return null;
      }
      next[index] = displaced;
      next[target] = moved;
      return { next, moved };
    };

    if (kind === 'lora') {
      const swapped = swap(this.loras());
      if (!swapped) return;
      const { next, moved } = swapped;
      this.lorasChange.emit(next);
      this.announce(moved, target, next.length, activeLoras(next).length);
    } else {
      const swapped = swap(this.tis());
      if (!swapped) return;
      const { next, moved } = swapped;
      this.tisChange.emit(next);
      this.announce(moved, target, next.length, activeTis(next).length);
    }
    this.restoreFocus(kind, target, delta);
  }

  private announce(
    entry: LoraSelection | TiSelection,
    index: number,
    total: number,
    sent: number,
  ): void {
    this.announcement.set(
      JSON.stringify({
        name: this.rowName(entry) ?? entry.name,
        position: index + 1,
        total,
        sent,
      }),
    );
  }

  /** The announcement's parts, for the live region's own sentence. */
  public announcementParts(): Record<string, string | number> | null {
    const raw = this.announcement();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Record<string, string | number>;
  }

  private restoreFocus(
    kind: CivitaiAssetKind,
    index: number,
    delta: -1 | 1,
  ): void {
    afterNextRender(
      () => {
        const selector = `[data-move="${kind}-${index}-${delta}"]`;
        const button =
          this.host.nativeElement.querySelector<HTMLButtonElement>(selector);
        // At the end of the list that button is now disabled, so focus lands on
        // the row's other move button rather than being dropped.
        const fallback =
          this.host.nativeElement.querySelector<HTMLButtonElement>(
            `[data-move="${kind}-${index}-${-delta as -1 | 1}"]`,
          );
        (button?.disabled ? fallback : button)?.focus();
      },
      { injector: this.injector },
    );
  }

  /**
   * Open the panel on one chosen row.
   *
   * An entry added by hand has no catalogue page, and the panel answers that
   * with its reduced form rather than failing, so no row is unopenable.
   */
  public onDetails(entry: LoraSelection | TiSelection, index: number): void {
    const kind: CivitaiAssetKind = this.isLora(entry) ? 'lora' : 'ti';
    this.openRow.set({
      kind,
      index,
      target: {
        kind,
        modelId: entry.modelId ?? null,
        versionId:
          this.isLora(entry) && entry.is_version === true
            ? Number(entry.name)
            : null,
      },
    });
  }

  public closeDetails(): void {
    this.openRow.set(null);
  }

  /** The entry the open panel is editing, for it to seed itself from. */
  public openEntry(): LoraSelection | TiSelection | null {
    const open = this.openRow();
    if (!open) {
      return null;
    }
    return open.kind === 'lora'
      ? (this.loras()[open.index] ?? null)
      : (this.tis()[open.index] ?? null);
  }

  /**
   * Put an edited entry back where it was.
   *
   * By position rather than by name: re-pinning to another version changes the
   * name, so matching on it would append a second row instead of replacing one.
   */
  public onDetailApply(entry: LoraSelection | TiSelection): void {
    const open = this.openRow();
    if (!open) {
      return;
    }
    if (open.kind === 'lora') {
      this.lorasChange.emit(
        this.loras().map((row, i) =>
          i === open.index ? (entry as LoraSelection) : row,
        ),
      );
    } else {
      this.tisChange.emit(
        this.tis().map((row, i) =>
          i === open.index ? (entry as TiSelection) : row,
        ),
      );
    }
    this.closeDetails();
  }

  public onDetailRemove(): void {
    const open = this.openRow();
    if (!open) {
      return;
    }
    this.remove(open.kind, open.index);
    this.closeDetails();
  }

  public onAppendTrigger(trigger: string): void {
    this.appendToPrompt.emit(trigger);
  }
}
