import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { combineLatest } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { WorkerListComponent } from '../../admin/workers/worker-list.component';

@Component({
  selector: 'app-public-workers',
  imports: [WorkerListComponent],
  templateUrl: './public-workers.component.html',
  styleUrl: './public-workers.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicWorkersComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    combineLatest([
      this.translator.get('details.workers.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([workersTitle, appTitle]) => {
        this.title.setTitle(`${workersTitle} | ${appTitle}`);
      });
  }
}
