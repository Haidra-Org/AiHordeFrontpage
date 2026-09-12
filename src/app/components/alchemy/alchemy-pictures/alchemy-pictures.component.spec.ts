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
});
