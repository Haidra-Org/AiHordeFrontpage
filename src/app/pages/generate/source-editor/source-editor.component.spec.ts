import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SourceEditorComponent } from './source-editor.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  createGenerateForm,
} from '../generate-form.model';
import { APP_ICONS } from '../../../icons';
import en from '../../../../assets/i18n/en.json';

const POINTER_PREFS_KEY = 'aihorde.generate.source_editor.pointer_prefs';

/**
 * The editor with no stage behind it: the template is dropped, so Konva is
 * never fetched and the undo stack can be driven directly. Enough to state what
 * closing does about staged work, which is where the stack is read.
 */
async function createEditor(): Promise<SourceEditorComponent> {
  await TestBed.configureTestingModule({
    imports: [SourceEditorComponent],
    providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
  })
    .overrideComponent(SourceEditorComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(SourceEditorComponent);
  fixture.componentRef.setInput('doc', {
    image: null,
    mask: null,
    width: 512,
    height: 512,
    offset: null,
  });
  fixture.componentRef.setInput(
    'form',
    createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE }),
  );
  fixture.detectChanges();
  return fixture.componentInstance;
}

/** A step that moves a node, which is the one kind that needs no live stage. */
const placeStep = (): unknown => ({
  kind: 'place',
  node: { setAttrs: vi.fn() },
  before: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  after: { x: 10, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
});

/** Reach the private history the component keeps, as the stage would fill it. */
function pushStep(editor: SourceEditorComponent): void {
  (editor as unknown as { push(op: unknown): void }).push(placeStep());
}

describe('what closing the editor asks about', () => {
  it('closes without asking while nothing has been drawn', async () => {
    const editor = await createEditor();
    const closed = vi.fn();
    editor.closed.subscribe(closed);

    editor.onClose();

    expect(editor.dirty()).toBe(false);
    expect(editor.confirmingClose()).toBe(false);
    expect(closed).toHaveBeenCalled();
  });

  it('asks about work that has not been applied', async () => {
    const editor = await createEditor();
    const closed = vi.fn();
    editor.closed.subscribe(closed);

    pushStep(editor);
    editor.onClose();

    expect(editor.dirty()).toBe(true);
    expect(editor.confirmingClose()).toBe(true);
    expect(closed).not.toHaveBeenCalled();
  });

  it('closes without asking once the work has been taken back', async () => {
    const editor = await createEditor();
    const closed = vi.fn();
    editor.closed.subscribe(closed);

    pushStep(editor);
    pushStep(editor);
    editor.undo();
    editor.undo();
    editor.onClose();

    expect(editor.dirty()).toBe(false);
    expect(closed).toHaveBeenCalled();
  });

  it('asks again once a step is put back', async () => {
    const editor = await createEditor();

    pushStep(editor);
    editor.undo();
    expect(editor.dirty()).toBe(false);

    editor.redo();
    expect(editor.dirty()).toBe(true);
  });

  it('asks about a ground colour, which no step can take back', async () => {
    const editor = await createEditor();

    editor.setBackground('#101010');

    expect(editor.dirty()).toBe(true);
  });
});

/**
 * The rail draws marks rather than names, so a tool with no mark is a blank
 * square and a tool with no wording is a button nothing can announce. Both
 * failures are silent on the screen, so they are stated here instead.
 */
describe('the tools on the rail', () => {
  it('gives every tool a mark the registry knows and a name to be called by', async () => {
    const editor = await createEditor();
    const translations = en as Record<string, string>;

    for (const tool of editor.tools) {
      expect(
        APP_ICONS[editor.toolIcon(tool)],
        `no mark for ${tool}`,
      ).toBeTruthy();
      expect(
        translations[`generate.editor.tool_${tool}`],
        `no name for ${tool}`,
      ).toBeTruthy();
    }
    expect(APP_ICONS['arrow-undo']).toBeTruthy();
    expect(APP_ICONS['arrow-redo']).toBeTruthy();
  });

  it('switches the header mode message with the selected ink', async () => {
    const editor = await createEditor();

    expect(editor.inkModeLabel()).toBe('generate.editor.ink_mode_mask');
    expect(editor.inkModeIcon()).toBe('warning-triangle-filled');
    editor.setInk('color');
    expect(editor.inkModeLabel()).toBe('generate.editor.ink_mode_colour');
    expect(editor.inkModeIcon()).toBe('paintbrush');
  });

  it('keeps layer visibility toggles as explicit independent state', async () => {
    const editor = await createEditor();

    expect(editor.showImageLayer()).toBe(true);
    expect(editor.showMaskLayer()).toBe(true);

    editor.toggleImageVisibility();
    editor.toggleMaskVisibility();

    expect(editor.showImageLayer()).toBe(false);
    expect(editor.showMaskLayer()).toBe(false);
  });

  it('offers pointer offset controls with clamped slider values', async () => {
    localStorage.removeItem(POINTER_PREFS_KEY);
    const editor = await createEditor();

    expect(editor.pointerOffsetOn()).toBe(false);
    expect(editor.pointerOffsetMenuOpen()).toBe(false);
    expect(editor.pointerOffsetDirection()).toBe('up-right');

    editor.togglePointerOffset();
    expect(editor.pointerOffsetOn()).toBe(true);
    expect(editor.pointerOffsetMenuOpen()).toBe(false);

    editor.togglePointerOffsetMenu();
    expect(editor.pointerOffsetMenuOpen()).toBe(true);

    editor.setPointerOffsetDirection('down-left');
    expect(editor.pointerOffsetDirection()).toBe('down-left');

    editor.setPointerOffsetDirection('invalid-direction');
    expect(editor.pointerOffsetDirection()).toBe('down-left');

    editor.setPointerOffsetX('9999');
    editor.setPointerOffsetY('-9999');
    expect(editor.pointerOffsetX()).toBe(editor.maxPointerOffset);
    expect(editor.pointerOffsetY()).toBe(editor.minPointerOffset);

    editor.togglePointerOffset();
    expect(editor.pointerOffsetOn()).toBe(false);
    expect(editor.pointerOffsetMenuOpen()).toBe(false);
  });

  it('closes offset settings when clicking outside the popup', async () => {
    localStorage.removeItem(POINTER_PREFS_KEY);
    const editor = await createEditor();

    editor.togglePointerOffsetMenu();
    expect(editor.pointerOffsetMenuOpen()).toBe(true);

    const clickOn = (target: Element): MouseEvent => {
      const event = new MouseEvent('click');
      Object.defineProperty(event, 'target', {
        value: target,
        configurable: true,
      });
      return event;
    };

    const trigger = document.createElement('button');
    trigger.setAttribute('aria-controls', 'gs-se-offset-menu');
    editor.onPanelClick(clickOn(trigger));
    expect(editor.pointerOffsetMenuOpen()).toBe(true);

    const menu = document.createElement('div');
    menu.id = 'gs-se-offset-menu';
    const inside = document.createElement('span');
    menu.append(inside);
    editor.onPanelClick(clickOn(inside));
    expect(editor.pointerOffsetMenuOpen()).toBe(true);

    const outside = document.createElement('div');
    editor.onPanelClick(clickOn(outside));
    expect(editor.pointerOffsetMenuOpen()).toBe(false);
  });

  it('hydrates pointer offset controls from saved preferences', async () => {
    localStorage.removeItem(POINTER_PREFS_KEY);
    localStorage.setItem(
      POINTER_PREFS_KEY,
      JSON.stringify({
        enabled: true,
        direction: 'down-left',
        x: 64,
        y: 28,
      }),
    );

    const editor = await createEditor();

    expect(editor.pointerOffsetOn()).toBe(true);
    expect(editor.pointerOffsetDirection()).toBe('down-left');
    expect(editor.pointerOffsetX()).toBe(64);
    expect(editor.pointerOffsetY()).toBe(28);
  });

  it('persists pointer offset preference changes to storage', async () => {
    localStorage.removeItem(POINTER_PREFS_KEY);
    const editor = await createEditor();

    editor.togglePointerOffset();
    editor.setPointerOffsetDirection('left');
    editor.setPointerOffsetX('42');
    editor.setPointerOffsetY('19');

    const stored = JSON.parse(
      localStorage.getItem(POINTER_PREFS_KEY) ?? '{}',
    ) as {
      enabled: boolean;
      direction: string;
      x: number;
      y: number;
    };
    expect(stored.enabled).toBe(true);
    expect(stored.direction).toBe('left');
    expect(stored.x).toBe(42);
    expect(stored.y).toBe(19);
  });
});
