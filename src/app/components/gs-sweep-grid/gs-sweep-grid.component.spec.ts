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
  template: `<app-gs-sweep-grid [parameter]="parameter" />`,
})
class HostComponent {
  public parameter = 'steps_cfg_grid';
}

describe('GsSweepGridComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
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
    fixture.detectChanges();

    const request = http.expectOne(
      `${environment.sweepLibraryBaseUrl}/index.json`,
    );
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

  it('offers the plate in one line and fetches no frame until it is taken', async () => {
    await setUp();

    expect(find('.gs-sweep-grid-offer')?.textContent).toContain(
      en['generate.sweeps.grid_expand'],
    );
    expect(all('img')).toHaveLength(0);
  });

  it('lays the plate out under the headers its axes name', async () => {
    await setUp();
    open();

    expect(all('th[scope="col"]').map((h) => h.textContent?.trim())).toEqual([
      '2',
      '7',
    ]);
    expect(all('th[scope="row"]').map((h) => h.textContent?.trim())).toEqual([
      '8',
      '30',
    ]);
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
      `${environment.sweepLibraryBaseUrl}/steps-cfg-grid/albedobase-xl/person/003_s30_c2.webp`,
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

    expect(all('th[scope="row"]').map((h) => h.textContent?.trim())).toEqual([
      'k_euler',
      'k_dpmpp_2m',
    ]);
    expect(all('th[scope="col"]').map((h) => h.textContent?.trim())).toEqual([
      '8',
      '30',
    ]);
  });

  it('heads an axis of flags as switch positions, not as true and false', async () => {
    await setUp({ parameter: 'hires_grid' });
    open();

    expect(all('th[scope="col"]').map((h) => h.textContent?.trim())).toEqual([
      en['generate.sweeps.state_off'],
      en['generate.sweeps.state_on'],
    ]);
    expect(all('th[scope="row"]').map((h) => h.textContent?.trim())).toEqual([
      '768',
      '1024',
    ]);
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
