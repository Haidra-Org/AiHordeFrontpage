import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsSheetComponent } from '../../../components/gs-sheet/gs-sheet.component';
import { GsDoorComponent } from '../../../components/gs-door/gs-door.component';
import { GsWorldPickerComponent } from '../../../components/gs-world-picker/gs-world-picker.component';
import { GsProseComponent } from '../../../components/gs-prose/gs-prose.component';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { GsShotViewerComponent } from '../../../components/gs-shot-viewer/gs-shot-viewer.component';
import { IconComponent } from '../../../components/icon/icon.component';
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
 * A picture behind the example, in the order the run produced it: what went in,
 * then what came back. Two at most, because the row is read at a glance.
 */
export interface LearnShot {
  src: string;
  /** What the picture is, said under it and used as its accessible name. */
  captionKey: string;
  /** The offer to see it whole, which names the picture rather than a number. */
  enlargeKey: string;
}

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
    RouterLink,
    TranslocoPipe,
    IconComponent,
    GsProseComponent,
    GsDoorComponent,
    GsWorldPickerComponent,
    GsSheetComponent,
    GsSweepScrubComponent,
    GsShotViewerComponent,
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
  public readonly runCost = this.engine.runCost;

  /** Whether the track being read teaches an idea rather than a technique. */
  /** The tutorial's name, said on the bar before the step so a reader knows where they are. */
  public readonly taskNameKey = computed(() => {
    const flowId = this.engine.activeFlowId();
    return isConceptFlow(flowId)
      ? `generate.learn.flows.${flowId}.task_name`
      : `generate.tutorials.flows.${flowId}.task_name`;
  });

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
   * Whether the current step's strip is shown, on the panel's rule: a
   * newcomer's aid on a technique, and the lesson itself on a track, which is
   * why a track shows it in every register and shows it already open.
   */
  public readonly showsSweep = computed(
    () => this.conceptTrack() || this.level() === 'new_to_this',
  );

  public readonly canApply = computed(() => this.engine.canApply());
  public readonly stepApplied = this.engine.stepApplied;

  /**
   * Whether there is a committed request behind the flow, which is what makes
   * the finale's ask to press Generate mean anything.
   */
  public readonly hasExample = computed(() => this.engine.example() !== null);

  /**
   * The pictures the example rests on: what the run started from, where it
   * started from one, and what it produced. A concept track has no committed
   * run behind it and shows no row at all.
   */
  public readonly shots = computed<readonly LearnShot[]>(() => {
    const result = this.engine.exampleImage();
    if (!result) {
      return [];
    }
    const source = this.engine.exampleSource();
    const shots: LearnShot[] = [];
    if (source) {
      shots.push({
        src: source,
        captionKey: 'generate.tutorials.example_source',
        enlargeKey: 'generate.tutorials.example_source_enlarge',
      });
    }
    shots.push({
      src: result,
      captionKey: 'generate.tutorials.example_result',
      enlargeKey: 'generate.tutorials.example_result_enlarge',
    });
    return shots;
  });

  /**
   * Whether the row is opened out. On the step that asks for the button to be
   * pressed the picture is the point, so it is given the height and the cost
   * line without the reader having to ask; everywhere else it is a reminder of
   * what they are working towards and stays a strip.
   */
  public readonly shotsOpen = computed(() => this.onFinale());

  /** Which picture the enlarged view is showing, or null while it is shut. */
  private readonly enlargedAt = signal<number | null>(null);
  public readonly enlargedShot = computed<LearnShot | null>(() => {
    const at = this.enlargedAt();
    return at === null ? null : (this.shots()[at] ?? null);
  });

  private readonly shotTriggers =
    viewChildren<ElementRef<HTMLButtonElement>>('shotTrigger');

  public openShot(index: number): void {
    this.enlargedAt.set(index);
  }

  /** Closing hands focus back to the picture that opened the view. */
  public closeShot(): void {
    const at = this.enlargedAt();
    this.enlargedAt.set(null);
    if (at !== null) {
      this.shotTriggers()[at]?.nativeElement.focus();
    }
  }

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

  /** What the strips under a step are, where they are not this example's own. */
  public evidenceNoteKey(step: FlowStep): string {
    return `generate.learn.flows.${this.engine.activeFlowId()}.steps.${step.id}.evidence_note`;
  }

  /** The panel area a step is about, so card and field share one hue. */
  public identityFor(step: FlowStep): SectionIdentity | null {
    return sectionIdentity(sectionFor(step.id));
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

  private readonly sheet = viewChild(GsSheetComponent);

  /**
   * Write the step's fields and stay where we are. The panel does not advance
   * on an apply either: the reader is meant to look at what just changed in the
   * form, which is the whole reason the step named it.
   */
  public apply(): void {
    this.uncover(() => this.engine.applyStep());
  }

  /** Point at the current field again, for a reader who has scrolled away. */
  public showMe(): void {
    this.uncover(() => this.engine.focusStep(true));
  }

  /** Ask for the example again, after it would not load. */
  public retryExample(): void {
    this.engine.retryExample();
  }

  /**
   * A field can only be looked at in the band above the sheet, so a sheet that
   * is the whole screen drops to half before the engine scrolls the field into
   * that band. The drop publishes the sheet's new clearance after the next
   * render, and the scroll has to read it, so the action waits one frame.
   */
  private uncover(action: () => void): void {
    const sheet = this.sheet();
    if (sheet && sheet.stop() === 'full') {
      sheet.down();
      setTimeout(action, 60);
      return;
    }
    action();
  }

  /** Leave for the results; the flow is parked, not ended. */
  public exit(): void {
    this.engine.pause();
  }
}
