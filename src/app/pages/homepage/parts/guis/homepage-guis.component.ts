import { Component, computed, OnInit } from '@angular/core';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { KeyValuePipe, UpperCasePipe } from '@angular/common';
import { GuiCardComponent } from '../../../../components/gui-card/gui-card.component';
import { DataService } from '../../../../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { NoSorterKeyValue } from '../../../../types/no-sorter-key-value';

@Component({
  selector: 'app-homepage-guis',
  standalone: true,
  imports: [TranslocoModule, GuiCardComponent, KeyValuePipe],
  templateUrl: './homepage-guis.component.html',
  styleUrl: './homepage-guis.component.css',
})
export class HomepageGuisComponent {
  protected readonly NoSorterKeyValue = NoSorterKeyValue;

  private imageGuis = toSignal(this.dataService.imageGuis);
  private textGuis = toSignal(this.dataService.textGuis);

  public guis = computed(() => {
    if (this.imageGuis() === undefined || this.textGuis() === undefined) {
      return undefined;
    }

    return {
      [this.translator.translate('guis.image')]: this.imageGuis(),
      [this.translator.translate('guis.text')]: this.textGuis(),
    };
  });

  constructor(
    private readonly dataService: DataService,
    private readonly translator: TranslocoService,
  ) {}
}
