import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
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
  /**
   * The shape to hold open while the file is on its way, as a CSS ratio. Taken
   * from the size the example was actually generated at where the request says
   * one, so the stage does not resize under the reader when the picture lands.
   */
  aspect: string;
}

/**
 * The same address, asked for again. A browser that has already failed on a
 * URL will answer from that failure, so a retry has to differ somewhere.
 */
function askAgain(url: string, attempt: number): string {
  if (attempt === 0) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}again=${attempt}`;
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
    const again = this.attempt();
    const source = this.engine.exampleSource();
    const shots: LearnShot[] = [];
    if (source) {
      shots.push({
        src: askAgain(source, again),
        captionKey: 'generate.tutorials.example_source',
        enlargeKey: 'generate.tutorials.example_source_enlarge',
        // The example says what it produced, not what it was given, so the
        // starting picture holds a square until its own file says otherwise.
        aspect: '1 / 1',
      });
    }
    shots.push({
      src: askAgain(result, again),
      captionKey: 'generate.tutorials.example_result',
      enlargeKey: 'generate.tutorials.example_result_enlarge',
      aspect: this.resultAspect(),
    });
    return shots;
  });

  /** The shape the example was generated at, or a square where it says nothing. */
  private resultAspect(): string {
    const example = this.engine.example();
    return example && example.width > 0 && example.height > 0
      ? `${example.width} / ${example.height}`
      : '1 / 1';
  }

  /**
   * The picture the bar carries beside the step. The result rather than the
   * starting picture: it is what the reader is working towards, and the bar has
   * room for one.
   */
  public readonly barShot = computed<LearnShot | null>(
    () => this.shots().at(-1) ?? null,
  );

  /**
   * Which pictures have arrived. A stage that has nothing in it is not a
   * picture, so nothing offers to enlarge one until its file is on the screen:
   * an empty box that opens an empty view is how a picture that never came
   * reads as a picture that is not there.
   */
  private readonly arrived = signal<ReadonlySet<string>>(new Set());
  /** Which would not arrive, so the stage says so instead of staying blank. */
  private readonly absent = signal<ReadonlySet<string>>(new Set());
  /** Bumped to ask for the files again after one of them would not load. */
  private readonly attempt = signal(0);

  public shotArrived(src: string): boolean {
    return this.arrived().has(src);
  }

  public shotAbsent(src: string): boolean {
    return this.absent().has(src);
  }

  public onShotLoad(src: string): void {
    this.arrived.update((seen) => new Set(seen).add(src));
    this.absent.update((gone) => {
      if (!gone.has(src)) {
        return gone;
      }
      const next = new Set(gone);
      next.delete(src);
      return next;
    });
  }

  public onShotError(src: string): void {
    this.absent.update((gone) => new Set(gone).add(src));
  }

  /**
   * Ask for the pictures again. A file that would not load is usually a moment
   * of network, and the browser has already recorded the failure against that
   * address, so the request carries a different one.
   */
  public retryPicture(): void {
    this.absent.set(new Set());
    this.attempt.update((n) => n + 1);
  }

  /** Which picture the enlarged view is showing, or null while it is shut. */
  private readonly enlargedAt = signal<number | null>(null);
  public readonly enlargedShot = computed<LearnShot | null>(() => {
    const at = this.enlargedAt();
    return at === null ? null : (this.shots()[at] ?? null);
  });

  private readonly shotTriggers =
    viewChildren<ElementRef<HTMLButtonElement>>('shotTrigger');

  /**
   * The picture that opened the view, so focus goes back to it. The same
   * picture is offered from the bar and from the step, and the two are
   * different buttons on the screen.
   */
  private shotOpener: HTMLElement | null = null;

  public openShot(index: number, opener?: HTMLElement): void {
    this.shotOpener = opener ?? null;
    this.enlargedAt.set(index);
  }

  /** Closing hands focus back to the picture that opened the view. */
  public closeShot(): void {
    const at = this.enlargedAt();
    const opener = this.shotOpener;
    this.enlargedAt.set(null);
    this.shotOpener = null;
    if (opener?.isConnected) {
      opener.focus();
      return;
    }
    if (at !== null) {
      this.shotTriggers()[at]?.nativeElement.focus();
    }
  }

  /**
   * Whether to say the panel was cleared. Only on the first step, and only
   * while there is something to bring back: a reader who meets an empty panel
   * with no explanation assumes the studio lost their work.
   */
  public readonly setAsideNote = computed(
    () => this.stepIndex() === 0 && this.engine.settingsSetAside(),
  );

  /**
   * What the live model list says about the model this step writes, or null
   * where there is nothing to say. See
   * {@link TutorialEngineService.stepModelNoteKey}.
   */
  public readonly modelNoteKey = this.engine.stepModelNoteKey;

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
   * A one-entry list keyed by the step, so the step card is a new element every
   * time the reader moves and the slide that introduces it runs again. An
   * element whose bindings merely change is reused, and an animation on a
   * reused element plays once and never again.
   */
  public readonly stepMarker = computed(() => [this.stepIndex()]);

  /** Which way the last move went, so the card comes in from the side it left. */
  public readonly steppedBack = signal(false);
  private previousIndex = 0;

  constructor() {
    effect(() => {
      const index = this.stepIndex();
      untracked(() => this.arriveAtStep(index));
    });
  }

  /**
   * Meet every step the same way: the bar, at the top of the step, with the
   * form behind it. A step is about a control, and a reader cannot work a
   * control the step is covering; the reader who wants the whole step still has
   * the grabber and the labelled button, and what they open stays open until
   * they move on.
   */
  private arriveAtStep(index: number): void {
    this.steppedBack.set(index < this.previousIndex);
    this.previousIndex = index;
    const sheet = this.sheet();
    sheet?.collapse();
    sheet?.scrollBodyToTop();
  }

  /**
   * A swipe across the bar or the step moves between steps, in the direction a
   * reader turns a page. Back and Next carry the same two moves in words, so
   * nothing depends on knowing the gesture.
   */
  public onSwipe(direction: 'forward' | 'back'): void {
    if (this.conceptTrack()) {
      return;
    }
    if (direction === 'forward') {
      this.next();
    } else {
      this.back();
    }
  }

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
