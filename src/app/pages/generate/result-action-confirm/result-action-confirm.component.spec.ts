import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import { ResultActionConfirmComponent } from './result-action-confirm.component';

describe('ResultActionConfirmComponent', () => {
  let fixture: ComponentFixture<ResultActionConfirmComponent>;
  let component: ResultActionConfirmComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ResultActionConfirmComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ResultActionConfirmComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('action', 'settings');
    fixture.detectChanges();
  });

  it('names the requested result action', () => {
    expect(component.key('title')).toBe(
      'generate.results.confirm_settings_title',
    );
    expect(component.key('confirm')).toBe(
      'generate.results.confirm_settings_confirm',
    );
  });

  it('hands the reversible preference choice to the page', () => {
    const confirmed: boolean[] = [];
    component.confirmed.subscribe((event) =>
      confirmed.push(event.dontAskAgain),
    );

    component.toggleDontAskAgain();
    component.confirm();

    expect(confirmed).toEqual([true]);
  });
});
