import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../assets/i18n/en.json';
import { GenerateBlockersModalComponent } from './generate-blockers-modal.component';
import type { SubmitBlocker } from '../request-lint';

const BLOCKERS: SubmitBlocker[] = [
  { anchor: 'prompt', key: 'generate.blockers.prompt_required' },
  {
    anchor: 'steps',
    key: 'generate.blockers.range',
    params: { field: 'Steps', min: 1, max: 500 },
  },
];

describe('GenerateBlockersModalComponent', () => {
  let fixture: ComponentFixture<GenerateBlockersModalComponent>;
  let component: GenerateBlockersModalComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GenerateBlockersModalComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateBlockersModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('blockers', BLOCKERS);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('draws one row per thing standing in the way, worded', () => {
    const rows = el.querySelectorAll('.gs-blockers-row');

    expect(rows).toHaveLength(2);
    expect(rows[1].querySelector('.gs-blockers-text')?.textContent).toContain(
      'Steps must be between 1 and 500.',
    );
  });

  it('takes the reader to the control the row names', () => {
    const anchors: string[] = [];
    component.goTo.subscribe((anchor) => anchors.push(anchor));

    el.querySelectorAll<HTMLButtonElement>('.gs-blockers-goto')[1].click();

    expect(anchors).toEqual(['steps']);
  });

  it('opens with focus on the dialog rather than a row action', () => {
    expect(document.activeElement).toBe(el.querySelector('.gs-blockers-panel'));
  });

  it('closes on Escape', () => {
    const closed = vi.fn();
    component.closed.subscribe(closed);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
