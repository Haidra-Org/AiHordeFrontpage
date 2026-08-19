import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { GlossaryService } from '../../services/glossary.service';
import {
  ProseRun,
  proseParamSentinels,
  restoreProseParams,
  splitProseBlocks,
  tokenizeProse,
} from '../../helper/gs-prose';
import { GsSettingChipComponent } from '../gs-setting-chip/gs-setting-chip.component';

/** A block of the body with its text already cut into runs. */
type RenderedBlock =
  | { readonly kind: 'paragraph'; readonly runs: ProseRun[] }
  | { readonly kind: 'list'; readonly items: ProseRun[][] };

/** What a body's `{{ }}` placeholders are filled with, as `| transloco` takes it. */
export type ProseParams = Record<string, string | number>;

/**
 * A translated body, rendered with the site's three inline marks in it.
 *
 * The site's teaching prose keeps meeting the same three needs: a word the
 * dictionary defines, a setting the panel has a card for, and a literal the
 * reader will type or read off a payload. Written as sentences those are three
 * pieces of unmarked text, and a reader who does not already know which words
 * are load-bearing has no way to find out. Written as tokens they become a
 * definition to open, a chip that names its own control, and a quoted fragment,
 * and none of that costs the translator anything but the token.
 *
 * Every render site goes through this component whether or not its strings
 * carry tokens yet, so a later pass adds a token to a body in en.json and the
 * page grows the control without a template being touched.
 *
 * Nothing here goes near `innerHTML`. The body is cut into runs and each run is
 * rendered by the template, so a body carrying a prompt somebody typed cannot
 * grow an element nobody wrote. Interpolated values go in after the cut for the
 * same reason: a prompt is text, and stays text however it is spelled.
 */
@Component({
  selector: 'app-gs-prose',
  imports: [NgTemplateOutlet, GsSettingChipComponent],
  template: `
    <ng-template #runs let-list>
      @for (run of list; track $index) {
        @switch (run.kind) {
          @case ('term') {
            <!-- The word is in a span of its own so the button's own
                 whitespace collapses away rather than being underlined with
                 it: a mark that runs a space past the word it is on reads as
                 sloppy typesetting. -->
            <button
              type="button"
              class="gs-prose-term"
              (click)="openTerm(run.termId)"
            >
              <span>{{ run.text }}</span>
            </button>
          }
          @case ('code') {
            <code class="gs-prose-code">{{ run.text }}</code>
          }
          @case ('setting') {
            <app-gs-setting-chip
              [settingId]="run.settingId"
              [inline]="true"
              [entry]="true"
            />
          }
          @default {
            <span>{{ run.text }}</span>
          }
        }
      }
    </ng-template>

    @if (paragraphs()) {
      @for (block of blocks(); track $index) {
        @if (block.kind === 'list') {
          <ul class="gs-prose-list">
            @for (item of block.items; track $index) {
              <li>
                <ng-container
                  [ngTemplateOutlet]="runs"
                  [ngTemplateOutletContext]="{ $implicit: item }"
                />
              </li>
            }
          </ul>
        } @else {
          <span class="gs-prose-p"
            ><ng-container
              [ngTemplateOutlet]="runs"
              [ngTemplateOutletContext]="{ $implicit: block.runs }"
          /></span>
        }
      }
    } @else {
      <ng-container
        [ngTemplateOutlet]="runs"
        [ngTemplateOutletContext]="{ $implicit: inlineRuns() }"
      />
    }
  `,
  host: {
    class: 'gs-prose',
    // Inline by default, because most of the marks are set in a sentence the
    // surface wrote; a body drawn as paragraphs has to be a block, or the
    // paragraphs inside it are block boxes in an inline parent.
    '[class.gs-prose--blocks]': 'paragraphs()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsProseComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly glossary = inject(GlossaryService);

  /** The body, named the way every other surface names its copy. */
  public readonly key = input.required<string>();

  /** What its placeholders are filled with, mirroring `| transloco: params`. */
  public readonly params = input<ProseParams | null>(null);

  /**
   * Whether blank lines in the body start new paragraphs.
   *
   * Off, the runs are emitted bare so the body can sit inside a sentence the
   * surface wrote itself; on, each block is drawn as its own line of prose. A
   * paragraph is a span rather than a `p` so that neither reading can nest one
   * paragraph inside another.
   */
  public readonly paragraphs = input(false);

  /**
   * Re-read the body whenever the service has news: a language change, or the
   * arrival of the file the body is in. The runs are cut from the resolved
   * string rather than piped, so nothing else would notice a late load.
   */
  private readonly translations = toSignal(this.transloco.events$, {
    initialValue: null,
  });

  private readonly names = computed<string[]>(() =>
    Object.keys(this.params() ?? {}),
  );

  private readonly source = computed<string>(() => {
    this.translations();
    return this.transloco.translate(
      this.key(),
      proseParamSentinels(this.names()),
    );
  });

  private cut(text: string): ProseRun[] {
    const params = this.params() ?? {};
    const values = this.names().map((name) => String(params[name]));
    return tokenizeProse(text).map((run) =>
      run.kind === 'setting'
        ? run
        : { ...run, text: restoreProseParams(run.text, values) },
    );
  }

  /**
   * Not in paragraph mode the whole body is one run of inline prose, rendered
   * bare inside whatever sentence the surface wrapped the component in; a list
   * mark there is left as the text it was written as.
   */
  public readonly inlineRuns = computed<ProseRun[]>(() =>
    this.cut(this.source()),
  );

  /** In paragraph mode, the body's blocks with their text cut into runs. */
  public readonly blocks = computed<RenderedBlock[]>(() =>
    splitProseBlocks(this.source()).map((block) =>
      block.kind === 'list'
        ? { kind: 'list', items: block.items.map((item) => this.cut(item)) }
        : { kind: 'paragraph', runs: this.cut(block.text) },
    ),
  );

  public openTerm(termId: string): void {
    this.glossary.open(termId);
  }
}
