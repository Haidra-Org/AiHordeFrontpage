import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { GsHelpService } from '../../services/gs-help.service';
import { referenceTopic } from '../../content/reference-topics';
import { SettingLink } from '../../content/settings';
import { SweepLibraryService } from '../../services/sweep-library.service';
import { IconComponent } from '../icon/icon.component';

/**
 * The studio's per-field help affordance: a small circled "?" beside a label
 * that expands a plain-language note about what the field does.
 *
 * The note is rendered inline, immediately below the row it belongs to, rather
 * than as a floating popover. The control panel body is a scroll container with
 * its own containing block (`.gs-body`), so a positioned popover would either be
 * clipped by it or have to be measured and re-anchored on every scroll; an
 * inline note cannot be clipped, reads in DOM order, and works the same on touch
 * as with a mouse. It also means the trigger toggles on click/Enter/Space only:
 * expanding on hover or on tab-focus would shift the rest of the form under the
 * pointer while the reader is aiming at something else.
 *
 * The note is prose and the ways out of it. It used to mount the parameter
 * sweeps under itself, which pushed the field it was describing off the screen
 * the moment anyone asked what the field was; the pictures, the numbers and the
 * depth now live in the setting's reference entry, and the note offers the way
 * to it rather than becoming it.
 *
 * The ways out are the subject's own `links`, the same pages the reference entry
 * lists. A reader who opens a note about the face fixer wants the page about
 * repairing faces from where they are asking, not after a second hop through the
 * entry, and the note is the first place the question is asked.
 *
 * Which words a topic has, and whether there is an entry behind it, is asked of
 * the reference registries rather than known here: the same `?` sits beside an
 * image setting and beside an alchemy operation, and neither studio owns it.
 */
@Component({
  selector: 'app-gs-help',
  imports: [TranslocoPipe, IconComponent, RouterLink],
  template: `
    <button
      #trigger
      type="button"
      class="gs-help-btn"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="noteId()"
      [attr.aria-describedby]="isOpen() ? noteId() : null"
      (click)="toggle($event)"
    >
      <span aria-hidden="true">?</span>
      <span class="sr-only"
        >{{ 'generate.help.about' | transloco }}
        {{ titleKey() | transloco }}</span
      >
    </button>
    @if (isOpen()) {
      <!-- One note: the words, the picture offer where there is one, and the
           pages to read on. Whatever row holds the trigger lays out a single
           block, so the note reads the same under a card title, a field label
           and a group head. -->
      <div class="gs-help-note gs-fadeup" role="note" [id]="noteId()">
        <p class="gs-help-note-body">{{ bodyKey() | transloco }}</p>
        <!-- Only where there is something to see. The reference has to have a
           page for the setting, and the library has to have published a picture
           of it changing: "See it in action" is a promise, and an entry with
           nothing but prose in it does not keep it. -->
        @if (canSeeIt()) {
          <button
            type="button"
            class="gs-help-see"
            [class]="identityClass()"
            (click)="seeIt($event)"
          >
            <!-- The capsule's grammar, at the only size a field note has room
               for: two of the strip's own frames on the stage, the badge that
               says what kind of thing this is, and the chevron. A full capsule
               would be wider than the row it hangs under. -->
            @if (peek().length > 0) {
              <span class="gs-cap-peek" aria-hidden="true">
                @for (frame of peek(); track $index) {
                  <img
                    class="gs-cap-peek-frame"
                    [src]="frame"
                    alt=""
                    loading="lazy"
                  />
                }
              </span>
            }
            <span class="gs-cap-text">
              <span class="gs-cap-eyebrow">
                <span class="gs-cap-dot" aria-hidden="true"></span>
                @if (sectionLabelKey(); as key) {
                  {{
                    'generate.sweeps.badge_explorer'
                      | transloco: { section: key | transloco }
                  }}
                } @else {
                  {{ 'generate.sweeps.badge_explorer_plain' | transloco }}
                }
              </span>
              <span class="gs-cap-title">
                {{ 'generate.help.see_it' | transloco }}
              </span>
            </span>
            <span class="gs-cap-go" aria-hidden="true">
              <app-icon name="chevron-right" class="gs-ico-sm" />
            </span>
          </button>
        }
        <!-- Written last so the picture, where there is one, stays the loudest
           offer in the note, and the pages read as further reading rather
           than as competition for it. The subject's own page leads the row,
           because a reader who wants more of this answer wants that one first. -->
        @if (hasEntry() || links().length > 0) {
          <p class="gs-help-links">
            <span class="gs-help-links-head">{{
              'generate.help.read_more' | transloco
            }}</span>
            @if (hasEntry()) {
              <a class="gs-help-link" [routerLink]="fullLink()">
                {{ 'generate.help.full_entry' | transloco }}
              </a>
            }
            @for (link of links(); track link.routerLink) {
              <a class="gs-help-link" [routerLink]="link.routerLink">
                {{ link.labelKey | transloco }}
              </a>
            }
          </p>
        }
      </div>
    }
  `,
  host: {
    class: 'gs-help',
    '(document:keydown.escape)': 'onEscape()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsHelpComponent {
  private readonly help = inject(GsHelpService);
  private readonly dock = inject(GsHelpDockService);
  private readonly sweeps = inject(SweepLibraryService);

  /** The reference topic this trigger explains. */
  public readonly topic = input.required<string>();

  private static nextInstance = 0;
  private readonly instance = GsHelpComponent.nextInstance++;

  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');

  /** What either registry knows about the subject beside this trigger. */
  private readonly subject = computed(() => referenceTopic(this.topic()));

  /* A namespaced topic carries a colon, which is legal in an id and awkward in
     every selector that would go looking for one. */
  public readonly noteId = computed(
    () => `gs-help-${this.topic().replace(/[^\w-]+/g, '-')}-${this.instance}`,
  );
  public readonly titleKey = computed(
    () => this.subject()?.titleKey ?? this.topic(),
  );
  public readonly bodyKey = computed(
    () => this.subject()?.noteKey ?? this.topic(),
  );

  /** Whether the reference has an entry this note can send a reader on to. */
  public readonly hasEntry = computed(() => this.subject()?.hasEntry ?? false);

  /** Where that entry is read in full, which is a page of the documentation. */
  public readonly fullLink = computed(() => this.subject()?.fullLink ?? '');

  /**
   * The pages the subject names, whichever registry named them. Present on a
   * note whether or not the subject has an entry: a link is a page that exists
   * elsewhere in the site, and it answers the reader's question with or without
   * a written entry behind the `?`.
   */
  public readonly links = computed<readonly SettingLink[]>(
    () => this.subject()?.links ?? [],
  );

  /**
   * Whether the offer can be kept: an entry to open, and a strip or a plate the
   * library has actually published for it. Before the library has answered the
   * offer is withheld rather than shown and then taken away.
   */
  public readonly canSeeIt = computed(() => {
    const subject = this.subject();
    if (!subject?.hasEntry) {
      return false;
    }
    const strip = subject.strip;
    const grid = subject.grid;
    if (!strip && !grid) {
      return false;
    }
    return (
      this.sweeps.isSettled() &&
      ((!!strip && !!this.sweeps.strip(strip)) ||
        (!!grid && !!this.sweeps.grid(grid)))
    );
  });

  /** The area of the panel this field sits in, for the offer's badge. */
  private readonly identity = computed(() => this.subject()?.identity ?? null);

  public readonly sectionLabelKey = computed(
    () => this.identity()?.labelKey ?? null,
  );
  public readonly identityClass = computed(
    () => this.identity()?.className ?? '',
  );

  /**
   * The two frames the offer leads with: the ends of the strip it is offering.
   * A grid-only topic has no strip to show and gets the badge alone, which is
   * still the family's grammar without promising a picture there is none of.
   */
  public readonly peek = computed<readonly string[]>(() => {
    if (!this.canSeeIt()) {
      return [];
    }
    const strip = this.subject()?.strip;
    const stops = (strip && this.sweeps.strip(strip)?.stops) || [];
    const first = stops.at(0);
    const last = stops.at(-1);
    return first && last
      ? [this.sweeps.imageUrl(first), this.sweeps.imageUrl(last)]
      : [];
  });

  constructor() {
    // The note is the first surface in the studio that asks whether there are
    // pictures, so it is the one that starts the library fetching.
    void this.sweeps.ensureLoaded();
    effect(() => {
      if (this.help.requestedTopic() === this.topic()) {
        this.help.claimTopic(this.noteId());
      }
    });
  }

  public isOpen(): boolean {
    return this.help.isOpen(this.noteId());
  }

  /**
   * Stops the click short of any surrounding `<label>` or row handler: the
   * trigger sits next to controls whose own row is clickable.
   */
  public toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.help.toggle(this.noteId());
  }

  /**
   * Open the setting's reference entry, docked beside the results or in the
   * mobile sheet. The note is left expanded: it is the thing that said the
   * entry existed, and collapsing it would take the way back with it.
   */
  public seeIt(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dock.open(this.topic());
  }

  public onEscape(): void {
    if (!this.isOpen()) {
      return;
    }
    this.help.close();
    this.trigger()?.nativeElement.focus();
  }
}
