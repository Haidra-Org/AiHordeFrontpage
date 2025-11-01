import { Component, OnInit } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { ToolCardComponent } from '../../../../components/tool-card/tool-card.component';
import { DataService } from '../../../../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { KeyValuePipe } from '@angular/common';
import { NoSorterKeyValue } from '../../../../types/no-sorter-key-value';

@Component({
  selector: 'app-homepage-tools',
  standalone: true,
  imports: [TranslocoModule, ToolCardComponent, KeyValuePipe],
  templateUrl: './homepage-tools.component.html',
  styleUrl: './homepage-tools.component.css',
})
export class HomepageToolsComponent {
  protected readonly NoSorterKeyValue = NoSorterKeyValue;

  public tools = toSignal(this.dataService.tools);

  constructor(private readonly dataService: DataService) {}
}
