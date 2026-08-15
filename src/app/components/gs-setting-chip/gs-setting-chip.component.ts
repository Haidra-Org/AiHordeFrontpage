import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  docsSettingLink,
  STUDIO_ALCHEMY,
  STUDIO_IMAGE,
} from '../../content/docs-links';
import { SectionIdentity, sectionIdentity } from '../../content/sections';
import {
  SettingValue,
  hasReference,
  settingEntry,
  settingLabelKey,
  settingNoteKey,
  settingProseLabelKey,
  settingSection,
  settingTitleKey,
} from '../../content/settings';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { IconComponent } from '../icon/icon.component';

/** Where a reader was when they left a page for a setting's reference entry. */
export interface ReferenceOrigin {
  url: string;
  title: string;
}

/** The navigation state key the reference entry reads its way back from. */
export const REFERENCE_ORIGIN_STATE = 'referenceOrigin';

const POP_MARGIN = 12;
const POP_GAP = 6;
const POP_WIDTH = 320;
/* Only used to pick the side of the chip the card opens on; the card itself is
   content-sized. */
const POP_ESTIMATED_HEIGHT = 160;
const SCROLL_SETTLE_MS = 400;

let popInstance = 0;

/**
 * One setting and the value it was set to, as a single token: the mark of the
 * panel area it lives on, its name, and the value in the studio's numeric face.
 *
 * This is the studio's way of saying "guidance was 7" anywhere it has to be
 * said: on a worked example's recipe, under a sweep frame, at the head of a
 * grid axis, beside a finished image. A reader who learns to read one of these
 * has learned to read all of them, and the glyph tells them which card to go
 * and set it on.
 *
 * The value is taken in the type the API takes it in, and formatted here rather
 * than by the caller: a number reads as digits, a flag reads as a state the
 * page has words for, and anything else reads verbatim. That is the whole
 * reason the input is typed: a caller that had already turned 0.15 into a
 * string could just as easily have handed over a filename token.
 *
 * The chip is an element of its own wherever it is used, so the surface keeps
 * whatever element its own structure needs: a list item on the recipe, a header
 * cell on a plate, a line of a caption.
 *
 * As an entry point (`entry`), the chip is also the way into what the setting
 * means. Pressing it opens a short note in place, the same two or three lines
 * the `?` beside the control shows, and offers the full reference entry: docked
 * beside the results when the reader is in a studio, so the panel and any
 * tutorial in progress stay where they are, and as the reference page otherwise,
 * carrying where the reader came from so that page can offer the way back. The
 * note is drawn inside the chip's own tree rather than in an overlay container,
 * because the studio's colour tokens are scoped to the studio root and a
 * body-level container would not see them.
 */
@Component({
  selector: 'app-gs-setting-chip',
  imports: [TranslocoPipe, IconComponent, NgTemplateOutlet],
  template: `
    <ng-template #face>
      @if (glyph()) {
        @if (identity(); as mark) {
          <span class="gs-sec-chip" aria-hidden="true"
            ><app-icon [name]="mark.icon"
          /></span>
        }
      }
      <span class="gs-setting-chip-label">
        {{ labelKey() | transloco }}
      </span>
      @if (stateKey(); as key) {
        <span class="gs-setting-chip-value">
          {{ key | transloco }}
        </span>
      } @else if (valueText(); as text) {
        <span class="gs-setting-chip-value">
          {{ text }}
        </span>
      }
    </ng-template>

    @if (opens()) {
      <button
        #trigger
        type="button"
        class="gs-setting-chip-btn"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? popId : null"
        (click)="toggle($event)"
      >
        <ng-container [ngTemplateOutlet]="face" />
      </button>
      @if (open()) {
        <div
          #pop
          class="gs-setting-pop"
          role="dialog"
          tabindex="-1"
          [id]="popId"
          [attr.aria-labelledby]="popId + '-title'"
          [style.top.px]="popTop()"
          [style.left.px]="popLeft()"
          [style.width.px]="popWidth()"
        >
          <p class="gs-setting-pop-title" [id]="popId + '-title'">
            {{ (hasNote() ? titleKey() : labelKey()) | transloco }}
          </p>
          @if (hasNote()) {
            <p class="gs-setting-pop-body">{{ noteKey() | transloco }}</p>
          }
          @if (canOpenReference()) {
            <button
              type="button"
              class="gs-setting-pop-go"
              (click)="openReference($event)"
            >
              {{ 'generate.reference.open_full' | transloco }}
              <app-icon name="chevron-right" class="gs-ico-sm" />
            </button>
          }
        </div>
      }
    } @else {
      <ng-container [ngTemplateOutlet]="face" />
    }
  `,
  host: {
    class: 'gs-setting-chip',
    '[class]': 'hostClass()',
    '(document:keydown.escape)': 'onEscape()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(window:resize)': 'close()',
    '(window:scroll)': 'onScroll()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsSettingChipComponent {
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly dock = inject(GsHelpDockService);
  private readonly pageTitle = inject(Title);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly popEl = viewChild<ElementRef<HTMLElement>>('pop');

  /** The setting, by its studio id or by the API field name it goes by. */
  public readonly settingId = input.required<string>();
  /**
   * Whether the chip opens the setting's note and offers its reference entry.
   * Off, it is a token that only reads; on, it is a button as well.
   */
  public readonly entry = input(false);

  public readonly popId = `gs-setting-pop-${popInstance++}`;
  public readonly open = signal(false);
  public readonly popTop = signal(0);
  public readonly popLeft = signal(0);
  public readonly popWidth = signal(POP_WIDTH);
  private openedAt = 0;

  /** The setting's own id, whichever name the caller reached it by. */
  private readonly canonicalId = computed(
    () => settingEntry(this.settingId())?.id ?? this.settingId(),
  );
  public readonly titleKey = computed(() =>
    settingTitleKey(this.canonicalId()),
  );
  public readonly noteKey = computed(() => settingNoteKey(this.canonicalId()));
  public readonly canOpenReference = computed(() =>
    hasReference(this.canonicalId()),
  );

  /**
   * Re-asked whenever the translation files have news, because whether a note
   * exists is a question about the loaded copy rather than about the setting.
   */
  private readonly translations = toSignal(this.transloco.events$, {
    initialValue: null,
  });

  /** Whether the copy has a `?` note for this setting. */
  public readonly hasNote = computed(() => {
    this.translations();
    const key = this.noteKey();
    return this.transloco.translate(key) !== key;
  });

  /**
   * An entry chip with nothing to open stays a plain token: a button that
   * opens an empty card would be worse than no button, which is the same
   * judgement the prose makes about a token it does not know.
   */
  public readonly opens = computed(
    () => this.entry() && (this.hasNote() || this.canOpenReference()),
  );

  public toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.open()) {
      this.close();
      return;
    }
    this.place();
    this.open.set(true);
    this.openedAt = Date.now();
    // The dialog is rendered from the signal above, so it exists next turn.
    setTimeout(() => this.popEl()?.nativeElement.focus());
  }

  public close(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }

  /**
   * The card is fixed to the viewport, so once the page moves it no longer sits
   * by its chip and is better gone. The press that opened it can itself bring
   * the chip into view, though, and that scroll must not close what it opened.
   */
  public onScroll(): void {
    if (Date.now() - this.openedAt > SCROLL_SETTLE_MS) {
      this.close();
    }
  }

  public onEscape(): void {
    if (!this.open()) {
      return;
    }
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  public onDocumentPointerDown(event: Event): void {
    if (
      this.open() &&
      !this.host.nativeElement.contains(event.target as Node | null)
    ) {
      this.close();
    }
  }

  /**
   * In a studio the entry docks beside the results, so the panel and any
   * tutorial in progress stay put; anywhere else it is the reference page,
   * told where the reader was so it can offer the way back.
   */
  public openReference(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const id = this.canonicalId();
    this.close();
    const url = this.router.url;
    if (url.startsWith(STUDIO_IMAGE) || url.startsWith(STUDIO_ALCHEMY)) {
      this.dock.open(id);
      return;
    }
    const origin: ReferenceOrigin = {
      url,
      title: this.pageTitle.getTitle().split(' | ')[0],
    };
    void this.router.navigateByUrl(docsSettingLink(id), {
      state: { [REFERENCE_ORIGIN_STATE]: origin },
    });
  }

  /**
   * Fixed to the viewport, under the chip where there is room and over it
   * otherwise, and kept inside the viewport's side margins. Fixed rather than
   * absolute because the chip sits in prose inside scroll containers, and an
   * absolutely positioned card would be clipped by the first of them.
   */
  private place(): void {
    const button = this.trigger()?.nativeElement;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(POP_WIDTH, viewportWidth - POP_MARGIN * 2);
    const left = Math.min(
      Math.max(POP_MARGIN, rect.left),
      viewportWidth - POP_MARGIN - width,
    );
    const roomBelow = viewportHeight - rect.bottom;
    const opensBelow =
      roomBelow >= POP_ESTIMATED_HEIGHT + POP_MARGIN ||
      rect.top < POP_ESTIMATED_HEIGHT;
    const top = opensBelow
      ? rect.bottom + POP_GAP
      : rect.top - POP_GAP - POP_ESTIMATED_HEIGHT;
    this.popWidth.set(width);
    this.popLeft.set(left);
    this.popTop.set(Math.max(POP_MARGIN, top));
  }
  /** What it was set to. Null renders the name alone. */
  public readonly value = input<SettingValue | null>(null);
  /**
   * Whether the section glyph is drawn. A row of headers over a grid plate is
   * eight repetitions of two marks, which is noise rather than orientation, so
   * that one surface turns it off.
   */
  public readonly glyph = input(true);
  /**
   * Whether the chip is set in a line of prose rather than beside a picture.
   *
   * Inline it has to sit on a text baseline without setting the line's height,
   * so it loses the standalone chip's padding and takes the sentence's own type
   * size. It also takes the setting's prose name, because a sentence names a
   * setting the way it would be said out loud and a caption names it the way it
   * is written on the card.
   */
  public readonly inline = input(false);

  public readonly identity = computed<SectionIdentity | null>(() =>
    sectionIdentity(settingSection(this.settingId())),
  );

  public readonly identityClass = computed(
    () => this.identity()?.className ?? '',
  );

  public readonly hostClass = computed(() =>
    [this.identityClass(), this.inline() ? 'gs-setting-chip--inline' : '']
      .filter((name) => name !== '')
      .join(' '),
  );

  public readonly labelKey = computed(() =>
    this.inline()
      ? settingProseLabelKey(this.settingId())
      : settingLabelKey(this.settingId()),
  );

  /** Set on a flag, which is a state the page has words for rather than data. */
  public readonly stateKey = computed<string | null>(() => {
    const value = this.value();
    if (typeof value !== 'boolean') {
      return null;
    }
    return value ? 'generate.sweeps.state_on' : 'generate.sweeps.state_off';
  });

  /** The value as it reads: digits for a number, the text itself for a string. */
  public readonly valueText = computed<string | null>(() => {
    const value = this.value();
    if (value === null || typeof value === 'boolean') {
      return null;
    }
    return String(value);
  });
}
