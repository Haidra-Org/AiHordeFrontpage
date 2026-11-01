import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TouchTooltipDirective } from '../../../helper/touch-tooltip.directive';
import { IconComponent } from '../../../components/icon/icon.component';
import { chatCapabilityGroups } from './chat-features';

/**
 * A chat declaration as labelled rows of badges: sampling, images, tools,
 * reply format and guarantees. Each badge has a plain-language label. Its
 * tooltip, shown on hover, tap or focus, includes the horde's name for the
 * feature, so an operator can match it against the worker's configuration.
 * Guarantees have a check glyph in addition to their hue, so they are
 * distinguishable without colour.
 */
@Component({
  selector: 'app-chat-capabilities',
  imports: [TranslocoPipe, TouchTooltipDirective, IconComponent],
  template: `
    <dl class="chat-caps">
      @for (group of groups(); track group.id) {
        <div
          class="chat-caps-group chat-caps-group--{{ group.id }}"
          [attr.data-chat-group]="group.id"
        >
          <dt class="chat-caps-label">
            @if (group.descriptionKey; as descKey) {
              <span
                [appTouchTooltip]="group.labelKey"
                [appTouchTooltipDesc]="descKey"
                [appTouchTooltipPreferBelow]="true"
                >{{ group.labelKey | transloco }}</span
              >
            } @else {
              {{ group.labelKey | transloco }}
            }
          </dt>
          <dd class="chat-caps-badges">
            @for (badge of group.badges; track badge.name) {
              @if (badge.def; as def) {
                <span
                  class="hd-badge worker-cap chat-cap"
                  [class.worker-cap--off]="!badge.declared"
                  [attr.data-chat-capability]="badge.name"
                  [attr.data-declared]="badge.declared"
                  [appTouchTooltip]="def.titleKey"
                  [appTouchTooltipDesc]="def.descriptionKey"
                  [appTouchTooltipCode]="badge.name"
                  [appTouchTooltipPreferBelow]="true"
                  [attr.aria-label]="
                    badge.declared
                      ? (def.titleKey | transloco)
                      : ('admin.workers.chat.capability_off'
                        | transloco: { name: (def.titleKey | transloco) })
                  "
                >
                  @if (group.id === 'guarantees') {
                    <app-icon class="chat-cap-icon" name="badge-check" />
                  }
                  {{ def.titleKey | transloco }}
                </span>
              } @else {
                <span
                  class="hd-badge worker-cap chat-cap"
                  [attr.data-chat-capability]="badge.name"
                  [attr.data-declared]="true"
                  >{{ badge.name }}</span
                >
              }
            }
          </dd>
        </div>
      }
    </dl>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatCapabilitiesComponent {
  /** The declared features and guarantees, in any order. */
  public readonly features = input.required<readonly string[]>();
  /**
   * The declared image transports. Null when the source does not report
   * them, as in a model's summary over several workers. The transports are
   * then not listed.
   */
  public readonly transports = input<readonly string[] | null>(null);
  /** Whether undeclared names are listed, struck out. */
  public readonly showUndeclared = input(false);

  public readonly groups = computed(() =>
    chatCapabilityGroups(
      this.features(),
      this.transports(),
      this.showUndeclared(),
    ),
  );
}
