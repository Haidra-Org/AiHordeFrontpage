import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { StudioJsonModalComponent } from './studio-json-modal.component';

describe('StudioJsonModalComponent', () => {
  async function create(data: unknown) {
    await TestBed.configureTestingModule({
      imports: [
        StudioJsonModalComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudioJsonModalComponent);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return fixture;
  }

  it('renders missing data explicitly instead of a blank code block', async () => {
    const fixture = await create(undefined);
    expect(fixture.nativeElement.querySelector('code').textContent).toBe(
      'null',
    );
    expect(fixture.componentInstance.json()).toBe('null');
    fixture.destroy();
  });

  it('offers full payload downloads only when the host has the original body', async () => {
    const fixture = await create({ request: { prompt: 'a cat' } });
    const downloads: boolean[] = [];
    fixture.componentInstance.downloadFullPayload.subscribe(() =>
      downloads.push(true),
    );
    expect(fixture.nativeElement.querySelector('.gs-tile-btn')).toBeNull();
    fixture.componentRef.setInput('fullPayloadAvailable', true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.gs-tile-btn',
    ) as HTMLButtonElement;
    button.click();
    expect(downloads).toEqual([true]);
    fixture.componentRef.setInput('fullPayloadDownloading', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    fixture.destroy();
  });
});
