import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import { ImageMetaPanelComponent } from '../../pages/generate/image-meta-panel/image-meta-panel.component';
import { StudioHandoffService } from '../../services/studio-handoff.service';
import { ToastService } from '../../services/toast.service';
import { useScrollLock } from '../../helper/scroll-lock';
import { PromoGalleryImage, galleryTitle } from '../../types/promo-gallery';

/** Where this one sits in the set the calling surface is showing. */
export interface PictureSetPosition {
  /** How many pictures the surface is offering. */
  count: number;
  /** Which of them this is, counting from one. */
  at: number;
}

/**
 * One published picture, seen whole with the settings that made it.
 *
 * The gallery's pictures are worked examples rather than decoration, so
 * wherever one is pressed the reader meets the same three things: the picture
 * at the size a tile cannot give it, the request it was made with read out in
 * the same panel the studio uses for the reader's own results, and a door into
 * the studio with those settings already in hand. A picture published before
 * the manifest carried requests has none, and then the panel says so and the
 * door is not offered rather than leading somewhere with nothing to give.
 *
 * The layer carries `gen-studio` because that is the scope the metadata
 * panel's design tokens are declared on, and `hd-deep` because a hue in the
 * surround biases the eye judging a picture.
 */
@Component({
  selector: 'app-gs-picture-dialog',
  imports: [TranslocoPipe, IconComponent, ImageMetaPanelComponent],
  templateUrl: './gs-picture-dialog.component.html',
  host: {
    class: 'gen-studio hd-deep gs-picdlg',
    tabindex: '0',
    '(click)': 'onBackdrop($event)',
    '(keydown.escape)': 'close()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsPictureDialogComponent {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly handoff = inject(StudioHandoffService);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public readonly picture = input.required<PromoGalleryImage>();
  /** Where the picture's bytes are; the caller owns the address. */
  public readonly pictureUrl = input.required<string>();
  /**
   * A name for the picture. The manifest publishes none, so the head falls
   * back to the opening words of the prompt; a surface that already calls the
   * picture something passes that instead.
   */
  public readonly title = input<string | null>(null);
  /**
   * The set this picture is one of, where the surface is showing several. It
   * grows the head a step back, a step on and a count, and the arrow keys move
   * the same way. Null is one picture and no band.
   */
  public readonly set = input<PictureSetPosition | null>(null);

  public readonly closed = output<void>();
  public readonly prev = output<void>();
  public readonly next = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Whatever the reader was on when the picture opened, to be given back. */
  private readonly returnFocus = this.document
    .activeElement as HTMLElement | null;

  /** True from the press on the studio door until the route changes. */
  public readonly going = signal(false);

  public readonly heading = computed(
    () => this.title() ?? galleryTitle(this.picture().prompt),
  );

  /** The request, where the manifest published one for this picture. */
  public readonly recipe = computed(() => this.picture().request ?? null);

  /** What the panel says in place of settings rows it has not been given. */
  public readonly noteKey = computed(() =>
    this.recipe() ? null : 'gallery.recipe_missing',
  );

  public readonly count = computed(() => this.set()?.count ?? 0);
  public readonly at = computed(() => this.set()?.at ?? 0);

  constructor() {
    useScrollLock().enable();
    // The panel takes focus as it opens, so the key that closes it and the
    // controls that walk the set are where the reader already is.
    afterNextRender(() => this.panel()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  public close(): void {
    this.closed.emit();
    queueMicrotask(() => this.returnFocus?.focus());
  }

  /** The backdrop closes; a press that landed on the panel itself does not. */
  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  /**
   * Escape closes, the arrows step where the surface offered a set, and Tab is
   * held inside the layer by hand so it never reaches the page that opened it.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (
      this.count() > 1 &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      event.stopPropagation();
      (event.key === 'ArrowLeft' ? this.prev : this.next).emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    event.preventDefault();
    const panel = this.panel()?.nativeElement;
    const buttons = panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>('button:not([disabled])'),
        )
      : [];
    if (buttons.length === 0) {
      return;
    }
    const at = buttons.indexOf(this.document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    const next = at < 0 ? 0 : (at + step + buttons.length) % buttons.length;
    buttons.at(next)?.focus();
  }

  /**
   * Take the recipe into the studio. The settings are handed over rather than
   * applied from here: the studio owns the form, and it is the studio that has
   * to ask before replacing what the reader already had.
   */
  public async useRecipe(): Promise<void> {
    const recipe = this.recipe();
    if (!recipe || this.going()) {
      return;
    }
    this.going.set(true);
    // The recipe carries its own prompt, so no separate prompt is sent; the
    // mode still says which of the two readings applies to it.
    this.handoff.set({
      recipe,
      recipeTitle: this.heading(),
      promptMode: 'set',
    });
    try {
      await this.router.navigate(['/generate/image']);
    } catch {
      // The studio never opened, so the door goes back to being a door.
      this.going.set(false);
    }
  }

  public async copyPrompt(): Promise<void> {
    if (
      !this.isBrowser ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.picture().prompt);
      this.toast.success('gallery.prompt_copied', { transloco: true });
    } catch {
      this.toast.error('gallery.prompt_copy_failed', { transloco: true });
    }
  }
}
