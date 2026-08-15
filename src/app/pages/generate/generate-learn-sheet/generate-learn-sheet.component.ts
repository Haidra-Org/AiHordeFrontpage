import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsSheetComponent } from '../../../components/gs-sheet/gs-sheet.component';
import { GsProseComponent } from '../../../components/gs-prose/gs-prose.component';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  TutorialEngineService,
  TutorialLevel,
  stepFieldLabelKey,
} from '../../../services/tutorial-engine.service';
import { FlowStep, isConceptFlow } from '../../../content/flows';
import {
  SectionIdentity,
  sectionIdentity,
  sectionFor,
} from '../../../content/sections';

/**
 * The follow-along tutorial on a phone, as a bottom sheet.
 *
 * Below the width where the studio has two panes, the results pane the panel
 * lives in sits under the whole form: a step and the field it points at can
 * never be on screen together there. The sheet is over the form instead, so the
 * step stays put while the reader works the control it names. Docked it is the
 * step's title, its dots and its one action; expanded it is the whole step.
 *
 * A second thin view onto {@link TutorialEngineService} rather than a reshaped
 * panel: the two presentations share no markup, and both flows are the engine's,
 * so nothing about the tutorial can differ between them.
 */
@Component({
  selector: 'app-generate-learn-sheet',
  imports: [
    TranslocoPipe,
    IconComponent,
    GsProseComponent,
    GsSheetComponent,
    GsSweepScrubComponent,
  ],
  templateUrl: './generate-learn-sheet.component.html',
  host: {
    class: 'gs-learn-sheet',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateLearnSheetComponent {
  private readonly engine = inject(TutorialEngineService);

  public readonly levels = this.engine.levels;
  public readonly level = this.engine.level;
  public readonly steps = this.engine.steps;
  public readonly step = this.engine.step;
  public readonly stepIndex = this.engine.stepIndex;
  public readonly total = this.engine.total;
  public readonly onFinale = this.engine.onFinale;
  public readonly loading = this.engine.isLoading;
  public readonly loadFailed = this.engine.loadFailed;
  public readonly revealNote = this.engine.revealNote;
  public readonly copyParams = this.engine.copyParams;

  /** Whether the track being read teaches an idea rather than a technique. */
  public readonly conceptTrack = computed(() =>
    isConceptFlow(this.engine.activeFlowId()),
  );

  /**
   * Whether the current step's strip is shown, on the panel's rule: a
   * newcomer's aid on a technique, and the lesson itself on a track, which is
   * why a track shows it in every register and shows it already open.
   */
  public readonly showsSweep = computed(
    () => this.conceptTrack() || this.level() === 'new_to_this',
  );

  public readonly canApply = computed(() => this.engine.canApply());

  /**
   * Whether there is a committed request behind the flow, which is what makes
   * the finale's ask to press Generate mean anything.
   */
  public readonly hasExample = computed(() => this.engine.example() !== null);

  public readonly progressParams = computed(() => ({
    current: this.stepIndex() + 1,
    total: this.total(),
  }));

  public titleKey(step: FlowStep): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.title`;
  }

  /** The field the step is about; null on a step that points at nothing. */
  public fieldLabelKey(step: FlowStep): string | null {
    return step.anchorId ? stepFieldLabelKey(step.anchorId) : null;
  }

  /** The step's prose in the chosen register; the panel's key, unchanged. */
  public bodyKey(step: FlowStep): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.body.${this.level()}`;
  }

  /** The panel area a step is about, so card and field share one hue. */
  public identityFor(step: FlowStep): SectionIdentity | null {
    return sectionIdentity(sectionFor('step', step.id));
  }

  /**
   * Whether the step card should breathe: only while the step points at a field
   * it shares a section hue with, so the glow is always half of a pair.
   */
  public breathes(step: FlowStep): boolean {
    return !!step.anchorId && this.identityFor(step) !== null;
  }

  /** The label of a closing step's handoff, in that track's own words. */
  public ctaKey(step: FlowStep): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.cta`;
  }

  /** Leave this track for the one its closing step offers. */
  public startOffered(step: FlowStep): void {
    if (step.startsFlow) {
      void this.engine.start(step.startsFlow);
    }
  }

  public revealKey(): string {
    return `generate.learn.reveal.${this.revealNote()}`;
  }

  public isCurrent(index: number): boolean {
    return index === this.stepIndex();
  }

  public levelKey(level: TutorialLevel): string {
    return `generate.learn.level.${level}`;
  }

  public setLevel(level: TutorialLevel): void {
    this.engine.setLevel(level);
  }

  public goTo(index: number): void {
    this.engine.goTo(index);
  }

  public back(): void {
    this.engine.back();
  }

  public next(): void {
    this.engine.next();
  }

  /**
   * Write the step's fields and stay where we are. The panel does not advance
   * on an apply either: the reader is meant to look at what just changed in the
   * form, which is the whole reason the step named it.
   */
  public apply(): void {
    this.engine.applyStep();
  }

  /** Point at the current field again, for a reader who has scrolled away. */
  public showMe(): void {
    this.engine.focusStep(true);
  }

  public exit(): void {
    this.engine.stop();
  }
}
