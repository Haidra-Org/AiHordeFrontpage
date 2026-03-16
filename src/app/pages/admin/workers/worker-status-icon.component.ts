import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { IconComponent } from '../../../components/icon/icon.component';
import { WORKER_ICON_MAP } from './worker-icons';

@Component({
  selector: 'app-worker-status-icon',
  imports: [IconComponent],
  template: `
    @if (iconDef(); as def) {
      <app-icon [name]="def.iconName" [class]="svgClass()" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerStatusIconComponent {
  public readonly type = input.required<string>();
  public readonly sizeClass = input('w-5 h-5');

  public readonly iconDef = computed(
    () => WORKER_ICON_MAP.get(this.type()) ?? null,
  );

  public readonly svgClass = computed(() => {
    const def = this.iconDef();
    if (!def) return this.sizeClass();
    return `${this.sizeClass()} ${def.colorClass}`;
  });
}
