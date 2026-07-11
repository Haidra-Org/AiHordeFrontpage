import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, merge, startWith, switchMap } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  CivitaiModel,
  CivitaiModelType,
  CivitaiService,
} from '../../../services/civitai.service';
import {
  DEFAULT_LORA_STRENGTH,
  GenerateFormGroup,
} from '../generate-form.model';

/** Which resource tab the picker is showing; maps to a {@link CivitaiModelType}. */
type PickerTab = 'lora' | 'ti';

/**
 * A CivitAI browse-and-add modal, projected over the /generate form. Searches
 * the live CivitAI catalogue through {@link CivitaiService} and toggles the
 * selected model into the parent form's `loras`/`tis` controls (a LoRA carries
 * model + clip strengths, a textual inversion a single strength). The horde
 * consumes the CivitAI model id as the asset `name`; the model's display name is
 * kept only as the entry `label` for a friendly list row and is never submitted.
 */
@Component({
  selector: 'app-civitai-picker',
  imports: [ReactiveFormsModule, TranslocoPipe, IconComponent],
  templateUrl: './civitai-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CivitaiPickerComponent implements OnInit {
  private readonly civitai = inject(CivitaiService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly form = input.required<GenerateFormGroup>();
  public readonly closed = output<void>();

  public readonly queryControl = new FormControl('', { nonNullable: true });
  public readonly tab = signal<PickerTab>('lora');
  public readonly results = signal<CivitaiModel[]>([]);
  public readonly loading = signal(false);
  public readonly errored = signal(false);

  /** A new search fires on tab change (query changes fire from the control). */
  private readonly retrigger = new Subject<void>();

  /** Total selected assets, for the footer "N selected" affordance. */
  public readonly selectedCount = computed(() => {
    const controls = this.form().controls;
    return controls.loras.value.length + controls.tis.value.length;
  });

  public ngOnInit(): void {
    merge(
      this.queryControl.valueChanges.pipe(debounceTime(350)),
      this.retrigger,
    )
      .pipe(
        startWith(null),
        switchMap(() => {
          const type: CivitaiModelType =
            this.tab() === 'ti' ? 'TextualInversion' : 'LORA';
          this.loading.set(true);
          this.errored.set(false);
          return this.civitai.searchModels({
            query: this.queryControl.value.trim() || undefined,
            type,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result.kind === 'success') {
          this.results.set(result.items);
        } else {
          this.errored.set(true);
          this.results.set([]);
        }
      });
  }

  public setTab(tab: PickerTab): void {
    if (this.tab() !== tab) {
      this.tab.set(tab);
      this.results.set([]);
      this.retrigger.next();
    }
  }

  public isAdded(model: CivitaiModel): boolean {
    const name = String(model.id);
    const controls = this.form().controls;
    return model.type === 'TextualInversion'
      ? controls.tis.value.some((ti) => ti.name === name)
      : controls.loras.value.some((lora) => lora.name === name);
  }

  /** Add the model to the form if absent, or remove it if already present. */
  public toggle(model: CivitaiModel): void {
    const name = String(model.id);
    if (model.type === 'TextualInversion') {
      const control = this.form().controls.tis;
      const next = this.isAdded(model)
        ? control.value.filter((ti) => ti.name !== name)
        : [
            ...control.value,
            { name, strength: DEFAULT_LORA_STRENGTH, label: model.name },
          ];
      control.setValue(next);
      control.markAsDirty();
    } else {
      const control = this.form().controls.loras;
      const next = this.isAdded(model)
        ? control.value.filter((lora) => lora.name !== name)
        : [
            ...control.value,
            {
              name,
              model: DEFAULT_LORA_STRENGTH,
              clip: DEFAULT_LORA_STRENGTH,
              label: model.name,
            },
          ];
      control.setValue(next);
      control.markAsDirty();
    }
  }

  /** Deterministic placeholder gradient for a result without a thumbnail. */
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

  public onClose(): void {
    this.closed.emit();
  }

  /** Close only when the backdrop itself is clicked, not the panel within it. */
  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }
}
