import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import { PromptApplyConfirmComponent } from './prompt-apply-confirm.component';

describe('PromptApplyConfirmComponent', () => {
  let fixture: ComponentFixture<PromptApplyConfirmComponent>;
  let component: PromptApplyConfirmComponent;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PromptApplyConfirmComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PromptApplyConfirmComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('current', 'a fox in the snow');
    fixture.componentRef.setInput('incoming', 'a lighthouse at dusk');
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('shows what is in the box above what would replace it', () => {
    const texts = [...host.querySelectorAll('.gs-prompt-apply-text')].map(
      (node) => node.textContent?.trim(),
    );
    expect(texts).toEqual(['a fox in the snow', 'a lighthouse at dusk']);
    const labels = [...host.querySelectorAll('.gs-prompt-apply-label')].map(
      (node) => node.textContent?.trim(),
    );
    expect(labels).toEqual(['In the box now', 'Replace with']);
  });

  it('hands the choice and the preference to the page', () => {
    const confirmed: boolean[] = [];
    component.confirmed.subscribe((event) =>
      confirmed.push(event.dontAskAgain),
    );

    host.querySelector<HTMLButtonElement>('[role="checkbox"]')?.click();
    host.querySelector<HTMLButtonElement>('.gs-modal-done')?.click();

    expect(confirmed).toEqual([true]);
  });

  it('cancels once on Escape', () => {
    let cancelled = 0;
    component.cancelled.subscribe(() => (cancelled += 1));

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });
    host.querySelector('.gs-modal-overlay')?.dispatchEvent(escape);

    expect(cancelled).toBe(1);
  });

  it('keeps Tab inside the dialog', () => {
    const buttons = [
      ...host.querySelectorAll<HTMLButtonElement>('.gs-modal-panel button'),
    ];
    const last = buttons.at(-1);
    last?.focus();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }),
    );

    expect(document.activeElement).toBe(buttons[0]);
  });
});
