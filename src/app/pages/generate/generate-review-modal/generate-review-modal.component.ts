import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { ImageGenerationRequest } from '../../../types/generation';
import { CivitaiResolverService } from '../../../services/civitai-resolver.service';
import { highlightJson, stringifyAsJson } from '../../../helper/json-formatter';
import { requestToFormValue } from '../generate-form.model';
import type { RequestWarning } from '../request-lint';
import {
  MetaGroup,
  MetaRowDeps,
  buildMetaGroups,
  metaAssetIds,
} from '../image-meta-panel/image-meta-rows';

/** Which face of the request the reader is looking at. */
export type ReviewView = 'summary' | 'json';

/** What a focus trap counts as somewhere to land. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The last look at a request before it goes. Shown on request or when a model
 * recommends a different CLIP skip. Nothing is sent until the confirm in this
 * dialog is pressed.
 *
 * The request is handed in whole rather than rebuilt, so what is read here and
 * what is sent are one object. The summary is drawn by the same row builder the
 * results grid reads a finished image's settings with.
 */
@Component({
  selector: 'app-generate-review-modal',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './generate-review-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateReviewModalComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly resolver = inject(CivitaiResolverService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** The request as it would be sent. Never rebuilt here. */
  public readonly request = input.required<ImageGenerationRequest>();
  public readonly warnings = input<readonly RequestWarning[]>([]);
  /** The studio's standing estimate, or null while there is none to quote. */
  public readonly kudos = input<number | null>(null);

  public readonly confirmed = output<void>();
  public readonly cancelled = output<void>();

  public readonly view = signal<ReviewView>('summary');

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  private readonly rowDeps: MetaRowDeps = {
    translate: (key, params) => this.transloco.translate(key, params),
    assetLabel: (id, isVersion) =>
      this.resolver.metaFor({ id, isVersion })?.label ?? null,
  };

  private readonly formValue = computed(() =>
    requestToFormValue(this.request()),
  );

  public readonly groups = computed<MetaGroup[]>(() =>
    buildMetaGroups(this.formValue(), this.rowDeps),
  );

  public readonly json = computed(() => stringifyAsJson(this.request()));

  /** The body escapes its own markup, so the spans are the only HTML in it. */
  public readonly highlighted = computed(() => highlightJson(this.json()));

  /** How many images the request asks for; the horde defaults a missing `n` to one. */
  public readonly batch = computed(() => this.request().params?.n ?? 1);

  public readonly dimensions = computed(() => {
    const params = this.request().params;
    return {
      width: params?.width ?? 0,
      height: params?.height ?? 0,
    };
  });

  constructor() {
    effect(() => this.resolver.requestAll(metaAssetIds(this.formValue())));

    const onKeydown = (event: KeyboardEvent): void => this.handleKey(event);
    this.document.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('keydown', onKeydown),
    );

    // The dialog itself takes focus, never the confirm: a stray Enter held over
    // from the press that opened this must not send the request.
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  public setView(view: ReviewView): void {
    this.view.set(view);
  }

  public cancel(): void {
    this.cancelled.emit();
  }

  public confirm(): void {
    this.confirmed.emit();
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) {
      return;
    }
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
