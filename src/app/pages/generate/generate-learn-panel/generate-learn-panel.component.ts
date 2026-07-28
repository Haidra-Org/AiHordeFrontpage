import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  TutorialEngineService,
  TutorialLevel,
  TutorialStepDef,
  isConceptFlow,
  stepFieldLabelKey,
} from '../../../services/tutorial-engine.service';
import {
  SECTION_IDENTITIES,
  SectionIdentity,
  sectionFor,
} from '../section-identity';

/**
 * The follow-along tutorial, rendered in the results pane beside the control
 * panel it is talking about.
 *
 * It stands where the written guide stands, and for the same reason: the reader
 * works the panel while reading, so a dialog would cover the controls each step
 * points at. Only one of the two surfaces is up at a time.
 *
 * The component is a view onto {@link TutorialEngineService}: every step, value
 * and side effect belongs to the engine, so the same flow behaves identically
 * whichever register of prose is on.
 */
@Component({
  selector: 'app-generate-learn-panel',
  imports: [TranslocoPipe, IconComponent, GsSweepScrubComponent],
  templateUrl: './generate-learn-panel.component.html',
  host: {
    class: 'gs-results-body gs-learn',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateLearnPanelComponent {
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
  public readonly exampleImage = this.engine.exampleImage;
  public readonly flow = this.engine.flow;
  public readonly copyParams = this.engine.copyParams;

  /**
   * The flow's outcome name. A technique's is shared with the Learn page's own
   * listing of worked examples; a concept track has no example to be listed
   * among them, so its name lives with the rest of its prose.
   */
  public readonly taskNameKey = computed(() => {
    const flowId = this.engine.activeFlowId();
    return isConceptFlow(flowId)
      ? `generate.learn.flows.${flowId}.task_name`
      : `generate.tutorials.flows.${flowId}.task_name`;
  });

  public readonly canApply = computed(() => this.engine.canApply());

  /**
   * Whether there is a committed request behind the flow. Everything that
   * offers the reader the example's values, and the finale's ask to press
   * Generate, is only meaningful when there is one.
   */
  public readonly hasExample = computed(() => this.engine.example() !== null);

  public readonly progressParams = computed(() => ({
    current: this.stepIndex() + 1,
    total: this.total(),
  }));

  public titleKey(step: TutorialStepDef): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.title`;
  }

  /**
   * The field the step is about, named above its title. Null on a step that
   * points at nothing, which is every step of a concept track: an eyebrow there
   * would name a control the reader is not being sent to.
   */
  public fieldLabelKey(step: TutorialStepDef): string | null {
    return step.anchorId ? stepFieldLabelKey(step.anchorId) : null;
  }

  /**
   * The step's prose in the chosen register. Only the body varies: a step is
   * named the same thing however much explanation goes with it.
   */
  public bodyKey(step: TutorialStepDef): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.body.${this.level()}`;
  }

  /**
   * The panel area a step is about, so the tutorial wears the same glyph and
   * hue as the card it is pointing at. Steps that are about the page rather
   * than a card (pressing Generate) belong to no area and take no mark.
   */
  public identityFor(step: TutorialStepDef): SectionIdentity | null {
    const section = sectionFor('step', step.id);
    return section ? SECTION_IDENTITIES[section] : null;
  }

  /**
   * Whether the step card should breathe. It does so only while the step is
   * pointing at a field it shares a section hue with: with nothing highlighted
   * in the panel there is no pair for the glow to be half of, and a target
   * without a section (the finale's Generate button) would pair a blue field
   * glow with a green card glow across the two zones.
   */
  public breathes(step: TutorialStepDef): boolean {
    return !!step.anchorId && this.identityFor(step) !== null;
  }

  /** The label of a closing step's handoff, in that track's own words. */
  public ctaKey(step: TutorialStepDef): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.cta`;
  }

  /** Leave this track for the one its closing step offers. */
  public startOffered(step: TutorialStepDef): void {
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

  public apply(): void {
    this.engine.applyStep();
  }

  public applyAll(): void {
    this.engine.applyAll();
  }

  /** Point at the current field again, for a reader who has scrolled away. */
  public showMe(): void {
    this.engine.focusStep(true);
  }

  public exit(): void {
    this.engine.stop();
  }
}
