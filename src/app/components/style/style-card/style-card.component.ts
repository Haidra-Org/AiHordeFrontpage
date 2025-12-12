import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import {
  ImageStyle,
  TextStyle,
  Style,
  isImageStyle,
  StyleType,
} from '../../../types/style';

@Component({
  selector: 'app-style-card',
  imports: [RouterLink, TranslocoPipe, FormatNumberPipe],
  templateUrl: './style-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleCardComponent {
  /** The style to display. */
  public readonly style = input.required<Style>();

  /** The type of style (image or text). */
  public readonly styleType = input.required<StyleType>();

  /** Whether to show edit/delete actions (for owner). */
  public readonly showActions = input<boolean>(false);

  /** Emits when edit is clicked. */
  public readonly edit = output<void>();

  /** Emits when delete is clicked. */
  public readonly delete = output<void>();

  /** Emits when the card is clicked for navigation. */
  public readonly navigate = output<void>();

  /** Check if this is an image style. */
  public readonly isImage = computed(() => this.styleType() === 'image');

  /** Get the primary example image URL if available. */
  public readonly primaryExampleUrl = computed(() => {
    const s = this.style();
    if (isImageStyle(s) && s.examples && s.examples.length > 0) {
      const primary = s.examples.find((e) => e.primary);
      return primary?.url ?? s.examples[0].url;
    }
    return null;
  });

  /** Get display-friendly creator name (without the #id suffix). */
  public readonly creatorDisplayName = computed(() => {
    const creator = this.style().creator;
    if (!creator) return 'Unknown';
    const hashIndex = creator.indexOf('#');
    return hashIndex > 0 ? creator.substring(0, hashIndex) : creator;
  });

  /** Get first few tags for display. */
  public readonly displayTags = computed(() => {
    const tags = this.style().tags ?? [];
    return tags.slice(0, 3);
  });

  /** Check if there are more tags than displayed. */
  public readonly hasMoreTags = computed(() => {
    const tags = this.style().tags ?? [];
    return tags.length > 3;
  });

  /** Get the extra tags count. */
  public readonly extraTagsCount = computed(() => {
    const tags = this.style().tags ?? [];
    return tags.length - 3;
  });

  /** Get the route link for the style detail page. */
  public readonly detailRoute = computed(() => {
    const type = this.styleType();
    const id = this.style().id;
    return `/details/styles/${type}/${id}`;
  });

  public onEdit(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.edit.emit();
  }

  public onDelete(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.delete.emit();
  }

  public onCardClick(): void {
    this.navigate.emit();
  }
}
