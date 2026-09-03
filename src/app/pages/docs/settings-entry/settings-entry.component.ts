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
import {
  REFERENCE_ORIGIN_STATE,
  ReferenceOrigin,
} from '../../../components/gs-setting-chip/gs-setting-chip.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { sectionIdentity } from '../../../content/sections';
import {
  DOCS_IMAGE_SETTINGS,
  DOCS_UNKNOWN_ID_STATE,
  docsSettingLink,
} from '../../../content/docs-links';
import { settingCardUrl } from '../../../content/share-cards';
import { setPageMeta } from '../../../helper/page-meta';
import {
  hasReference,
  settingNeighbours,
  settingLeadKey,
  settingSection,
  settingTitleKey,
  settingIdFor,
} from '../../../content/settings';

/** The origin a setting chip stowed in the navigation state, if it is one. */
function readOrigin(
  state: Record<string, unknown> | undefined,
): ReferenceOrigin | null {
  const candidate = state?.[REFERENCE_ORIGIN_STATE];
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as ReferenceOrigin).url === 'string' &&
    typeof (candidate as ReferenceOrigin).title === 'string'
  ) {
    const origin = candidate as ReferenceOrigin;
    // The declared name is optional and comes off navigation state, so a
    // malformed one is dropped rather than rendered as a raw key.
    return typeof origin.returnLabelKey === 'string' || !origin.returnLabelKey
      ? origin
      : { url: origin.url, title: origin.title };
  }
  return null;
}

/** One way onwards, carrying the identity of the entry it leads to. */
interface OnwardLink {
  id: string;
  titleKey: string;
  link: string;
  /** Hue class of the target's section, so the link is tinted by where it goes. */
  className: string;
  /** The target section's glyph, rendered only when the link crosses into it. */
  icon: string | null;
  /** The target section's name, set only when it is not the one being read. */
  sectionLabelKey: string | null;
}

/**
 * One setting's page. It is deliberately thin: the entry itself is the shared
 * component, and this adds only the frame a routed page needs, which is the way
 * back to the index and the way on to the next setting in reading order.
 *
 * A URL naming a setting the reference has no entry for lands on the index
 * rather than on an empty page. Those URLs are worth typing at (`.../steps`),
 * so getting one slightly wrong should show a reader the list.
 */
@Component({
  selector: 'app-docs-settings-entry',
  imports: [TranslocoPipe, RouterLink, IconComponent, GsParamEntryComponent],
  templateUrl: './settings-entry.component.html',
  host: {
    class: 'gs-ref-page',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsSettingsEntryComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The setting the URL names, before it is known to be one there is. */
  public readonly param = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('param') ?? '')),
    { initialValue: '' },
  );

  public readonly indexLink = DOCS_IMAGE_SETTINGS;

  /**
   * Where the reader came from, when a setting chip on another page sent them
   * here. Read once at construction from the navigation that mounted the page:
   * a link followed from the entry itself, or a reload, has no origin and shows
   * only the way to the index.
   */
  public readonly origin: ReferenceOrigin | null = readOrigin(
    this.router.getCurrentNavigation()?.extras.state,
  );

  public returnToOrigin(event: Event): void {
    event.preventDefault();
    if (this.origin) {
      void this.router.navigateByUrl(this.origin.url);
    }
  }

  /**
   * The setting on screen, or null while the URL names one there is none of.
   * The URL may carry an API field or sweep name (cfg_scale) for a setting
   * whose id differs (cfg); the id is what every key is built from.
   */
  public readonly topic = computed(() => {
    const id = settingIdFor(this.param());
    return hasReference(id) ? id : null;
  });

  /** The area the entry on screen belongs to, to tell a crossing from a step. */
  private readonly section = computed(() => {
    const id = this.topic();
    return id ? settingSection(id) : undefined;
  });

  private readonly neighbours = computed(() => {
    const id = this.topic();
    return id
      ? settingNeighbours(id)
      : { previous: null, next: null as string | null };
  });

  public readonly previous = computed(() =>
    this.link(this.neighbours().previous),
  );
  public readonly next = computed(() => this.link(this.neighbours().next));

  constructor() {
    // The page's subject comes out of the URL, so its name and its sentence are
    // read from whichever setting is on screen rather than fixed at mount.
    setPageMeta({
      titleKey: () => {
        const id = this.topic();
        return id ? settingTitleKey(id) : null;
      },
      descriptionKey: () => {
        const id = this.topic();
        return id ? settingLeadKey(id) : null;
      },
      image: () => {
        const id = this.topic();
        return id ? settingCardUrl(id) : null;
      },
    });
    // A URL naming no setting lands on the index, carrying the name it named so
    // the index can say why it is the page in front of the reader.
    effect(() => {
      const named = this.param();
      if (named !== '' && this.topic() === null) {
        void this.router.navigateByUrl(DOCS_IMAGE_SETTINGS, {
          state: { [DOCS_UNKNOWN_ID_STATE]: named },
        });
      }
    });
  }

  private link(id: string | null): OnwardLink | null {
    if (!id) {
      return null;
    }
    const section = settingSection(id);
    const identity = sectionIdentity(section);
    const crosses = section !== undefined && section !== this.section();
    return {
      id,
      titleKey: settingTitleKey(id),
      link: docsSettingLink(id),
      className: identity?.className ?? '',
      icon: crosses ? (identity?.icon ?? null) : null,
      sectionLabelKey: crosses ? (identity?.labelKey ?? null) : null,
    };
  }
}
