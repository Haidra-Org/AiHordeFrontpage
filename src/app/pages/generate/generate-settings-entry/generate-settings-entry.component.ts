import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { GsParamEntryComponent } from '../../../components/gs-param-entry/gs-param-entry.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { referenceEntry, referenceNeighbours } from '../reference-data';

/** Where the index lives, and what an unknown setting falls back to. */
const REFERENCE_ROOT = '/generate/learn/settings';

/**
 * One setting's page. It is deliberately thin: the entry itself is the shared
 * component, and this adds only the frame a routed page needs, which is the way
 * back to the index and the way on to the next setting in the same area.
 *
 * A URL naming a setting the reference has no entry for lands on the index
 * rather than on an empty page. Those URLs are worth typing at (`.../steps`),
 * so getting one slightly wrong should show a reader the list.
 */
@Component({
  selector: 'app-generate-settings-entry',
  imports: [TranslocoPipe, RouterLink, IconComponent, GsParamEntryComponent],
  templateUrl: './generate-settings-entry.component.html',
  host: {
    class: 'gs-ref-page',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateSettingsEntryComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The setting the URL names, before it is known to be one there is. */
  public readonly param = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('param') ?? '')),
    { initialValue: '' },
  );

  public readonly indexLink = REFERENCE_ROOT;

  /** The setting on screen, or null while the URL names one there is none of. */
  public readonly topic = computed(() =>
    referenceEntry(this.param()) ? this.param() : null,
  );

  private readonly neighbours = computed(() => {
    const id = this.topic();
    return id
      ? referenceNeighbours(id)
      : { previous: null, next: null as string | null };
  });

  public readonly previous = computed(() =>
    this.link(this.neighbours().previous),
  );
  public readonly next = computed(() => this.link(this.neighbours().next));

  constructor() {
    effect(() => {
      if (this.param() !== '' && this.topic() === null) {
        void this.router.navigateByUrl(REFERENCE_ROOT);
      }
    });
  }

  private link(
    id: string | null,
  ): { id: string; titleKey: string; link: string } | null {
    return id
      ? {
          id,
          titleKey: `generate.help.${id}.title`,
          link: `${REFERENCE_ROOT}/${id}`,
        }
      : null;
  }
}
