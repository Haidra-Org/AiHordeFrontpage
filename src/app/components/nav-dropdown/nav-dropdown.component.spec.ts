import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NavDropdownComponent } from './nav-dropdown.component';

@Component({
  imports: [NavDropdownComponent],
  template: `
    <app-nav-dropdown dropdownId="generate">
      <span trigger>Generate</span>
      <ng-container panel>
        <a href="#one" class="nav-dropdown-item" role="menuitem">One</a>
        <a href="#two" class="nav-dropdown-item" role="menuitem">Two</a>
        <a href="#three" class="nav-dropdown-item" role="menuitem">Three</a>
      </ng-container>
    </app-nav-dropdown>
  `,
})
class HostComponent {}

describe('NavDropdownComponent keyboard', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const trigger = (): HTMLButtonElement =>
    el().querySelector<HTMLButtonElement>('.nav-dropdown-trigger')!;

  /* Scoped to the panel: the trigger is a menuitem of the bar's menubar and
     answers to it, not to the panel's own arrow keys. */
  const items = (): HTMLAnchorElement[] =>
    Array.from(
      el().querySelectorAll<HTMLAnchorElement>(
        '.nav-dropdown-menu [role="menuitem"]',
      ),
    );

  const press = (target: Element, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  const openWithKeyboard = (key: 'ArrowDown' | 'ArrowUp'): void => {
    press(trigger(), key);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('opens on ArrowDown from the trigger with the first entry focused', () => {
    openWithKeyboard('ArrowDown');

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('opens on ArrowUp from the trigger with the last entry focused', () => {
    openWithKeyboard('ArrowUp');

    expect(document.activeElement).toBe(items()[2]);
  });

  it('names the panel it controls', () => {
    openWithKeyboard('ArrowDown');

    const menu = el().querySelector('.nav-dropdown-menu');
    expect(trigger().getAttribute('aria-controls')).toBe(menu?.id);
    expect(menu?.id).toBeTruthy();
  });

  it('takes the entries out of the tab order so the panel is left with Tab', () => {
    openWithKeyboard('ArrowDown');

    expect(items().map((item) => item.tabIndex)).toEqual([-1, -1, -1]);

    press(items()[0], 'Tab');

    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('rolls the arrows around both ends of the panel', () => {
    openWithKeyboard('ArrowDown');

    press(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);

    press(items()[1], 'ArrowUp');
    expect(document.activeElement).toBe(items()[0]);

    press(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);

    press(items()[2], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('jumps to either end with Home and End', () => {
    openWithKeyboard('ArrowDown');

    press(items()[0], 'End');
    expect(document.activeElement).toBe(items()[2]);

    press(items()[2], 'Home');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('takes the arrows rather than letting them scroll the page', () => {
    openWithKeyboard('ArrowDown');

    expect(press(items()[0], 'ArrowDown').defaultPrevented).toBe(true);
    expect(press(items()[1], 'End').defaultPrevented).toBe(true);
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    openWithKeyboard('ArrowDown');

    press(items()[0], 'Escape');

    expect(el().querySelector('.nav-dropdown-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
