import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SectionIdentity, sectionIdentity } from '../../content/sections';
import {
  SettingValue,
  settingLabelKey,
  settingProseLabelKey,
  settingSection,
} from '../../content/settings';
import { IconComponent } from '../icon/icon.component';

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
 */
@Component({
  selector: 'app-gs-setting-chip',
  imports: [TranslocoPipe, IconComponent],
  template: `
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
  `,
  host: {
    class: 'gs-setting-chip',
    '[class]': 'hostClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsSettingChipComponent {
  /** The setting, by its studio id or by the API field name it goes by. */
  public readonly settingId = input.required<string>();
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
