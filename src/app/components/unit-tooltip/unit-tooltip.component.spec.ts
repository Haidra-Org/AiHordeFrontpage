import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { UnitTooltipComponent } from './unit-tooltip.component';
import { SynthesizedUnit } from '../../services/unit-conversion.service';

@Component({
  template: `
    <app-unit-tooltip [unit]="unit()" />
    <app-unit-tooltip [unit]="unit()" />
  `,
  imports: [UnitTooltipComponent],
})
class TestHostComponent {
  unit = signal<SynthesizedUnit | null>({
    primary: {
      value: 42,
      prefix: '',
      prefixShort: '',
      unit: 'standard images',
      formatted: '42 standard images',
      formattedShort: '42 standard images',
    },
    technical: {
      value: 42,
      prefix: 'mega',
      prefixShort: 'M',
      unit: 'pixelsteps',
      formatted: '42 megapixelsteps',
      formattedShort: '42M pixelsteps',
    },
    rawValue: 42,
    explanationKeys: ['help.models.tooltip.line1'],
  });
}

describe('UnitTooltipComponent — Deterministic IDs', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TestHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
  });

  it('should generate unique IDs for each tooltip instance', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const tooltipElements =
      fixture.nativeElement.querySelectorAll('[role="tooltip"]');

    expect(tooltipElements.length).toBe(2);

    const id1 = tooltipElements[0].id;
    const id2 = tooltipElements[1].id;

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('should generate IDs matching the deterministic pattern', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const tooltipElements =
      fixture.nativeElement.querySelectorAll('[role="tooltip"]');

    for (const el of tooltipElements) {
      expect(el.id).toMatch(/^tooltip-\d+$/);
    }
  });

  it('should link aria-describedby to tooltip ID', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const triggers =
      fixture.nativeElement.querySelectorAll('[aria-describedby]');
    const tooltips = fixture.nativeElement.querySelectorAll('[role="tooltip"]');

    expect(triggers.length).toBe(2);

    for (let i = 0; i < triggers.length; i++) {
      expect(triggers[i].getAttribute('aria-describedby')).toBe(tooltips[i].id);
    }
  });
});
