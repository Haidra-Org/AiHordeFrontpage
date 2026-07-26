import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TutorialAnchorService } from './tutorial-anchor.service';
import { TutorialAnchorDirective } from '../directives/tutorial-anchor.directive';

@Component({
  imports: [TutorialAnchorDirective],
  template: `
    <div appTutAnchor="prompt" id="prompt-row"></div>
    @if (advanced()) {
      <div appTutAnchor="steps" id="steps-row"></div>
    }
  `,
})
class HostComponent {
  public readonly advanced = signal(false);
}

describe('TutorialAnchorService', () => {
  let anchors: TutorialAnchorService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    anchors = TestBed.inject(TutorialAnchorService);
  });

  it('registers nothing until an anchored field exists', () => {
    expect(anchors.has('prompt')).toBe(false);
    expect(anchors.element('prompt')).toBeNull();
  });

  it('registers an anchor under the id its directive names', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(anchors.has('prompt')).toBe(true);
    expect(anchors.element('prompt')?.id).toBe('prompt-row');
  });

  it('registers a field that only appears once its section is revealed', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(anchors.has('steps')).toBe(false);

    fixture.componentInstance.advanced.set(true);
    fixture.detectChanges();

    expect(anchors.element('steps')?.id).toBe('steps-row');
  });

  it('deregisters a field when its section goes away again', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.advanced.set(true);
    fixture.detectChanges();

    fixture.componentInstance.advanced.set(false);
    fixture.detectChanges();

    expect(anchors.has('steps')).toBe(false);
    expect(anchors.has('prompt')).toBe(true);
  });

  it('deregisters everything the destroyed page had registered', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    fixture.destroy();

    expect(anchors.has('prompt')).toBe(false);
  });

  it('ignores a stale deregistration for an id that has been re-registered', () => {
    const live = document.createElement('div');
    const stale = document.createElement('div');
    anchors.register('prompt', stale);
    anchors.register('prompt', live);

    anchors.deregister('prompt', stale);

    expect(anchors.element('prompt')).toBe(live);
  });
});
