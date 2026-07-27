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

  /** The flow's outcome name, shared with the Learn page's own listing. */
  public readonly taskNameKey = computed(
    () => `generate.tutorials.flows.${this.engine.activeFlowId()}.task_name`,
  );

  public readonly canApply = computed(() => this.engine.canApply());

  public readonly progressParams = computed(() => ({
    current: this.stepIndex() + 1,
    total: this.total(),
  }));

  public titleKey(step: TutorialStepDef): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.title`;
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
    this.engine.focusStep();
  }

  public exit(): void {
    this.engine.stop();
  }
}
