import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { WorkerCardDisplayService } from '../../services/worker-card-display.service';
import {
  FIELD_UI_METADATA,
  MODERATOR_ONLY_FIELDS,
  WorkerCardField,
} from '../../types/worker-card-display';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-worker-card-display-settings',
  standalone: true,
  imports: [TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <div class="worker-display-settings">
      <button
        type="button"
        class="btn-icon"
        [title]="'admin.workers.display_settings.title' | transloco"
        (click)="toggle(); $event.stopPropagation()"
      >
        <app-icon name="adjustments-horizontal" class="icon-md" />
      </button>

      @if (open()) {
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
        <div
          class="worker-display-settings-panel surface-floating"
          (click)="$event.stopPropagation()"
        >
          <h4 class="worker-display-settings-heading">
            {{ 'admin.workers.display_settings.title' | transloco }}
          </h4>

          @for (group of visibleGroups(); track group.group) {
            <div class="worker-display-settings-group">
              <span class="worker-display-settings-group-label">
                {{ group.groupLabelKey | transloco }}
              </span>
              @for (field of group.fields; track field.key) {
                <label class="worker-display-settings-check">
                  <input
                    type="checkbox"
                    [checked]="displayService.isFieldVisible(field.key)"
                    (change)="displayService.toggleField(field.key)"
                  />
                  <span>{{ field.labelKey | transloco }}</span>
                </label>
              }
            </div>
          }

          <div class="worker-display-settings-divider"></div>

          <label class="worker-display-settings-check">
            <input
              type="checkbox"
              [checked]="displayService.hideUnsetFields()"
              (change)="
                displayService.setHideUnsetFields(
                  !displayService.hideUnsetFields()
                )
              "
            />
            <span>{{
              'admin.workers.display_settings.hide_unset' | transloco
            }}</span>
          </label>

          <label class="worker-display-settings-check">
            <input
              type="checkbox"
              [checked]="displayService.alwaysShowOwnWorkerFields()"
              (change)="
                displayService.setAlwaysShowOwnWorkerFields(
                  !displayService.alwaysShowOwnWorkerFields()
                )
              "
            />
            <span>{{
              'admin.workers.display_settings.always_show_own' | transloco
            }}</span>
          </label>

          <div class="worker-display-settings-divider"></div>

          <button
            type="button"
            class="worker-display-settings-reset"
            (click)="displayService.resetToDefaults()"
          >
            {{ 'admin.workers.display_settings.reset' | transloco }}
          </button>
        </div>
      }
    </div>
  `,
})
export class WorkerCardDisplaySettingsComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly displayService = inject(WorkerCardDisplayService);

  public isModerator = input(false);
  public open = signal(false);

  public visibleGroups = () => {
    const mod = this.isModerator();
    return FIELD_UI_METADATA.filter((group) => {
      const visibleFields = group.fields.filter(
        (f) => mod || !MODERATOR_ONLY_FIELDS.includes(f.key),
      );
      return visibleFields.length > 0;
    }).map((group) => ({
      ...group,
      fields: group.fields.filter(
        (f) => mod || !MODERATOR_ONLY_FIELDS.includes(f.key),
      ),
    }));
  };

  public toggle(): void {
    this.open.update((v) => !v);
  }

  public close(): void {
    this.open.set(false);
  }

  public onDocumentClick(event: Event): void {
    if (!this.open()) return;
    if (this.elementRef.nativeElement.contains(event.target as Node)) return;
    this.close();
  }

  public onFieldToggle(field: WorkerCardField): void {
    this.displayService.toggleField(field);
  }
}
