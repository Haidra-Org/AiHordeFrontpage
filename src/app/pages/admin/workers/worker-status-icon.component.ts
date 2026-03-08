import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { WORKER_ICON_MAP } from './worker-icons';

@Component({
  selector: 'app-worker-status-icon',
  template: `
    @if (iconDef(); as def) {
      <svg
        [class]="svgClass()"
        [style.transform]="def.transform ?? ''"
        fill="none"
        stroke="currentColor"
        [attr.viewBox]="def.viewBox"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          [attr.d]="def.pathData"
        />
      </svg>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerStatusIconComponent {
  public readonly type = input.required<string>();
  public readonly sizeClass = input('w-5 h-5');

  public readonly iconDef = computed(() =>
    WORKER_ICON_MAP.get(this.type()) ?? null,
  );

  public readonly svgClass = computed(() => {
    const def = this.iconDef();
    if (!def) return this.sizeClass();
    return `${this.sizeClass()} ${def.colorClass}`;
  });
}
