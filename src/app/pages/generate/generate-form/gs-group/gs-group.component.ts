import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../../components/icon/icon.component';
import { SECTION_IDENTITIES, SectionId } from '../../../../content/sections';

let groupInstance = 0;

/**
 * A settings group whose resting face is one line of its own current values.
 *
 * The panel's first cards are always open, because a request cannot be
 * described without them. Everything past them is a group: closed it reads as
 * its name, its section mark and what it is currently set to; open it is the
 * card it always was. The values are passed in already worded, because what
 * "the current values" means is a question about the form and this component
 * only knows how to draw an answer.
 */
@Component({
  selector: 'app-gs-group',
  imports: [NgTemplateOutlet, IconComponent, TranslocoPipe],
  templateUrl: './gs-group.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsGroupComponent {
  /** The panel area the group belongs to: its glyph and its hue come from it. */
  public readonly section = input.required<SectionId>();
  /** i18n key of the group's name. */
  public readonly titleKey = input.required<string>();
  /** The group's values in one line, shown while it is closed. */
  public readonly summary = input('');
  /**
   * A picture of what the group is currently working on, drawn small at the
   * head while the group is closed. Only the source image card has one: a
   * folded card that has taken a picture has to show which picture.
   */
  public readonly thumbUrl = input<string | null>(null);
  /**
   * Whether the group may be closed at all. A group whose body holds the only
   * way to give it anything to summarise stays open until it has been given
   * one, because folding it away would put that control out of reach.
   */
  public readonly canFold = input(true);
  /** Whether anything inside differs from the value the form starts at. */
  public readonly changed = input(false);
  public readonly open = input(false);
  /**
   * How many of the panel's warnings are about controls inside this group. A
   * fold hides the controls, and a warning the reader cannot see is one they
   * cannot answer, so a folded group carries the count on its head.
   */
  public readonly lintCount = input(0);
  /** What that count says aloud, worded for the number by the panel. */
  public readonly lintLabel = input('');
  public readonly toggled = output<void>();
  /** Pressed the count: open the group and point at what the warning is about. */
  public readonly lintPressed = output<void>();

  public readonly identity = computed(() => SECTION_IDENTITIES[this.section()]);

  /** Ties the head to the body it opens, for readers who cannot see the two. */
  public readonly bodyId = `gs-group-body-${groupInstance++}`;
}
