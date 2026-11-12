import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NumberStepperComponent } from './number-stepper.component';
import en from '../../../assets/i18n/en.json';

describe('NumberStepperComponent', () => {
  let fixture: ComponentFixture<NumberStepperComponent>;
  const buttons = (): NodeListOf<HTMLButtonElement> =>
    (fixture.nativeElement as HTMLElement).querySelectorAll('button');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        NumberStepperComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NumberStepperComponent);
    for (const [name, value] of Object.entries({
      value: 2.5,
      min: 0,
      max: 100,
      step: 0.5,
      label: 'CFG',
    })) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  });

  it('takes exact CFG steps without submitting its surrounding form', () => {
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    buttons()[1].click();
    expect(changed).toHaveBeenLastCalledWith(3);
    buttons()[0].click();
    expect(changed).toHaveBeenLastCalledWith(2);
    expect(buttons()[1].type).toBe('button');
    expect(buttons()[1].getAttribute('aria-label')).toBe('Increase CFG by 0.5');
  });

  it('steps negative and off-grid LoRA weights without floating point residue', () => {
    fixture.componentRef.setInput('value', -0.13);
    fixture.componentRef.setInput('min', -5);
    fixture.componentRef.setInput('max', 5);
    fixture.componentRef.setInput('step', 0.05);
    fixture.detectChanges();
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    buttons()[1].click();
    expect(changed).toHaveBeenCalledWith(-0.08);
  });

  it('clamps steps at the limits and disables unavailable actions', () => {
    fixture.componentRef.setInput('value', 99.9);
    fixture.detectChanges();
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    buttons()[1].click();
    expect(changed).toHaveBeenLastCalledWith(100);
    fixture.componentRef.setInput('value', 100);
    fixture.detectChanges();
    expect(buttons()[1].disabled).toBe(true);
    fixture.componentRef.setInput('value', 0);
    fixture.detectChanges();
    expect(buttons()[0].disabled).toBe(true);
  });

  it('steps the typed number before a pending parent render reaches the buttons', () => {
    fixture.componentRef.setInput('value', 0.65);
    fixture.componentRef.setInput('step', 0.05);
    fixture.detectChanges();
    const field = document.createElement('input');
    field.type = 'number';
    field.value = '0.123';
    (fixture.nativeElement as HTMLElement).appendChild(field);
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    buttons()[1].click();
    expect(changed).toHaveBeenCalledWith(0.173);
  });

  it('keeps locked settings unchanged', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    buttons()[1].click();
    fixture.componentInstance.nudge(-1);
    expect(changed).not.toHaveBeenCalled();
    expect([...buttons()].every((button) => button.disabled)).toBe(true);
  });

  it('enables a bound button when an uncommitted edit moves inside the range', () => {
    fixture.componentRef.setInput('value', 100);
    fixture.detectChanges();
    expect(buttons()[1].disabled).toBe(true);
    const field = document.createElement('input');
    field.type = 'number';
    field.value = '99';
    (fixture.nativeElement as HTMLElement).appendChild(field);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(buttons()[1].disabled).toBe(false);
  });
});
