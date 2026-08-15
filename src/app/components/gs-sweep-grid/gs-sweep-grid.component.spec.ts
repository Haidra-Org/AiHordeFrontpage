import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { GsSweepGridComponent } from './gs-sweep-grid.component';
import { environment } from '../../../environments/environment';
import en from '../../../assets/i18n/en.json';
import stubIndex from '../../testing/fixtures/sweep-index.stub.json';

@Component({
  imports: [GsSweepGridComponent],
  template: `<app-gs-sweep-grid
    [parameter]="parameter"
    [startExpanded]="startExpanded"
  />`,
})
class HostComponent {
  public parameter = 'steps_cfg_grid';
  public startExpanded = false;
}

describe('GsSweepGridComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
  /** The words in a set of cells, with the template's own whitespace out. */
  const words = (selector: string): string[] =>
    all(selector).map(
      (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  const press = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    find<HTMLElement>('.gs-sweep-viewer-body')!.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  async function setUp(options?: {
    parameter?: string;
    empty?: boolean;
    /** Whether the surface lays the plate out on the page rather than over it. */
    startExpanded?: boolean;
  }): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.parameter =
      options?.parameter ?? 'steps_cfg_grid';
    fixture.componentInstance.startExpanded = options?.startExpanded ?? false;
    fixture.detectChanges();

    const request = http.expectOne(`${environment.evidenceBaseUrl}/index.json`);
    if (options?.empty) {
      request.error(new ProgressEvent('offline'), {
        status: 0,
        statusText: '',
      });
    } else {
      request.flush(stubIndex);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  const open = (): void => {
    find<HTMLButtonElement>('.gs-sweep-grid-offer')!.click();
    fixture.detectChanges();
  };

  it('renders nothing at all when the library has no plate', async () => {
    await setUp({ empty: true });

    expect(el().textContent?.trim()).toBe('');
  });

  it('renders nothing for a parameter that is a strip rather than a plate', async () => {
    await setUp({ parameter: 'steps' });

    expect(find('.gs-sweep-grid-offer')).toBeNull();
  });

  it('offers the plate as a door onto its own frames', async () => {
    await setUp();

    // The door names both settings, so two doors on one page are told apart,
    // and states the payload rather than describing it.
    const door = find('.gs-sweep-grid-offer')!;
    expect(door.querySelector('.gs-cap-title')?.textContent?.trim()).toBe(
      'Open the Steps × Guidance (CFG) grid',
    );
    expect(door.querySelector('.gs-cap-eyebrow')?.textContent?.trim()).toBe(
      'Sampling · Evidence grid',
    );
    expect(door.querySelector('.gs-cap-meta')?.textContent?.trim()).toBe(
      '4 frames · 2 × 2',
    );
    // The contact sheet is the plate's own first stops. Nothing else is
    // fetched: a grid is dozens of frames and waits to be asked for.
    expect(
      all<HTMLImageElement>('.gs-door-tile').map((tile) =>
        tile.getAttribute('src'),
      ),
    ).toEqual(
      ['001_s08_c2', '002_s08_c7', '003_s30_c2', '004_s30_c7'].map(
        (file) =>
          `${environment.evidenceBaseUrl}/steps-cfg-grid/albedobase-xl/person/${file}.webp`,
      ),
    );
    expect(all('.gs-sweep-plate-img')).toHaveLength(0);
  });

  it('lays the plate out under the headers its axes name', async () => {
    await setUp();
    open();

    // Every head is a setting chip: a bare 8 over a bare 2 says nothing about
    // which of the two settings the column is.
    expect(words('th[scope="col"]')).toEqual(['Guidance 2', 'Guidance 7']);
    expect(words('th[scope="row"]')).toEqual(['Steps 8', 'Steps 30']);
    expect(words('.gs-sweep-plate-corner')).toEqual([
      'Steps down × Guidance (CFG) across',
    ]);
    // The heads carry no glyph: two marks repeated down and across a plate are
    // noise, and the chip's own label already names the axis.
    expect(all('th[scope="col"] .gs-sec-chip')).toHaveLength(0);
    const cells = all<HTMLButtonElement>('.gs-sweep-plate-cell');
    expect(cells).toHaveLength(4);
    // Row by row, as the index publishes the stops.
    expect(cells[3].getAttribute('aria-label')).toBe('30 steps at guidance 7.');
    expect(cells[0].querySelector('img')?.getAttribute('loading')).toBe('lazy');
  });

  it('zooms a cell to its own frame and its caption, and steps back out', async () => {
    await setUp();
    open();

    all<HTMLButtonElement>('.gs-sweep-plate-cell')[2].click();
    fixture.detectChanges();

    expect(
      find<HTMLImageElement>('.gs-sweep-viewer-img')?.getAttribute('src'),
    ).toBe(
      `${environment.evidenceBaseUrl}/steps-cfg-grid/albedobase-xl/person/003_s30_c2.webp`,
    );
    expect(el().textContent).toContain('30 steps at guidance 2.');

    find<HTMLButtonElement>('.gs-sweep-collapse')!.click();
    fixture.detectChanges();

    expect(all('.gs-sweep-plate-cell')).toHaveLength(4);
  });

  it('moves between cells with the arrow keys, one axis at a time', async () => {
    await setUp();
    open();

    // The first press enters the plate rather than moving inside it.
    press('ArrowRight');
    expect(document.activeElement).toBe(all('.gs-sweep-plate-cell')[0]);

    press('ArrowRight');
    expect(document.activeElement).toBe(all('.gs-sweep-plate-cell')[1]);

    press('ArrowDown');
    expect(document.activeElement).toBe(all('.gs-sweep-plate-cell')[3]);

    // The edges hold rather than wrapping onto the wrong row.
    press('ArrowDown');
    press('ArrowRight');
    expect(document.activeElement).toBe(all('.gs-sweep-plate-cell')[3]);
  });

  it('heads an axis whose values are names rather than numbers', async () => {
    await setUp({ parameter: 'sampler_steps_grid' });
    open();

    expect(words('th[scope="row"]')).toEqual([
      'Sampler k_euler',
      'Sampler k_dpmpp_2m',
    ]);
    expect(words('th[scope="col"]')).toEqual(['Steps 8', 'Steps 30']);
  });

  it('heads an axis of flags as switch positions, not as true and false', async () => {
    await setUp({ parameter: 'hires_grid' });
    open();

    expect(words('th[scope="col"]')).toEqual([
      `Hires fix ${en['generate.sweeps.state_off']}`,
      `Hires fix ${en['generate.sweeps.state_on']}`,
    ]);
    expect(words('th[scope="row"]')).toEqual(['Size 768', 'Size 1024']);
  });

  it('moves between cells from the buttons in the zoomed view', async () => {
    await setUp();
    open();
    all<HTMLButtonElement>('.gs-sweep-plate-cell')[0].click();
    fixture.detectChanges();

    const steps = (): HTMLButtonElement[] =>
      all<HTMLButtonElement>('.gs-sweep-cell-step');
    // Left and up, in reading order, are off the plate from the first cell.
    expect(steps().map((button) => button.disabled)).toEqual([
      true,
      true,
      false,
      false,
    ]);

    steps()[3].click();
    fixture.detectChanges();
    expect(el().textContent).toContain('8 steps at guidance 7.');

    steps()[2].click();
    fixture.detectChanges();
    expect(el().textContent).toContain('30 steps at guidance 7.');
    expect(steps().map((button) => button.disabled)).toEqual([
      false,
      false,
      true,
      true,
    ]);

    steps()[0].click();
    fixture.detectChanges();
    expect(el().textContent).toContain('30 steps at guidance 2.');
  });

  it('steps out of a cell on Escape before it closes the plate', async () => {
    await setUp();
    open();
    all<HTMLButtonElement>('.gs-sweep-plate-cell')[1].click();
    fixture.detectChanges();

    press('Escape');
    expect(all('.gs-sweep-plate-cell')).toHaveLength(4);

    press('Escape');
    expect(find('.gs-sweep-viewer')).toBeNull();
    expect(find('.gs-sweep-grid-offer')).not.toBeNull();
  });

  describe('laid out on the page', () => {
    it('shows the plate with no offer, no dialog and no stolen focus', async () => {
      await setUp({ startExpanded: true });

      expect(find('.gs-sweep-grid-offer')).toBeNull();
      expect(all('.gs-sweep-plate-cell')).toHaveLength(4);
      const body = find<HTMLElement>('.gs-sweep-viewer-body')!;
      expect(body.getAttribute('role')).toBeNull();
      expect(body.getAttribute('aria-modal')).toBeNull();
      expect(document.activeElement).not.toBe(body);
      // Nothing to close, so nothing offers to.
      expect(find('.gs-sweep-viewer-x')).toBeNull();
      expect(find('.gs-sweep-viewer')?.className).toContain(
        'gs-sweep-viewer--inline',
      );
    });

    it('still opens a cell, and Escape steps back to the plate rather than out', async () => {
      await setUp({ startExpanded: true });

      all<HTMLButtonElement>('.gs-sweep-plate-cell')[1].click();
      fixture.detectChanges();
      expect(el().textContent).toContain('8 steps at guidance 7.');

      press('Escape');
      expect(all('.gs-sweep-plate-cell')).toHaveLength(4);

      press('Escape');
      expect(all('.gs-sweep-plate-cell')).toHaveLength(4);
    });
  });

  it('holds Tab inside the layer and closes from its backdrop', async () => {
    await setUp();
    open();

    const tab = press('Tab');
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(find('.gs-sweep-viewer-x'));

    find<HTMLElement>('.gs-sweep-viewer')!.click();
    fixture.detectChanges();
    expect(find('.gs-sweep-viewer')).toBeNull();
  });
});
