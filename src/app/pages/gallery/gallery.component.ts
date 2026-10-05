import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { IconComponent } from '../../components/icon/icon.component';
import {
  GsPictureDialogComponent,
  PictureSetPosition,
} from '../../components/gs-picture-dialog/gs-picture-dialog.component';
import { PromoGalleryService } from '../../services/promo-gallery.service';
import { PromoGalleryImage, galleryTitle } from '../../types/promo-gallery';
import { setPageMeta } from '../../helper/page-meta';
import { siteCardUrl } from '../../content/share-cards';

/** One tile, with the name the page draws under it worked out once. */
interface GalleryTile {
  picture: PromoGalleryImage;
  title: string;
  url: string;
  /**
   * The picture's shape as the justified grid reads it, `width/height`. The
   * grid gives a row's spare width out in this proportion, so a row of mixed
   * shapes resolves to one height with no dead space.
   */
  ratio: string;
}

/** The picture the address is pointing at, and where it sits in the filter. */
interface OpenPicture {
  picture: PromoGalleryImage;
  title: string;
  url: string;
  set: PictureSetPosition | null;
}

/**
 * The tags the library files a picture under, in the order the filter row
 * offers them. Each label is named outright rather than assembled, so the copy
 * is findable in the translation file by the key the template asks for.
 */
const GALLERY_TAGS: readonly { id: string; labelKey: string }[] = [
  { id: 'whimsy', labelKey: 'gallery.tag.whimsy' },
  { id: 'photo', labelKey: 'gallery.tag.photo' },
  { id: 'art', labelKey: 'gallery.tag.art' },
  { id: 'everyday', labelKey: 'gallery.tag.everyday' },
  { id: 'flux', labelKey: 'gallery.tag.flux' },
  { id: 'alchemy', labelKey: 'gallery.tag.alchemy' },
];

/** How many placeholder tiles stand in while the manifest is on its way. */
const SKELETON_TILES = 12;

/**
 * Every picture the horde made for this site, each with the settings that made
 * it.
 *
 * The pictures are worked examples rather than decoration, which is what the
 * page is for: a reader can see what the horde produced, read the exact request
 * behind it, and take that request into the studio. The manifest is published
 * beside the pictures, so the page is a view of a file rather than of a
 * database, and a browser that cannot reach the bucket says so plainly instead
 * of spinning.
 */
@Component({
  selector: 'app-gallery',
  imports: [TranslocoPipe, IconComponent, GsPictureDialogComponent],
  templateUrl: './gallery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalleryComponent implements OnInit {
  private readonly gallery = inject(PromoGalleryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  public readonly tags = GALLERY_TAGS;
  public readonly skeletons = Array.from(
    { length: SKELETON_TILES },
    (_unused, index) => index,
  );

  /** The tag the filter row is on, or '' for all of them. */
  public readonly activeTag = signal('');
  /** The model the filter is on, or '' for any of them. */
  public readonly activeModel = signal('');

  public readonly loaded = this.gallery.loaded;
  public readonly failed = this.gallery.failed;

  /** The id in the address, which is what says whether a picture is open. */
  private readonly openId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('picture'))),
    { initialValue: null },
  );

  /** Every model the manifest names, in the order the select offers them. */
  public readonly models = computed(() =>
    [
      ...new Set(
        this.gallery
          .images()
          .map((entry) => entry.model)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );

  public readonly tiles = computed<GalleryTile[]>(() => {
    const tag = this.activeTag();
    const model = this.activeModel();
    return this.gallery
      .images()
      .filter(
        (entry) =>
          (!tag || entry.tags?.includes(tag)) &&
          (!model || entry.model === model),
      )
      .map((picture) => ({
        picture,
        title: galleryTitle(picture.prompt),
        url: this.gallery.pictureUrl(picture),
        ratio: `${picture.width || 1}/${picture.height || 1}`,
      }));
  });

  public readonly countKey = computed(() =>
    this.tiles().length === 1 ? 'gallery.count_one' : 'gallery.count',
  );

  /**
   * What the address is asking to see. A picture inside the current filter is
   * one of a set and the layer can walk it; one reached by a link that the
   * filter excludes is still shown, on its own.
   */
  public readonly open = computed<OpenPicture | null>(() => {
    const id = this.openId();
    if (!id) {
      return null;
    }
    const tiles = this.tiles();
    const at = tiles.findIndex((tile) => tile.picture.id === id);
    const found = at >= 0 ? tiles[at] : undefined;
    if (found) {
      return { ...found, set: { count: tiles.length, at: at + 1 } };
    }
    const solo = this.gallery.byId(id);
    return solo
      ? {
          picture: solo,
          title: galleryTitle(solo.prompt),
          url: this.gallery.pictureUrl(solo),
          set: null,
        }
      : null;
  });

  constructor() {
    setPageMeta({
      titleKey: 'gallery.title',
      descriptionKey: 'gallery.lead',
      image: siteCardUrl(),
    });
  }

  public ngOnInit(): void {
    void this.gallery.ensureLoaded();
  }

  public retry(): void {
    void this.gallery.reload();
  }

  public setTag(tag: string): void {
    this.activeTag.set(tag);
  }

  public onModelChange(event: Event): void {
    this.activeModel.set((event.target as HTMLSelectElement).value);
  }

  /**
   * Open a picture by putting it in the address. The dialog follows the
   * address rather than a signal of its own, so Back closes it and a copied
   * link opens the same picture for whoever is sent it.
   */
  public openPicture(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { picture: id },
      queryParamsHandling: 'merge',
      // The picture is a layer over this page, so changing it keeps the grid's place.
      scroll: 'manual',
    });
  }

  public closePicture(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { picture: null },
      queryParamsHandling: 'merge',
      scroll: 'manual',
    });
  }

  /** Step through the filtered list, wrapping at either end. */
  public step(by: number): void {
    const open = this.open();
    const tiles = this.tiles();
    if (!open?.set || tiles.length === 0) {
      return;
    }
    const at = (open.set.at - 1 + by + tiles.length) % tiles.length;
    const target = tiles[at];
    if (target) {
      this.openPicture(target.picture.id);
    }
  }
}
