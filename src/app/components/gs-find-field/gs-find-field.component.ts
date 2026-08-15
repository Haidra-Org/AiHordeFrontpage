import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

/** One run of a title: the text, and whether the query matched it. */
export interface FindHighlightPart {
  text: string;
  hit: boolean;
}

/** Characters a query may carry that would otherwise be regex syntax. */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Cut a string into the runs the query matched and the runs it did not, so a
 * title can be drawn with its matches marked without handing a translated
 * string to `innerHTML`. Every run is rendered as text by the caller, so a
 * translation containing markup stays inert.
 *
 * An empty or unmatched query yields the whole string as one unmatched run,
 * which is what an unfiltered page draws.
 */
export function findHighlightParts(
  text: string,
  query: string,
): readonly FindHighlightPart[] {
  const needle = query.trim();
  if (!needle) {
    return [{ text, hit: false }];
  }
  const parts: FindHighlightPart[] = [];
  const pattern = new RegExp(needle.replace(REGEX_SPECIALS, '\\$&'), 'gi');
  let at = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    if (match.index > at) {
      parts.push({ text: text.slice(at, match.index), hit: false });
    }
    parts.push({ text: match[0], hit: true });
    at = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (parts.length === 0) {
    return [{ text, hit: false }];
  }
  if (at < text.length) {
    parts.push({ text: text.slice(at), hit: false });
  }
  return parts;
}

/**
 * The find field a documentation page puts at its top: type a word, and the
 * page keeps only what carries it.
 *
 * The field owns the text and nothing else. What counts as a match, and what a
 * page does with the answer, belong to the page: the settings reference matches
 * ids and API field names as well as prose, and the guide marks the words it
 * matched. The field is told how many things survived so it can say so, since
 * a filtered page is a silent change for anyone who cannot see it shrink.
 *
 * Escape clears without moving focus, so a reader who has mistyped can carry on
 * typing rather than find the caret gone.
 */
@Component({
  selector: 'app-gs-find-field',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <label class="gs-find-label" [for]="fieldId">
      {{ 'docs.find.label' | transloco }}
    </label>
    <div class="gs-find-row">
      <app-icon name="magnifying-glass" class="gs-find-ico" />
      <input
        #field
        type="search"
        class="gs-find-input"
        autocomplete="off"
        [id]="fieldId"
        [value]="value()"
        [attr.placeholder]="'docs.find.placeholder' | transloco"
        (input)="onInput($event)"
        (keydown.escape)="clear()"
      />
      @if (value()) {
        <button
          type="button"
          class="gs-find-clear"
          [attr.aria-label]="'docs.find.clear' | transloco"
          (click)="clear()"
        >
          <app-icon name="x-mark" class="gs-ico-sm" />
        </button>
      }
    </div>
    <!-- The count rather than the list: a filtered page has already changed
         under a screen reader's cursor, and the number is what says by how
         much. Silent while the page is unfiltered, which is its resting state. -->
    <p class="gs-find-status sr-only" aria-live="polite">
      @if (value().trim()) {
        {{ countKey() | transloco: { count: matches() } }}
      }
    </p>
  `,
  host: {
    class: 'gs-find',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsFindFieldComponent {
  /** How many things the page kept, which is what the field announces. */
  public readonly matches = input(0);

  /** The text as it is typed, for the page to filter on. */
  public readonly queryChange = output<string>();

  private static nextInstance = 0;
  public readonly fieldId = `gs-find-${GsFindFieldComponent.nextInstance++}`;

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  private readonly text = signal('');
  public readonly value = this.text.asReadonly();

  public readonly countKey = computed(() =>
    this.matches() === 1 ? 'docs.find.count_one' : 'docs.find.count',
  );

  public onInput(event: Event): void {
    this.set((event.target as HTMLInputElement).value);
  }

  /** Empty the field and leave the caret in it, so typing can simply resume. */
  public clear(): void {
    this.set('');
    this.field()?.nativeElement.focus();
  }

  private set(next: string): void {
    if (next === this.text()) {
      return;
    }
    this.text.set(next);
    this.queryChange.emit(next);
  }
}
