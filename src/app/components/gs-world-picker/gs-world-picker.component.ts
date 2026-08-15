import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  TutorialEngineService,
  TutorialWorld,
} from '../../services/tutorial-engine.service';

let instance = 0;

/**
 * Which subject the worked examples are drawn with.
 *
 * The three worlds are the same lesson taught on a different subject and a
 * different model family, and that is what the control says: an eyebrow that
 * names the point, then one option per world carrying its scene name and a line
 * on what it varies, because the scene names alone read as arbitrary. The
 * choice lives in the engine and is remembered, so every Learn surface answers
 * with the same world afterwards, the studio pane included.
 *
 * A surface that knows the world on screen is standing in for the chosen one
 * says so through `standIn`; the note is shown only then, because a note that
 * is always there stops being read.
 */
@Component({
  selector: 'app-gs-world-picker',
  imports: [TranslocoPipe],
  template: `
    @if (compact()) {
      <!-- The same choice with the scene names alone, for a header that has a
           line to spare rather than a block: what a world varies is a
           tooltip's worth here, and the full picker on the docs pages says
           it in words. -->
      <div
        class="gs-seg gs-seg--xs gs-worlds-compact"
        role="group"
        [attr.aria-label]="'generate.learn.world_label' | transloco"
      >
        @for (option of worlds; track option) {
          <button
            type="button"
            class="gs-seg-opt"
            [attr.aria-pressed]="world() === option"
            [attr.title]="hintKey(option) | transloco"
            (click)="setWorld(option)"
          >
            {{ nameKey(option) | transloco }}
          </button>
        }
      </div>
    } @else {
      <div class="gs-worlds" role="group" [attr.aria-labelledby]="labelId">
        <p class="gs-cap-eyebrow gs-worlds-eyebrow" [id]="labelId">
          <span class="gs-cap-dot" aria-hidden="true"></span>
          {{ 'generate.learn.world_label' | transloco }}
        </p>
        <div class="gs-worlds-opts">
          @for (option of worlds; track option) {
            <button
              type="button"
              class="gs-world"
              [attr.aria-pressed]="world() === option"
              (click)="setWorld(option)"
            >
              <span class="gs-world-name">{{
                nameKey(option) | transloco
              }}</span>
              <span class="gs-world-hint">{{
                hintKey(option) | transloco
              }}</span>
            </button>
          }
        </div>
        @if (standIn()) {
          <p class="gs-info-note gs-worlds-note" role="status">
            {{
              'generate.learn.world_note'
                | transloco: { world: nameKey(world()) | transloco }
            }}
          </p>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsWorldPickerComponent {
  private readonly engine = inject(TutorialEngineService);

  /** Whether the pictures on screen are the first world's, standing in. */
  public readonly standIn = input(false);
  /** A one-line segmented form for headers; the block form is the default. */
  public readonly compact = input(false);

  public readonly labelId = `gs-worlds-label-${instance++}`;
  public readonly worlds = this.engine.worlds;
  public readonly world = this.engine.world;

  public nameKey(world: TutorialWorld): string {
    return `generate.learn.world.${world}`;
  }

  public hintKey(world: TutorialWorld): string {
    return `generate.learn.world_hint.${world}`;
  }

  public setWorld(world: TutorialWorld): void {
    this.engine.setWorld(world);
  }
}
