import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsProseComponent } from '../../../components/gs-prose/gs-prose.component';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsDoorComponent } from '../../../components/gs-door/gs-door.component';
import {
  TutorialEngineService,
  TutorialLevel,
  stepFieldLabelKey,
} from '../../../services/tutorial-engine.service';
import { FlowStep, isConceptFlow } from '../../../content/flows';
import { docsExampleLink } from '../../../content/docs-links';
import {
  SectionIdentity,
  sectionIdentity,
  sectionFor,
} from '../../../content/sections';

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
  imports: [
    RouterLink,
    TranslocoPipe,
    IconComponent,
    GsDoorComponent,
    GsProseComponent,
    GsSweepScrubComponent,
  ],
  templateUrl: './generate-learn-panel.component.html',
  host: {
    class: 'gs-results-body gs-learn',
    '(document:keydown)': 'onKey($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateLearnPanelComponent {
  private readonly engine = inject(TutorialEngineService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
  public readonly runCost = this.engine.runCost;
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

  /** Whether the track being read teaches an idea rather than a technique. */
  public readonly conceptTrack = computed(() =>
    isConceptFlow(this.engine.activeFlowId()),
  );

  /**
   * The page where this tutorial is written out. The steps are authored on the
   * site rather than fetched, so the page holds the whole lesson even when the
   * example behind the values will not load.
   */
  public readonly docsLink = computed(() =>
    docsExampleLink(this.engine.activeFlowId() ?? ''),
  );

  /**
   * Whether the current step's strip is shown. On a technique it is a newcomer's
   * aid: the other two registers are reading a number they already have a feel
   * for, and the offer would be one more thing between them and the next step.
   * On a concept track the pictures are the lesson rather than a remedy for one,
   * so every register gets them, and gets them already open.
   */
  public readonly showsSweep = computed(
    () => this.conceptTrack() || this.level() === 'new_to_this',
  );

  public readonly canApply = computed(() => this.engine.canApply());
  public readonly stepApplied = this.engine.stepApplied;

  /**
   * Whether there is a committed request behind the flow. Everything that
   * offers the reader the example's values, and the finale's ask to press
   * Generate, is only meaningful when there is one.
   */
  public readonly hasExample = computed(() => this.engine.example() !== null);

  /**
   * Whether to say the panel was cleared. Only on the first step, and only
   * while there is something to bring back: a reader who meets an empty panel
   * with no explanation assumes the studio lost their work.
   */
  public readonly setAsideNote = computed(
    () => this.stepIndex() === 0 && this.engine.settingsSetAside(),
  );

  public readonly progressParams = computed(() => ({
    current: this.stepIndex() + 1,
    total: this.total(),
  }));

  public titleKey(step: FlowStep): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.title`;
  }

  /**
   * The field the step is about, named above its title. Null on a step that
   * points at nothing, which is every step of a concept track: an eyebrow there
   * would name a control the reader is not being sent to.
   */
  public fieldLabelKey(step: FlowStep): string | null {
    return step.anchorId ? stepFieldLabelKey(step.anchorId) : null;
  }

  /**
   * The step's prose in the chosen register. Only the body varies: a step is
   * named the same thing however much explanation goes with it.
   */
  public bodyKey(step: FlowStep): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.body.${this.level()}`;
  }

  /** What the strips under a step are, where they are not this example's own. */
  public evidenceNoteKey(step: FlowStep): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.evidence_note`;
  }

  /**
   * The panel area a step is about, so the tutorial wears the same glyph and
   * hue as the card it is pointing at. Steps that are about the page rather
   * than a card (pressing Generate) belong to no area and take no mark.
   */
  public identityFor(step: FlowStep): SectionIdentity | null {
    return sectionIdentity(sectionFor(step.id));
  }

  /**
   * Whether the step card should breathe. It does so only while the step is
   * pointing at a field it shares a section hue with: with nothing highlighted
   * in the panel there is no pair for the glow to be half of, and a target
   * without a section (the finale's Generate button) would pair a blue field
   * glow with a green card glow across the two zones.
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

  /** Ask for the example again, after it would not load. */
  public retryExample(): void {
    this.engine.retryExample();
  }

  /** Leave for the results; the flow is parked, not ended. */
  public exit(): void {
    this.engine.pause();
  }

  /**
   * The keyboard's way through the tutorial, only while this pane is the one
   * on screen: below the wide layout the same steps live in the sheet, which
   * answers Escape by unwinding a stop and must not be parked from under it.
   */
  public onKey(event: KeyboardEvent): void {
    if (getComputedStyle(this.host.nativeElement).display === 'none') {
      return;
    }
    if (this.engine.handleKey(event)) {
      event.preventDefault();
    }
  }
}
