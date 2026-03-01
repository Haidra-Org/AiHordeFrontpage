import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NetworkStatusService } from '../../services/network-status.service';
import { UnitConversionService } from '../../services/unit-conversion.service';

export type NetworkStatusVariant = 'sidebar' | 'compact' | 'footer';

@Component({
  selector: 'app-network-status',
  imports: [TranslocoPipe, DecimalPipe, RouterLink],
  templateUrl: './network-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkStatusComponent {
  public readonly variant = input<NetworkStatusVariant>('sidebar');
  public readonly ns = inject(NetworkStatusService);
  private readonly units = inject(UnitConversionService);

  /** Formats a plain count as an integer for <1000 or with K/M suffix above. */
  fmtCount(n: number): string {
    if (n < 1000) return String(n);
    const f = this.units.formatWithSiPrefix(n, '', 1);
    return `${f.value.toFixed(1)}${f.prefixShort}`;
  }

  /** Formats a valued unit (e.g. mps, tokens, forms) with K/M scaling and unit label. */
  fmtUnit(n: number, unit: string): string {
    const decimals = n >= 1000 ? 1 : 0;
    return this.units.formatWithSiPrefix(n, unit, decimals).formattedShort.trim();
  }
}
