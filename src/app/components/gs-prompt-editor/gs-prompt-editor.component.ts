import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslocoPipe } from '@jsverse/transloco';
import { useScrollLock } from '../../helper/scroll-lock';

let nextInstance = 0;

/**
 * A full-screen editor for one of the studio's prompt fields, sitting under the
 * site nav. A phone gives a textarea's resize grip nothing to drag, so the
 * reader who wants to see more than two lines at once needs the field to take
 * the screen instead.
 *
 * It edits the caller's own control rather than a copy: what the reader types
 * here is in the form the moment it is typed, so there is no apply step to
 * forget and no second value that can disagree with the field behind it. Done
 * and Escape both mean the same thing, and focus goes back to whatever opened
 * the editor.
 */
@Component({
  selector: 'app-gs-prompt-editor',
  imports: [TranslocoPipe, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #panel
      class="gs-prompt-editor"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      cdkTrapFocus
      (keydown.escape)="close()"
    >
      <div class="gs-prompt-editor-head">
        <h2 class="gs-prompt-editor-title" [id]="titleId">{{ heading() }}</h2>
        <button
          type="button"
          class="gs-btn-primary gs-prompt-editor-done"
          (click)="close()"
        >
          {{ 'generate.form.prompt_editor_done' | transloco }}
        </button>
      </div>
      <textarea
        #area
        class="gs-prompt-editor-area"
        [value]="control().value"
        [disabled]="control().disabled"
        (input)="updateValue()"
        (blur)="control().markAsTouched()"
        [placeholder]="placeholder()"
        [attr.aria-label]="heading()"
      ></textarea>
    </div>
  `,
})
export class GsPromptEditorComponent {
  /** The field being edited, read out as the editor's name. */
  public readonly heading = input('');
  /** The form's own control, bound straight through. */
  public readonly control = input.required<FormControl<string>>();
  public readonly placeholder = input('');

  public readonly closed = output<void>();

  public readonly titleId = `gs-prompt-editor-${nextInstance++}`;

  private readonly area = viewChild<ElementRef<HTMLTextAreaElement>>('area');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /**
   * The editor covers the page, so the page stops scrolling beneath it: a drag
   * that starts on the heading or the button row is meant for the editor.
   * Released when the editor is destroyed, which is how it closes.
   */
  private readonly scrollLock = useScrollLock();
  /** Whatever the reader was on when the editor opened, to hand focus back. */
  private readonly opener: HTMLElement | null;

  constructor() {
    this.opener =
      this.isBrowser && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.scrollLock.enable();

    afterNextRender(() => {
      const viewport = window.visualViewport;
      if (viewport) {
        const fitViewport = (): void => {
          const style = this.panel()?.nativeElement.style;
          style?.setProperty(
            '--gs-editor-viewport-top',
            `${viewport.offsetTop}px`,
          );
          style?.setProperty(
            '--gs-editor-viewport-height',
            `${viewport.height}px`,
          );
        };
        fitViewport();
        viewport.addEventListener('resize', fitViewport);
        viewport.addEventListener('scroll', fitViewport);
        this.destroyRef.onDestroy(() => {
          viewport.removeEventListener('resize', fitViewport);
          viewport.removeEventListener('scroll', fitViewport);
        });
      }
      const area = this.area()?.nativeElement;
      if (!area) {
        return;
      }
      area.focus();
      // The reader opened this to carry on writing, so the caret starts where
      // the text ends rather than in front of what is already there.
      const end = area.value.length;
      area.setSelectionRange(end, end);
    });
  }

  public updateValue(): void {
    const area = this.area()?.nativeElement;
    const control = this.control();
    if (!area || control.disabled || area.value === control.value) return;
    // A second forms value accessor suppresses updates to the inline field.
    // Writing through the control keeps both views and keyboard composition in sync.
    control.markAsDirty();
    control.setValue(area.value);
  }

  public close(): void {
    this.updateValue();
    this.control().markAsTouched();
    this.opener?.focus({ preventScroll: true });
    this.closed.emit();
  }
}
