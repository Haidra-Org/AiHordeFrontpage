import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GsPictureDialogComponent,
  type PictureSetPosition,
} from './gs-picture-dialog.component';
import { StudioHandoffService } from '../../services/studio-handoff.service';
import { PromoGalleryImage } from '../../types/promo-gallery';

const SNAIL_TITLE = 'Snail whose shell is a gothic cathedral with lit…';

const WITH_RECIPE: PromoGalleryImage = {
  id: 'snail-cathedral',
  file: 'gallery/snail-cathedral/result.webp',
  prompt:
    'a snail whose shell is a gothic cathedral with lit stained-glass windows, crawling through a garden at dusk',
  tags: ['whimsy', 'art'],
  model: 'AlbedoBase XL 3.1',
  seed: '43002',
  seconds: 54.5,
  kudos: 39,
  width: 1024,
  height: 1024,
  request: {
    prompt:
      'a snail whose shell is a gothic cathedral with lit stained-glass windows, crawling through a garden at dusk',
    params: {
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 5,
      sampler_name: 'k_dpmpp_2m',
      karras: true,
      n: 1,
      seed: '43002',
    },
    nsfw: false,
    censor_nsfw: true,
    models: ['AlbedoBase XL 3.1'],
    r2: true,
    slow_workers: true,
    shared: false,
  },
};

const WITHOUT_RECIPE: PromoGalleryImage = {
  id: 'tram-rainbow',
  file: 'gallery/tram-rainbow/result.webp',
  prompt: 'a vintage tram climbing a rainbow above a rainy city, painterly',
  tags: ['whimsy'],
  model: 'Flux.1-Schnell fp8 (Compact)',
  seed: '42010',
  seconds: 33.2,
  kudos: 21,
  width: 1024,
  height: 1024,
};

@Component({
  imports: [GsPictureDialogComponent],
  template: `<app-gs-picture-dialog
    [picture]="picture()"
    [pictureUrl]="'https://assets.example/' + picture().file"
    [set]="set()"
    (closed)="closed()"
    (prev)="prev()"
    (next)="next()"
  />`,
})
class HostComponent {
  public readonly picture = signal<PromoGalleryImage>(WITH_RECIPE);
  public readonly set = signal<PictureSetPosition | null>(null);
  public readonly closed = vi.fn();
  public readonly prev = vi.fn();
  public readonly next = vi.fn();
}

describe('GsPictureDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const text = (selector: string): string =>
    find(selector)?.textContent?.trim() ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'gallery.recipe_title': 'The recipe',
              'gallery.recipe_missing':
                "This picture's settings are not published yet.",
              'gallery.use_recipe': 'Use this recipe in the studio',
              'gallery.copy_prompt': 'Copy prompt',
              'gallery.seed': 'Seed {{seed}}',
              'gallery.at_of': '{{at}} of {{count}}',
              'gallery.prev_picture': 'Previous picture',
              'gallery.next_picture': 'Next picture',
              'gallery.close_picture': 'Close',
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('names the picture from the opening words of its prompt', () => {
    expect(text('.gs-picdlg-title')).toBe(SNAIL_TITLE);
    expect(text('.gs-picdlg-facts')).toContain('AlbedoBase XL 3.1');
    expect(text('.gs-picdlg-facts')).toContain('43002');
  });

  it('reads the recipe out in the studio own metadata panel', () => {
    const panel = find('app-image-meta-panel');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('The recipe');
    expect(panel!.textContent).toContain('1024');
    // Read-only: no apply apparatus, and no dialog role of its own that would
    // take the layer's other controls out of a screen reader's reach.
    expect(panel!.querySelector('.gs-meta-foot')).toBeNull();
    expect(panel!.querySelector('[aria-modal="true"]')).toBeNull();
  });

  it('offers the studio door only for a picture that has a recipe', () => {
    expect(find('.gs-picdlg-use')).not.toBeNull();

    host.picture.set(WITHOUT_RECIPE);
    fixture.detectChanges();

    expect(find('.gs-picdlg-use')).toBeNull();
    expect(el().textContent).toContain(
      "This picture's settings are not published yet.",
    );
  });

  it('hands the recipe to the studio and goes there', async () => {
    const handoff = TestBed.inject(StudioHandoffService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    find<HTMLButtonElement>('.gs-picdlg-use')!.click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/generate/image']);
    const pending = handoff.consume();
    expect(pending?.recipe).toEqual(WITH_RECIPE.request);
    expect(pending?.recipeTitle).toBe(SNAIL_TITLE);
    expect(pending?.promptMode).toBe('set');
  });

  it('grows a step band only when the caller offers a set', () => {
    expect(find('.gs-picdlg-steps')).toBeNull();

    host.set.set({ count: 12, at: 3 });
    fixture.detectChanges();

    expect(text('.gs-picdlg-count')).toBe('3 of 12');
    find<HTMLButtonElement>('.gs-picdlg-step')!.click();
    expect(host.prev).toHaveBeenCalled();
  });

  it('walks the set from the arrow keys and closes on Escape', () => {
    host.set.set({ count: 12, at: 3 });
    fixture.detectChanges();

    const panel = find<HTMLElement>('.gs-picdlg-panel')!;
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(host.next).toHaveBeenCalled();

    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(host.closed).toHaveBeenCalled();
  });

  it('closes on a press outside the panel but not inside it', () => {
    const layer = find<HTMLElement>('app-gs-picture-dialog')!;
    find<HTMLElement>('.gs-picdlg-panel')!.click();
    expect(host.closed).not.toHaveBeenCalled();

    layer.click();
    expect(host.closed).toHaveBeenCalled();
  });
});
