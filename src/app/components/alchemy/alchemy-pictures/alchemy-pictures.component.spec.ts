import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AlchemyPicture,
  AlchemyPicturesComponent,
} from './alchemy-pictures.component';

const picture = (
  key: string,
  stored = true,
  detector: string | null = null,
): AlchemyPicture => ({
  key,
  form: detector ? 'annotation' : key,
  detector,
  url: stored ? `blob:${key}` : `https://r2.example/${key}.webp`,
  stored,
  downloadName: `${key}.webp`,
});

describe('AlchemyPicturesComponent', () => {
  let fixture: ComponentFixture<AlchemyPicturesComponent>;
  let carried: string | null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        AlchemyPicturesComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
    });
    fixture = TestBed.createComponent(AlchemyPicturesComponent);
    carried = null;
    fixture.componentInstance.useInStudio.subscribe((key) => (carried = key));
  });

  const render = (
    pictures: AlchemyPicture[],
    source: string | null = 'blob:source',
  ): void => {
    fixture.componentRef.setInput('pictures', pictures);
    fixture.componentRef.setInput('source', source);
    fixture.detectChanges();
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('shows the first picture wiped against the source, with a thumb per picture', () => {
    render([
      picture('annotation-canny', true, 'canny'),
      picture('annotation-depth', true, 'depth'),
      picture('RealESRGAN_x4plus'),
    ]);
    expect(el().querySelector('app-gs-compare-wipe')).not.toBeNull();
    expect(fixture.componentInstance.picked()?.key).toBe('annotation-canny');
    const thumbs = [...el().querySelectorAll('.alchemy-pictures__thumb')];
    expect(thumbs.length).toBe(3);
    expect(thumbs[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the pressed thumb on the stage', () => {
    render([picture('a'), picture('b')]);
    (
      el().querySelectorAll('.alchemy-pictures__thumb')[1] as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.picked()?.key).toBe('b');
    expect(
      el().querySelector('app-gs-compare-wipe img.gs-wipe-img:last-of-type'),
    ).not.toBeNull();
  });

  it('draws the picture alone when there is no source, and no strip for one picture', () => {
    render([picture('a')], null);
    expect(el().querySelector('app-gs-compare-wipe')).toBeNull();
    expect(el().querySelector('.alchemy-pictures__lone')).not.toBeNull();
    expect(el().querySelector('.alchemy-pictures__film')).toBeNull();
  });

  it('offers the studio only for a copy held in this browser', () => {
    render([picture('a', false)]);
    expect(el().querySelector('.alchemy-pictures__actions button')).toBeNull();
    render([picture('b', true)]);
    (
      el().querySelector(
        '.alchemy-pictures__actions button',
      ) as HTMLButtonElement
    ).click();
    expect(carried).toBe('b');
  });

  it('folds to a strip of small frames and follows the fold pin', () => {
    render([picture('a'), picture('b')]);
    fixture.componentRef.setInput('foldPin', { open: false, stamp: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(el().querySelectorAll('.alchemy-pictures__mini').length).toBe(2);
    fixture.componentInstance.toggleOpen();
    expect(fixture.componentInstance.isOpen()).toBe(true);
    fixture.componentRef.setInput('foldPin', { open: false, stamp: 2 });
    fixture.detectChanges();
    expect(fixture.componentInstance.isOpen()).toBe(false);
  });

  describe('zoom', () => {
    interface Internals {
      resultSize: { set(v: { width: number; height: number } | null): void };
      sourceSize: { set(v: { width: number; height: number } | null): void };
      stageBox: { set(v: { width: number; height: number }): void };
      pan: { set(v: { x: number; y: number }): void };
    }
    const internals = (): Internals =>
      fixture.componentInstance as unknown as Internals;

    beforeEach(() => {
      render([picture('up')]);
      // A 2048px upscale of a 512px source, on a 512px-wide stage.
      internals().resultSize.set({ width: 2048, height: 2048 });
      internals().sourceSize.set({ width: 512, height: 512 });
      internals().stageBox.set({ width: 512, height: 512 });
      fixture.detectChanges();
    });

    it('keeps the measured size when the host hands over an equal pictures array', () => {
      // The browser rebuilds the array on every change detection pass; a
      // fresh array with the same picture must not restart the probe, or the
      // fitted box would drop for a frame on every pointer move.
      fixture.componentRef.setInput('pictures', [picture('up')]);
      fixture.detectChanges();
      expect(fixture.componentInstance.fitScale()).toBeCloseTo(0.25, 5);
      expect(fixture.componentInstance.fitBox()).toEqual({
        width: 512,
        height: 512,
      });
    });

    it('fits the result to the stage and offers the named sizes above it', () => {
      const c = fixture.componentInstance;
      expect(c.fitScale()).toBeCloseTo(0.25, 5);
      expect(c.zoomStep()).toBe('fit');
      expect(c.zoomFactor()).toBe(1);
      expect(c.offersZoom()).toBe(true);
      expect(c.fitBox()).toEqual({ width: 512, height: 512 });
      expect(
        el().querySelectorAll('.alchemy-pictures__scales button').length,
      ).toBe(3);
    });

    it('draws the result at its own pixels on 100% and twice them on 200%', () => {
      const c = fixture.componentInstance;
      c.zoomTo(1);
      expect(c.zoomStep()).toBe('full');
      expect(c.zoomFactor()).toBeCloseTo(4, 5);
      expect(c.zoomedIn()).toBe(true);
      c.zoomTo(2);
      expect(c.zoomStep()).toBe('double');
      expect(c.zoomFactor()).toBeCloseTo(8, 5);
      c.zoomTo(null);
      expect(c.zoomStep()).toBe('fit');
      expect(c.zoomedIn()).toBe(false);
    });

    it('says the source was enlarged to meet the result', () => {
      expect(fixture.componentInstance.sourceEnlarged()).toBe(true);
      internals().sourceSize.set({ width: 2048, height: 2048 });
      expect(fixture.componentInstance.sourceEnlarged()).toBe(false);
    });

    it('pans the pair only while zoomed in, and no further than the overhang', () => {
      const c = fixture.componentInstance;
      const down = (x: number, y: number) =>
        new PointerEvent('pointerdown', { clientX: x, clientY: y, button: 0 });
      const move = (x: number, y: number) =>
        new PointerEvent('pointermove', { clientX: x, clientY: y });
      c.onStagePointerDown(down(0, 0));
      c.onStagePointerMove(move(40, 40));
      expect(c.panX()).toBe(0);

      c.zoomTo(1);
      c.onStagePointerDown(down(0, 0));
      c.onStagePointerMove(move(40, -30));
      expect(c.panX()).toBe(40);
      expect(c.panY()).toBe(-30);
      // At 100% a 2048px picture overhangs a 512px stage by 768px a side.
      c.onStagePointerMove(move(5000, -5000));
      expect(c.panX()).toBe(768);
      expect(c.panY()).toBe(-768);
      c.onStagePointerUp();
      c.onStagePointerMove(move(0, 0));
      expect(c.panX()).toBe(768);
    });

    it('opens the viewer on the same pick and closes it again', () => {
      const c = fixture.componentInstance;
      c.openViewer();
      fixture.detectChanges();
      expect(el().querySelector('.alchemy-pictures__viewer')).not.toBeNull();
      expect(el().querySelectorAll('app-gs-compare-wipe').length).toBe(2);
      c.closeViewer();
      fixture.detectChanges();
      expect(el().querySelector('.alchemy-pictures__viewer')).toBeNull();
    });
  });
});
