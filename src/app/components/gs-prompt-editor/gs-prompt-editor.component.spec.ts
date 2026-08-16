import { Component, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsPromptEditorComponent } from './gs-prompt-editor.component';
import en from '../../../assets/i18n/en.json';

@Component({
  imports: [GsPromptEditorComponent],
  template: `
    <button #trigger type="button" (click)="open.set(true)">open</button>
    @if (open()) {
      <app-gs-prompt-editor
        heading="Prompt"
        [control]="control"
        (closed)="onClosed()"
      />
    }
  `,
})
class HostComponent {
  public readonly control = new FormControl('a cat', { nonNullable: true });
  public readonly open = signal(false);
  public closedCount = 0;

  public onClosed(): void {
    this.closedCount++;
    this.open.set(false);
  }
}

describe('GsPromptEditorComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const trigger = (): HTMLButtonElement =>
    el().querySelector('button') as HTMLButtonElement;
  const area = (): HTMLTextAreaElement =>
    el().querySelector('.gs-prompt-editor-area') as HTMLTextAreaElement;
  const dialog = (): HTMLElement =>
    el().querySelector('.gs-prompt-editor') as HTMLElement;

  /** Open the editor the way a reader does, from the button beside the field. */
  const openEditor = (): void => {
    trigger().focus();
    trigger().click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    // The trigger has to be in the document for focus to move to it.
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
  });

  it('opens holding the control it was given', () => {
    openEditor();

    expect(area().value).toBe('a cat');
    expect(dialog().getAttribute('aria-modal')).toBe('true');
  });

  it('writes what the reader types into the same control', () => {
    openEditor();

    area().value = 'a cat in a hat';
    area().dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.control.value).toBe('a cat in a hat');
  });

  it('closes on Done and hands focus back to what opened it', () => {
    openEditor();

    (el().querySelector('.gs-prompt-editor-done') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.closedCount).toBe(1);
    expect(el().querySelector('.gs-prompt-editor')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Escape and hands focus back', () => {
    openEditor();

    dialog().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(host.closedCount).toBe(1);
    expect(el().querySelector('.gs-prompt-editor')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
