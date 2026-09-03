import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NetworkStatusService } from '../../services/network-status.service';
import { UnitConversionService } from '../../services/unit-conversion.service';
import { IconComponent } from '../icon/icon.component';

export type NetworkStatusVariant = 'sidebar' | 'compact' | 'footer' | 'studio';

@Component({
  selector: 'app-network-status',
  imports: [TranslocoPipe, DecimalPipe, RouterLink, IconComponent],
  templateUrl: './network-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkStatusComponent {
  public readonly variant = input<NetworkStatusVariant>('sidebar');
  /**
   * Whether the page's own list of models failed to load. The studio notice
   * stands for that as well as for an unreachable API, because either one
   * leaves the reader unable to send anything.
   */
  public readonly modelsFailed = input(false);
  /** Ask the page to fetch again everything the notice is standing for. */
  public readonly retry = output<void>();
  public readonly ns = inject(NetworkStatusService);
  private readonly units = inject(UnitConversionService);

  /** Whether the studio notice has anything to say. */
  public readonly outage = computed(
    () => this.ns.reachable() === false || this.modelsFailed(),
  );

  /** Formats a plain count as an integer for <1000 or with K/M suffix above. */
  fmtCount(n: number): string {
    if (n < 1000) return String(n);
    const f = this.units.formatWithSiPrefix(n, '', 1);
    return `${f.value.toFixed(1)}${f.prefixShort}`;
  }

  /** Formats a valued unit (e.g. mps, tokens, forms) with K/M scaling and unit label. */
  fmtUnit(n: number, unit: string): string {
    const decimals = n >= 1000 ? 1 : 0;
    return this.units
      .formatWithSiPrefix(n, unit, decimals)
      .formattedShort.trim();
  }
}
