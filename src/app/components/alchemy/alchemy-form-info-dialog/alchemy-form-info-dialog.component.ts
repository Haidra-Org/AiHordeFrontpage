import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../icon/icon.component';
import { AlchemyFormName } from '../../../types/generation';

export interface AlchemyFormInfoDialogData {
  formName: AlchemyFormName;
}

/**
 * Modal dialog that displays detailed information about an alchemy form.
 * Used on mobile/narrow screens where inline explanations would be offscreen.
 */
@Component({
  selector: 'app-alchemy-form-info-dialog',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <div class="alchemy-form-info-dialog">
      <div class="alchemy-form-info-dialog__header">
        <h2 class="alchemy-form-info-dialog__title">
          {{ 'alchemy.form_names.' + formName() | transloco }}
        </h2>
        <button
          type="button"
          class="alchemy-form-info-dialog__close"
          (click)="close()"
          aria-label="Close dialog"
        >
          <app-icon name="x" />
        </button>
      </div>

      <div class="alchemy-form-info-dialog__content">
        <div class="alchemy-form-info-dialog__section">
          <h3 class="alchemy-form-info-dialog__label">
            {{ 'alchemy.form_info_dialog.description' | transloco }}
          </h3>
          <p class="alchemy-form-info-dialog__text">
            {{ 'alchemy.form_meta.' + formName() + '.desc' | transloco }}
          </p>
        </div>

        @if (hasExample()) {
          <div class="alchemy-form-info-dialog__section">
            <h3 class="alchemy-form-info-dialog__label">
              {{ 'alchemy.form_info_dialog.example' | transloco }}
            </h3>
            <p class="alchemy-form-info-dialog__text alchemy-form-info-dialog__text--example">
              {{ 'alchemy.form_meta.' + formName() + '.example' | transloco }}
            </p>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlchemyFormInfoDialogComponent {
  private readonly dialogRef = inject(DialogRef);
  private readonly data = inject<AlchemyFormInfoDialogData>(DIALOG_DATA);

  public readonly formName = signal(this.data.formName);

  /**
   * Upscaler forms have badge metadata rather than example text.
   */
  private readonly formsWithoutExamples = new Set<AlchemyFormName>([
    'strip_background',
  ]);

  public hasExample(): boolean {
    return !this.formsWithoutExamples.has(this.formName());
  }

  public close(): void {
    this.dialogRef.close();
  }
}
