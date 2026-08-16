import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsTryItService } from '../../services/gs-try-it.service';
import {
  GLOSSARY_TERMS,
  GlossaryService,
} from '../../services/glossary.service';
import { SectionIdentity } from '../../content/sections';
import { STUDIO_IMAGE } from '../../content/docs-links';
import { ReferenceTopic, referenceTopic } from '../../content/reference-topics';
import {
  SettingApply,
  SettingRange,
  SettingTradeoffs,
  sweepIsTimeline,
} from '../../content/settings';
import { IconComponent } from '../icon/icon.component';
import { GsDoorComponent } from '../gs-door/gs-door.component';
import { GsProseComponent } from '../gs-prose/gs-prose.component';
import { GsSweepGridComponent } from '../gs-sweep-grid/gs-sweep-grid.component';
import { GsSweepScrubComponent } from '../gs-sweep-scrub/gs-sweep-scrub.component';

/** How the meta-line marks each kind of cost. */
const TRADEOFF_ICONS = {
  speed: 'clock',
  kudos: 'currency-circle',
  quality: 'star',
} as const;

/**
 * One subject of the reference, written out in full: what it is, what it does,
 * what it costs, the numbers it lives between, and the pictures of it changing.
 *
 * This is the only place that composition exists. The routed reference page
 * mounts it, and the pane dock and the mobile sheet are meant to mount the same
 * component rather than a second rendering of the same content: a reader who
 * learned what guidance does in the dock and then opened the page should be
 * reading the same words, not a shorter paraphrase of them.
 *
 * The subject is a setting of the image panel or a use case of the alchemy
 * studio, and the entry does not know which: it asks {@link referenceTopic} for
 * keys and paths, and renders whichever parts came back. That is what keeps the
 * second studio from growing a second entry component whose prose, hue and
 * chrome would drift from this one's.
 *
 * Any piece of prose may be missing while the reference is being written, and a
 * missing one renders nothing at all: a page with no body reads as brief, a
 * page showing a translation key reads as broken.
 */
@Component({
  selector: 'app-gs-param-entry',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsDoorComponent,
    GsProseComponent,
    GsSweepScrubComponent,
    GsSweepGridComponent,
  ],
  template: `
    <!-- The prose is drawn by gs-prose, so a body may carry the site's inline
         marks. It is resolved through the pipe here as well, and only to spot
         the missing case: the answer comes back as the key when there is no
         translation for it, and that is the one thing that must never reach the
         page. -->
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
      <p class="gs-ref-lead"><app-gs-prose [key]="leadKey" /></p>
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

    @if (range() || (!onPage() && applies().length > 0)) {
      <p class="gs-ref-range">
        @if (range(); as bounds) {
          <span class="gs-ref-chip">{{
            'generate.reference.range_typical'
              | transloco: { value: bounds.typical }
          }}</span>
          @if (bounds.default; as fallback) {
            <span class="gs-ref-chip">{{
              'generate.reference.range_default'
                | transloco: { value: fallback }
            }}</span>
          }
        }
        <!-- Beside the studio the numbers the entry argues for are written into
             the form from here, which is a chip's worth of press. -->
        @if (!onPage()) {
          @for (option of applies(); track option.display) {
            <button
              type="button"
              class="gs-ref-chip gs-ref-chip--try"
              (click)="runApply(option)"
            >
              {{ tryKey() | transloco: { value: option.display } }}
            </button>
          }
        }
      </p>
    }

    <!-- The routed page has no form to write to: taking one of these numbers is
         a trip to the panel with the value in hand, which is a door rather than
         a chip. It carries the arrow every hand-off carries, and says what it
         will do before it does it. -->
    @if (onPage()) {
      @for (option of applies(); track option.display) {
        <app-gs-door
          kind="studio"
          controlClass="gs-ref-try-door"
          [title]="tryKey() | transloco: { value: option.display }"
          [meta]="'generate.sweeps.studio_door_note' | transloco"
          (entered)="runApply(option)"
        />
      }
    }

    @if (bodyText && bodyText !== bodyKey) {
      <p class="gs-ref-body"><app-gs-prose [key]="bodyKey" /></p>
    }

    <!-- The named members of the subject, where it is a family: which of the
         eleven upscalers, rather than what enlarging is. They are listed under
         the prose that says what the family does, because choosing between them
         is the second question and the reader should not be made to answer it
         before the first. -->
    @if (variants().length > 0) {
      <dl class="gs-ref-variants">
        @for (variant of variants(); track variant.id) {
          @let noteText = variant.noteKey | transloco;
          <dt class="gs-ref-variant-name">
            {{ variant.titleKey | transloco }}
          </dt>
          <dd class="gs-ref-variant-note">
            @if (noteText !== variant.noteKey) {
              {{ noteText }}
            }
          </dd>
        }
      </dl>
    }

    <!-- The routed page is about this one setting and has no prose for the
         pictures to bury, so they are already open on it; the dock and the sheet
         sit beside something else the reader is doing and keep the offer. -->
    @if (sweepParameter(); as parameter) {
      <app-gs-sweep-scrub [parameter]="parameter" [startExpanded]="onPage()" />
    }
    <!-- Further evidence about the same setting, under the strip of the setting
         itself: the reader has met the range before they are shown what one
         value of it is made of. The setting's own strip is the page's evidence
         and stays full size; a second scene of the same setting is a footnote to
         it and takes the compact card, so a second capsule does not read as a
         second subject. A timeline is a different kind of picture rather than
         more of the same one, so it keeps the full capsule and is introduced. -->
    @for (also of alsoStrips(); track also.parameter + (also.scene ?? '')) {
      @if (also.timeline) {
        <p class="gs-ref-strip-lead">
          {{ 'generate.sweeps.timeline_lead' | transloco }}
        </p>
      }
      <app-gs-sweep-scrub
        [parameter]="also.parameter"
        [sceneId]="also.scene"
        [register]="also.timeline ? 'full' : 'filmcard'"
      />
    }
    @if (sweepGridParameter(); as parameter) {
      <app-gs-sweep-grid [parameter]="parameter" [startExpanded]="onPage()" />
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

    @if (terms().length > 0) {
      <p class="gs-ref-terms">
        <span class="gs-ref-terms-head">{{
          'generate.reference.terms_head' | transloco
        }}</span>
        @for (term of terms(); track term.id) {
          <button type="button" class="gs-ref-term" (click)="openTerm(term.id)">
            {{ term.titleKey | transloco }}
          </button>
        }
      </p>
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
  private readonly tryIt = inject(GsTryItService);
  private readonly glossary = inject(GlossaryService);
  private readonly router = inject(Router);

  /** The reference topic this entry is the long form of. */
  public readonly topic = input.required<string>();
  /**
   * Where the entry is mounted. The routed page is the reference; the dock is a
   * borrowed copy of it beside the results (and, on a phone, in the sheet), and
   * says so in its footer.
   */
  public readonly mode = input<'page' | 'dock'>('page');

  /**
   * A value was written into the form from here. The mobile sheet listens so it
   * can get out of the way of the field it just changed.
   */
  public readonly applied = output<void>();

  public readonly icons = TRADEOFF_ICONS;

  private readonly entry = computed<ReferenceTopic | null>(() =>
    referenceTopic(this.topic()),
  );

  /** The mark and hue of the area this subject sits in. */
  public readonly identity = computed<SectionIdentity | null>(
    () => this.entry()?.identity ?? null,
  );

  /** Whether this is the reference itself rather than a copy of it beside something. */
  public readonly onPage = computed(() => this.mode() === 'page');

  /**
   * The hue the entry tints from, plus the mark of being the page rather than a
   * dock: the page is a wide column, and the figures in it are given a measure
   * of their own rather than being allowed to run its full width.
   */
  public readonly identityClass = computed(() =>
    [
      this.identity()?.className ?? '',
      this.onPage() ? 'gs-ref-entry--page' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  public readonly titleKey = computed(
    () => this.entry()?.titleKey ?? this.topic(),
  );

  /** The named members of a subject that is a family, in reading order. */
  public readonly variants = computed(() => this.entry()?.variants ?? []);

  /**
   * Where a piece of the entry's prose lives: `lead` is the one sentence for
   * someone meeting the subject, and `body` the depth beneath it.
   */
  public proseKey(part: 'lead' | 'body'): string {
    const entry = this.entry();
    if (!entry) {
      return this.topic();
    }
    return part === 'lead' ? entry.leadKey : entry.bodyKey;
  }

  public readonly tradeoffs = computed<SettingTradeoffs | null>(
    () => this.entry()?.tradeoffs ?? null,
  );
  public readonly range = computed<SettingRange | null>(
    () => this.entry()?.range ?? null,
  );
  public readonly links = computed(() => this.entry()?.links ?? []);

  /**
   * The values on offer here and now. A value the form would strip on submit is
   * not offered: beside a studio building a request with no source image, the
   * denoising chip would write a number the request never carries.
   */
  public readonly applies = computed<readonly SettingApply[]>(() =>
    (this.entry()?.applies ?? []).filter((option) =>
      this.tryIt.offerable(option),
    ),
  );

  /** How a try-it chip reads, which depends on whether the form is reachable. */
  public readonly tryKey = computed(() =>
    this.mode() === 'page'
      ? 'generate.reference.try_in_studio'
      : 'generate.reference.try_value',
  );

  public readonly sweepParameter = computed(() => this.entry()?.strip ?? null);

  /**
   * The further strips, each carrying whether it is one render over time. The
   * entry has to know: a timeline is the only one of these the page introduces
   * in words, because it is the only one whose frames are not answers to the
   * question the entry has just been asking.
   */
  public readonly alsoStrips = computed(() =>
    (this.entry()?.alsoStrips ?? []).map((also) => ({
      ...also,
      timeline: sweepIsTimeline(also.parameter),
    })),
  );
  public readonly sweepGridParameter = computed(
    () => this.entry()?.grid ?? null,
  );

  /** The siblings this entry points on to, already resolved for the template. */
  public readonly related = computed(() => this.entry()?.related ?? []);

  /**
   * The horde's own words this entry uses, as the dictionary holds them. Named
   * by the registry rather than found in the prose: a page that parsed its own
   * sentences for known words would light up "model" in the middle of a
   * paragraph about something else.
   */
  public readonly terms = computed(() =>
    (this.entry()?.glossaryTerms ?? []).flatMap((id) => {
      const term = GLOSSARY_TERMS.find((candidate) => candidate.id === id);
      return term ? [{ id: term.id, titleKey: term.titleKey }] : [];
    }),
  );

  /** Where the docked entry sends a reader who wants the whole page. */
  public readonly fullLink = computed(() => this.entry()?.fullLink ?? '');

  /**
   * Put one of the offered values in the form. Beside the studio that is the
   * write itself; from the routed page the value is armed and the studio
   * applies it on arrival, because a reference page has no form to write to and
   * saying "go and set it to 30 yourself" is not an offer.
   */
  public runApply(option: SettingApply): void {
    if (this.mode() === 'page') {
      this.tryIt.arm(option);
      void this.router.navigateByUrl(STUDIO_IMAGE);
      return;
    }
    this.tryIt.apply(option);
    this.applied.emit();
  }

  /** Open the dictionary at one of the words the entry leans on. */
  public openTerm(termId: string): void {
    this.glossary.open(termId);
  }
}
