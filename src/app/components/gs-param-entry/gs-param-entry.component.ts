import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GsTryItService } from '../../services/gs-try-it.service';
import {
  GLOSSARY_TERMS,
  GlossaryService,
} from '../../services/glossary.service';
import { SectionIdentity } from '../../content/sections';
import { AlchemyEvidenceService } from '../../services/alchemy-evidence.service';
import { SweepLibraryService } from '../../services/sweep-library.service';
import {
  DOCS_IMAGE,
  DOCS_IMAGE_EXAMPLES_ANCHOR,
  STUDIO_IMAGE,
} from '../../content/docs-links';
import { ReferenceTopic, referenceTopic } from '../../content/reference-topics';
import {
  SettingApply,
  SettingRange,
  SettingTradeoffs,
  sweepIsTimeline,
} from '../../content/settings';
import { ALCHEMY_TOPIC_PREFIX } from '../../content/reference-topics';
import {
  CropSide,
  GsCropPairComponent,
} from '../gs-crop-pair/gs-crop-pair.component';
import { IconComponent } from '../icon/icon.component';
import { GsAnchorLinkComponent } from '../gs-anchor-link/gs-anchor-link.component';
import { GsDoorComponent } from '../gs-door/gs-door.component';
import { GsProseComponent } from '../gs-prose/gs-prose.component';
import { GsSweepGridComponent } from '../gs-sweep-grid/gs-sweep-grid.component';
import { GsSweepScrubComponent } from '../gs-sweep-scrub/gs-sweep-scrub.component';

/**
 * One matched pair of crops the entry shows, and how a reader moves it.
 *
 * A pair is always a reference frame against a chosen one, because the question
 * a finishing pass raises is "compared to what": the first stop of a ladder, or
 * the picture before the tool ran. Which frame is on the other side is the
 * reader's, so the pair carries the choices and which one is taken.
 */
interface CropPair {
  id: string;
  /** What this pair is a comparison of, as a key the entry translates. */
  titleKey: string;
  before: CropSide;
  after: CropSide;
  /** What the chosen side may be, in the order the library published them. */
  options: readonly { key: string; text: string }[];
  chosen: string;
  /**
   * Which stop of the strip the chosen side is, so the door can open the
   * explorer on it. Null for a pair the library published outside a strip,
   * which has no explorer to open.
   */
  stopAt: number | null;
}

/**
 * How many tutorials an entry names before it points at the whole list instead.
 *
 * A prompt is written in every technique there is, and a row of eight is a
 * second index rather than a way on: three is enough to show what kind of thing
 * is on the other side, and the shelf on the landing is already the list of all
 * of them.
 */
const TUTORIAL_LINK_CAP = 3;

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
    GsAnchorLinkComponent,
    GsDoorComponent,
    GsProseComponent,
    GsSweepScrubComponent,
    GsSweepGridComponent,
    GsCropPairComponent,
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
        <!-- The page is the subject, so what there is to share is the page: a
             fragment hung off the title would be a longer address that arrives
             in exactly the same place. -->
        <h1 class="gs-ref-title">
          {{ titleKey() | transloco }}
          <app-gs-anchor-link [label]="titleKey() | transloco" />
        </h1>
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

    @if (bodyText && bodyText !== bodyKey) {
      <!-- A div rather than a paragraph: a body long enough to need paragraphs
           and bullets of its own cannot render them inside a p element. -->
      <div class="gs-ref-body">
        <app-gs-prose [key]="bodyKey" [paragraphs]="true" />
      </div>
    }

    <!-- The routed page has no form to write to: taking one of these numbers is
         a trip to the panel with the value in hand, which is a door rather than
         a chip. It carries the arrow every hand-off carries, and says what it
         will do before it does it.

         It stands under the explanation rather than over it. A reader who has
         not been told yet what the number does has nothing to take to the panel,
         and an offer to go and try it is the wrong thing to meet first. -->
    @if (onPage() && applies().length > 0) {
      <div class="gs-ref-try-row">
        @for (option of applies(); track option.display) {
          <app-gs-door
            kind="studio"
            controlClass="gs-ref-try-door"
            [title]="tryKey() | transloco: { value: option.display }"
            [meta]="'generate.sweeps.studio_door_note' | transloco"
            (entered)="runApply(option)"
          />
        }
      </div>
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
      <app-gs-sweep-scrub
        #explorer
        [parameter]="parameter"
        [controlType]="sweepControlType()"
        [startExpanded]="opensItself()"
      />
    }
    <!-- Further evidence about the same setting, under the strip of the setting
         itself: the reader has met the range before they are shown what one
         value of it is made of. The setting's own strip is the page's evidence
         and stays full size; a second scene of the same setting is a footnote to
         it and takes the compact card, so a second capsule does not read as a
         second subject. A timeline is a different kind of picture rather than
         more of the same one, so it keeps the full capsule and is introduced.
         Where the strips are peers there is no footnote among them and they all
         take the full card. -->
    @for (also of alsoStrips(); track also.parameter + (also.scene ?? '')) {
      @if (also.timeline) {
        <p class="gs-ref-strip-lead">
          {{ 'generate.sweeps.timeline_lead' | transloco }}
        </p>
      }
      <app-gs-sweep-scrub
        [parameter]="also.parameter"
        [sceneId]="also.scene"
        [register]="also.register"
      />
    }
    @if (sweepGridParameter(); as parameter) {
      <app-gs-sweep-grid [parameter]="parameter" [startExpanded]="onPage()" />
    }
    <!-- That every strip above shows one prompt, model and seed is a fact
         about the page, so it is said once here rather than under each
         caption; the captions are left to say what is visible in a frame. -->
    @if (sweepParameter() || alsoStrips().length > 0 || sweepGridParameter()) {
      <p class="gs-ref-scope">
        {{ 'generate.reference.examples_scope' | transloco }}
      </p>
    }

    <!-- Where the difference actually is. A finishing pass moves a few hundred
         pixels of a frame that is two thousand across, so the strip above it
         settles nothing on its own: the library cuts the same rectangle from
         both frames and the pair is read here at the size the claim can be
         checked at. A subject the library published no crops for keeps the
         strip and shows nothing here. -->
    @if (cropPairs().length > 0) {
      <section class="gs-ref-evidence" id="gs-ref-sec-evidence">
        <h2 class="gs-guide-head">
          {{ 'generate.reference.evidence_head' | transloco }}
          <app-gs-anchor-link
            targetId="gs-ref-sec-evidence"
            [label]="'generate.reference.evidence_head' | transloco"
          />
        </h2>

        @for (pair of cropPairs(); track pair.id) {
          <figure class="gs-ref-pair">
            <figcaption class="gs-ref-pair-head">
              <span class="gs-ref-pair-name">
                {{ pair.titleKey | transloco }}
              </span>
              <span class="gs-ref-pair-note">
                {{ 'generate.reference.crop_note' | transloco }}
              </span>
            </figcaption>

            @if (pair.options.length > 1) {
              <div class="gs-ref-pair-pick">
                <span class="gs-ref-pair-pick-label" [id]="pair.id + '-pick'">
                  {{ 'generate.reference.crop_pick' | transloco }}
                </span>
                <div
                  class="gs-ref-pair-opts"
                  role="radiogroup"
                  [attr.aria-labelledby]="pair.id + '-pick'"
                >
                  @for (option of pair.options; track option.key) {
                    <button
                      type="button"
                      class="gs-chip gs-ref-pair-opt"
                      role="radio"
                      [class.is-on]="option.key === pair.chosen"
                      [attr.aria-checked]="option.key === pair.chosen"
                      (click)="chooseCrop(pair.id, option.key)"
                    >
                      {{ option.text }}
                    </button>
                  }
                </div>
              </div>
            }

            <app-gs-crop-pair [before]="pair.before" [after]="pair.after" />

            @if (pair.stopAt !== null) {
              <app-gs-door
                kind="grid"
                controlClass="gs-ref-pair-door"
                [title]="'generate.reference.crop_door' | transloco"
                [meta]="'generate.reference.crop_door_note' | transloco"
                [tiles]="[pair.before.src, pair.after.src]"
                (entered)="openCropInExplorer(pair.stopAt)"
              />
            }
          </figure>
        }
      </section>
    }

    @if (related().length > 0 || tutorials().length > 0) {
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
        <!-- Where the setting is actually set. A neighbour says what else is in
             the same part of the panel, which is a poor answer to "and when
             would I change this"; a tutorial shows somebody changing it. They
             carry the tutorials' cap and hue, and say so in words as well, so
             the two kinds of link are told apart without colour. -->
        @for (tutorial of tutorials(); track tutorial.id) {
          <a
            class="gs-ref-related-link gs-ref-related-link--tutorial"
            [routerLink]="tutorial.link"
          >
            <span class="gs-sec-chip" aria-hidden="true"
              ><app-icon name="academic-cap"
            /></span>
            <span class="sr-only"
              >{{ 'generate.reference.related_tutorial' | transloco }}
            </span>
            {{ tutorial.titleKey | transloco }}
          </a>
        }
        @if (moreTutorials()) {
          <a
            class="gs-ref-related-link gs-ref-related-link--tutorial"
            [routerLink]="allTutorialsLink"
            [fragment]="allTutorialsFragment"
          >
            <span class="gs-sec-chip" aria-hidden="true"
              ><app-icon name="academic-cap"
            /></span>
            {{ 'generate.reference.related_tutorials_all' | transloco }}
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
  private readonly sweeps = inject(SweepLibraryService);
  private readonly alchemy = inject(AlchemyEvidenceService);
  private readonly glossary = inject(GlossaryService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

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
   * The guidance mode the strip was rendered against, on the fields the library
   * swept once per detector. Undefined asks for the strip rendered against none.
   */
  public readonly sweepControlType = computed(
    () => this.entry()?.stripControlType ?? undefined,
  );

  /**
   * The further strips, each carrying whether it is one render over time. The
   * entry has to know: a timeline is the only one of these the page introduces
   * in words, because it is the only one whose frames are not answers to the
   * question the entry has just been asking.
   */
  public readonly alsoStrips = computed(() => {
    const coequal = this.coequalStrips();
    return (this.entry()?.alsoStrips ?? []).map((also) => {
      const timeline = sweepIsTimeline(also.parameter);
      return {
        ...also,
        timeline,
        register:
          timeline || coequal ? ('full' as const) : ('filmcard' as const),
      };
    });
  });

  /** Whether every strip on the entry is a subject in its own right. */
  public readonly coequalStrips = computed(
    () => this.entry()?.coequalStrips ?? false,
  );

  /**
   * Whether the primary strip is open before it is asked for. The page opens
   * the one picture its whole subject is about; where the strips are peers there
   * is no one picture, and opening the first would make the other three read as
   * afterthoughts to it.
   */
  public readonly opensItself = computed(
    () => this.onPage() && !this.coequalStrips(),
  );
  public readonly sweepGridParameter = computed(
    () => this.entry()?.grid ?? null,
  );

  /** The siblings this entry points on to, already resolved for the template. */
  public readonly related = computed(() => this.entry()?.related ?? []);

  /**
   * The tutorials that set this subject, read off the flows they are made of and
   * cut to the few the row can carry. The registry answers with all of them; how
   * many are worth naming beside a setting is this surface's question.
   */
  public readonly tutorials = computed(() =>
    (this.entry()?.tutorials ?? []).slice(0, TUTORIAL_LINK_CAP),
  );

  /** Whether more tutorials set this subject than the row has named. */
  public readonly moreTutorials = computed(
    () => (this.entry()?.tutorials ?? []).length > TUTORIAL_LINK_CAP,
  );

  /** Where the whole list of them is, which is the landing's shelf. */
  public readonly allTutorialsLink = DOCS_IMAGE;
  public readonly allTutorialsFragment = DOCS_IMAGE_EXAMPLES_ANCHOR;

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

  constructor() {
    // Both libraries answer with "nothing published" as readily as with
    // pictures, and the section renders nothing either way, so they are asked
    // for as the entry mounts rather than when a reader reaches the crops.
    void this.sweeps.ensureLoaded();
    void this.alchemy.ensureLoaded();
  }

  /* ---------- where the difference is, at true pixels ---------- */

  /** The explorer of the entry's own strip, which the pair's door opens. */
  private readonly explorer = viewChild('explorer', {
    read: GsSweepScrubComponent,
  });

  /** Which frame each pair is being read against, by pair, once chosen. */
  private readonly picked = signal<Readonly<Record<string, string>>>({});

  /**
   * Whether this entry may show a crop section at all. The alchemy pages carry
   * their own evidence section around this component, so a second one here
   * would put the same heading and the same anchor on the page twice; and the
   * docked copy sits beside the studio, where a pair drawn at true pixels has
   * no room to be read in.
   */
  private readonly showsCrops = computed(
    () => this.onPage() && !this.topic().startsWith(ALCHEMY_TOPIC_PREFIX),
  );

  /**
   * The pairs this entry has evidence for: the setting's own strip where the
   * library cut crops from its stops, and the alchemy runs of the tool the
   * setting hands the picture to. Both, where the library published both: one
   * says what the tools differ in and the other says what running one does at
   * all, and those are different questions.
   */
  public readonly cropPairs = computed<readonly CropPair[]>(() => {
    if (!this.showsCrops()) {
      return [];
    }
    return [this.stripPair(), this.alchemyPair()].filter(
      (pair): pair is CropPair => pair !== null,
    );
  });

  /** Read the other side of a pair against a different frame. */
  public chooseCrop(pairId: string, key: string): void {
    this.picked.update((current) => ({ ...current, [pairId]: key }));
  }

  /**
   * Open the strip's explorer on the frame the pair is comparing, at the file's
   * own pixels and centred on the crop. The pair says where the difference is;
   * the explorer is where the rest of the frame is.
   */
  public openCropInExplorer(at: number): void {
    this.explorer()?.openStopAtCrop(at);
  }

  /** The pair cut from the entry's own strip, where the library cut any. */
  private stripPair(): CropPair | null {
    const parameter = this.sweepParameter();
    const strip = parameter
      ? this.sweeps.strip(
          parameter,
          this.sweeps.studioModelSlug(),
          undefined,
          this.sweepControlType(),
        )
      : null;
    const stops = (strip?.stops ?? []).filter((stop) => !!stop.crop);
    if (stops.length < 2) {
      return null;
    }
    const id = 'gs-ref-pair-strip';
    const options = stops.slice(1).map((stop) => ({
      key: stop.label,
      text: String(stop.value),
    }));
    const chosen = this.chosenOf(id, options);
    const against = stops.find((stop) => stop.label === chosen) ?? stops[1];
    return {
      id,
      titleKey: 'generate.reference.crop_head_strip',
      before: this.sideOf(stops[0].crop!.file, stops[0].crop!, stops[0].value),
      after: this.sideOf(against.crop!.file, against.crop!, against.value),
      options,
      chosen,
      stopAt: strip!.stops.indexOf(against),
    };
  }

  /** The pair cut from the alchemy runs of the tool this setting reaches for. */
  private alchemyPair(): CropPair | null {
    const useCase = this.entry()?.alchemyEvidence;
    const entries = useCase
      ? this.alchemy
          .entriesFor(useCase)
          .filter((run) => !!run.source_crop && !!run.result_crop)
      : [];
    if (entries.length === 0) {
      return null;
    }
    const id = 'gs-ref-pair-alchemy';
    const options = entries.map((run) => ({ key: run.form, text: run.title }));
    const chosen = this.chosenOf(id, options);
    const run = entries.find((entry) => entry.form === chosen) ?? entries[0];
    return {
      id,
      titleKey: 'generate.reference.crop_head_alchemy',
      before: {
        src: this.alchemy.assetUrl(run.source_crop!.file),
        width: run.source_crop!.width,
        height: run.source_crop!.height,
        label: this.transloco.translate('alchemy.usecases.evidence_source'),
      },
      after: {
        src: this.alchemy.assetUrl(run.result_crop!.file),
        width: run.result_crop!.width,
        height: run.result_crop!.height,
        label: run.title,
      },
      options,
      chosen,
      stopAt: null,
    };
  }

  /** The frame a pair is read against: the reader's choice, or the first one. */
  private chosenOf(id: string, options: readonly { key: string }[]): string {
    const asked = this.picked()[id];
    return options.some((option) => option.key === asked)
      ? asked
      : (options[options.length - 1]?.key ?? '');
  }

  /** One side of a strip pair: the published crop, named by its own value. */
  private sideOf(
    file: string,
    crop: { width: number; height: number },
    value: string | number | boolean,
  ): CropSide {
    return {
      src: this.sweeps.assetUrl(file),
      width: crop.width,
      height: crop.height,
      label: String(value),
    };
  }
}
