import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  SECTION_IDENTITIES,
  SectionIdentity,
} from '../../pages/generate/section-identity';
import {
  ReferenceEntry,
  ReferenceRange,
  ReferenceTradeoffs,
  referenceEntry,
  referenceSection,
  referenceSweep,
  referenceSweepGrid,
} from '../../pages/generate/reference-data';
import { IconComponent } from '../icon/icon.component';
import { GsSweepGridComponent } from '../gs-sweep-grid/gs-sweep-grid.component';
import { GsSweepScrubComponent } from '../gs-sweep-scrub/gs-sweep-scrub.component';

/** Where the routed reference lives, for the way out of a docked entry. */
const REFERENCE_ROOT = '/generate/learn/settings';

/** How the meta-line marks each kind of cost. */
const TRADEOFF_ICONS = {
  speed: 'clock',
  kudos: 'currency-circle',
  quality: 'star',
} as const;

/**
 * One setting, written out in full: what it is, what it does, what it costs, the
 * numbers it lives between, and the pictures of it changing.
 *
 * This is the only place that composition exists. The routed reference page
 * mounts it, and the pane dock and the mobile sheet are meant to mount the same
 * component rather than a second rendering of the same content: a reader who
 * learned what guidance does in the dock and then opened the page should be
 * reading the same words, not a shorter paraphrase of them.
 *
 * Content lives under `generate.reference.<topic>.lead` (one sentence for
 * someone meeting the setting) and `.body` (the depth). Either may be missing
 * while the reference is being written, and a missing one renders nothing at
 * all: a page with no body reads as brief, a page showing a translation key
 * reads as broken.
 */
@Component({
  selector: 'app-gs-param-entry',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsSweepScrubComponent,
    GsSweepGridComponent,
  ],
  template: `
    <!-- The prose is resolved through the pipe like everything else, and the
         missing case is spotted by the answer coming back as the key: that is
         what the service does with a key it has no translation for, and it is
         the one thing that must never reach the page. -->
    @let leadKey = proseKey('lead');
    @let leadText = leadKey | transloco;
    @let bodyKey = proseKey('body');
    @let bodyText = bodyKey | transloco;

    <header class="gs-ref-head">
      @if (identity(); as identity) {
        <span class="gs-sec-chip gs-sec-chip--lg" aria-hidden="true"
          ><app-icon [name]="identity.icon"
        /></span>
      }
      @if (mode() === 'page') {
        <h1 class="gs-ref-title">{{ titleKey() | transloco }}</h1>
      } @else {
        <h2 class="gs-ref-title">{{ titleKey() | transloco }}</h2>
      }
    </header>

    @if (leadText && leadText !== leadKey) {
      <p class="gs-ref-lead">{{ leadText }}</p>
    }

    @if (tradeoffs(); as costs) {
      <p
        class="gs-ref-costs"
        [attr.aria-label]="'generate.reference.tradeoff_label' | transloco"
      >
        @if (costs.speed; as speed) {
          <span class="gs-ref-cost">
            <app-icon [name]="icons.speed" class="gs-ico-sm" />
            {{ 'generate.reference.tradeoff_speed_' + speed | transloco }}
          </span>
        }
        @if (costs.kudos; as kudos) {
          <span class="gs-ref-cost">
            <app-icon [name]="icons.kudos" class="gs-ico-sm" />
            {{ 'generate.reference.tradeoff_kudos_' + kudos | transloco }}
          </span>
        }
        @if (costs.quality; as quality) {
          <span class="gs-ref-cost">
            <app-icon [name]="icons.quality" class="gs-ico-sm" />
            {{ quality | transloco }}
          </span>
        }
      </p>
    }

    @if (range(); as bounds) {
      <p class="gs-ref-range">
        <span class="gs-ref-chip">{{
          'generate.reference.range_typical'
            | transloco: { value: bounds.typical }
        }}</span>
        @if (bounds.default; as fallback) {
          <span class="gs-ref-chip">{{
            'generate.reference.range_default' | transloco: { value: fallback }
          }}</span>
        }
      </p>
    }

    @if (bodyText && bodyText !== bodyKey) {
      <p class="gs-ref-body">{{ bodyText }}</p>
    }

    @if (sweepParameter(); as parameter) {
      <app-gs-sweep-scrub [parameter]="parameter" />
    }
    @if (sweepGridParameter(); as parameter) {
      <app-gs-sweep-grid [parameter]="parameter" />
    }

    @if (related().length > 0) {
      <nav
        class="gs-ref-related"
        [attr.aria-label]="'generate.reference.related_label' | transloco"
      >
        <span class="gs-ref-related-head">{{
          'generate.reference.related_head' | transloco
        }}</span>
        @for (sibling of related(); track sibling.id) {
          <a
            class="gs-ref-related-link"
            [class]="sibling.className"
            [routerLink]="sibling.link"
          >
            @if (sibling.icon; as icon) {
              <span class="gs-sec-chip" aria-hidden="true"
                ><app-icon [name]="icon"
              /></span>
            }
            {{ sibling.titleKey | transloco }}
          </a>
        }
      </nav>
    }

    @if (links(); as external) {
      @if (external.length > 0) {
        <p class="gs-ref-links">
          @for (link of external; track link.routerLink) {
            <a class="gs-ref-link" [routerLink]="link.routerLink">
              <app-icon name="arrow-top-right-on-square" class="gs-ico-sm" />
              {{ link.labelKey | transloco }}
            </a>
          }
        </p>
      }
    }

    <!-- The dock is a way into the reference rather than the reference itself,
         so it always says where the rest of it is. The routed page is already
         there and would be pointing at itself. -->
    @if (mode() === 'dock') {
      <footer class="gs-ref-foot">
        <a class="gs-ref-full" [routerLink]="fullLink()">
          {{ 'generate.reference.open_full' | transloco }}
        </a>
      </footer>
    }
  `,
  host: {
    class: 'gs-ref-entry',
    '[class]': 'identityClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsParamEntryComponent {
  /** The `generate.help.<topic>` setting this entry is the long form of. */
  public readonly topic = input.required<string>();
  /**
   * Where the entry is mounted. The routed page is the reference; the dock is a
   * borrowed copy of it beside the results, and says so in its footer.
   */
  public readonly mode = input<'page' | 'dock'>('page');

  public readonly icons = TRADEOFF_ICONS;

  private readonly entry = computed<ReferenceEntry | undefined>(() =>
    referenceEntry(this.topic()),
  );

  /** The mark and hue of the panel area this setting sits in. */
  public readonly identity = computed<SectionIdentity | null>(() => {
    const section = referenceSection(this.topic());
    return section ? SECTION_IDENTITIES[section] : null;
  });

  public readonly identityClass = computed(
    () => this.identity()?.className ?? '',
  );

  public readonly titleKey = computed(
    () => `generate.help.${this.topic()}.title`,
  );

  /**
   * Where a piece of the entry's prose lives: `lead` is the one sentence for
   * someone meeting the setting, and `body` the depth beneath it.
   */
  public proseKey(part: 'lead' | 'body'): string {
    return `generate.reference.${this.topic()}.${part}`;
  }

  public readonly tradeoffs = computed<ReferenceTradeoffs | null>(
    () => this.entry()?.tradeoffs ?? null,
  );
  public readonly range = computed<ReferenceRange | null>(
    () => this.entry()?.range ?? null,
  );
  public readonly links = computed(() => this.entry()?.links ?? []);

  public readonly sweepParameter = computed(() => referenceSweep(this.topic()));
  public readonly sweepGridParameter = computed(() =>
    referenceSweepGrid(this.topic()),
  );

  /** The siblings this entry points on to, already resolved for the template. */
  public readonly related = computed(() =>
    (this.entry()?.related ?? []).map((id) => {
      const section = referenceSection(id);
      const identity = section ? SECTION_IDENTITIES[section] : null;
      return {
        id,
        titleKey: `generate.help.${id}.title`,
        link: `${REFERENCE_ROOT}/${id}`,
        icon: identity?.icon ?? '',
        className: identity?.className ?? '',
      };
    }),
  );

  /** Where the docked entry sends a reader who wants the whole page. */
  public readonly fullLink = computed(
    () => `${REFERENCE_ROOT}/${this.topic()}`,
  );
}
