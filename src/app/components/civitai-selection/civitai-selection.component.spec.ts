import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CivitaiSelectionComponent } from './civitai-selection.component';
import { PromptReviewService } from '../../services/prompt-review.service';
import { CivitaiResolverService } from '../../services/civitai-resolver.service';
import type { LoraSelection } from '../../types/civitai-asset';
import type { PromptInsertion } from '../../types/ti-prompt';

const lora = (
  name: string,
  extra: Partial<LoraSelection> = {},
): LoraSelection => ({ name, model: 1, clip: 1, ...extra });

describe('CivitaiSelectionComponent', () => {
  let fixture: ComponentFixture<CivitaiSelectionComponent>;
  let component: CivitaiSelectionComponent;
  let metaFor: ReturnType<typeof vi.fn>;
  let requestAll: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    metaFor = vi.fn().mockReturnValue(null);
    requestAll = vi.fn();
    await TestBed.configureTestingModule({
      imports: [
        CivitaiSelectionComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        PromptReviewService,
        {
          provide: CivitaiResolverService,
          useValue: { metaFor, requestAll, request: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CivitaiSelectionComponent);
    component = fixture.componentInstance;
  });

  function setLoras(loras: LoraSelection[]): void {
    fixture.componentRef.setInput('loras', loras);
    fixture.detectChanges();
  }

  describe('a Manual TI', () => {
    const range = (): HTMLInputElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector(
        'input[type="range"]',
      );

    it('sets the insert strength while its trigger is not written', () => {
      fixture.componentRef.setInput('tis', [{ name: '1', strength: 0.7 }]);
      fixture.componentRef.setInput('prompts', {
        prompt: 'a cat',
        negativePrompt: '',
      });
      fixture.detectChanges();
      expect(component.manualWeight('1')).toEqual({ state: 'missing' });
      const changes = vi.fn();
      const edits = vi.fn();
      component.tisChange.subscribe(changes);
      component.promptEdit.subscribe(edits);
      component.onTiSlide(0, component.tis()[0], 0.5);
      component.onTiRelease(0, component.tis()[0], 0.5);
      expect(changes).toHaveBeenCalledWith([{ name: '1', strength: 0.5 }]);
      expect(edits).not.toHaveBeenCalled();
      expect(range()).not.toBeNull();
    });

    it('rewrites the written weight once, on release', () => {
      fixture.componentRef.setInput('tis', [{ name: '1', strength: 1 }]);
      fixture.componentRef.setInput('prompts', {
        prompt: 'a cat',
        negativePrompt: 'blur, (embedding:1:0.8)',
      });
      fixture.detectChanges();
      expect(range()?.value).toBe('0.8');
      const edits = vi.fn();
      const changes = vi.fn();
      component.promptEdit.subscribe(edits);
      component.tisChange.subscribe(changes);
      const entry = component.tis()[0];
      component.onTiSlide(0, entry, 0.6);
      component.onTiSlide(0, entry, 0.45);
      expect(component.tiSliderValue(0, entry)).toBe(0.45);
      expect(edits).not.toHaveBeenCalled();
      component.onTiRelease(0, entry, 0.45);
      expect(edits.mock.calls).toEqual([
        [{ target: 'negprompt', text: 'blur, (embedding:1:0.45)' }],
      ]);
      expect(changes).toHaveBeenCalledWith([{ name: '1', strength: 0.45 }]);
    });

    it('hides the slider when the trigger is written more than once', () => {
      fixture.componentRef.setInput('tis', [{ name: '1', strength: 1 }]);
      fixture.componentRef.setInput('prompts', {
        prompt: 'embedding:1 cat, (embedding:1:0.8)',
        negativePrompt: '',
      });
      fixture.detectChanges();
      expect(component.manualWeight('1')).toEqual({ state: 'multiple' });
      expect(range()).toBeNull();
    });

    it('warns and hides the slider when the trigger is in both prompts', () => {
      fixture.componentRef.setInput('tis', [{ name: '1', strength: 1 }]);
      fixture.componentRef.setInput('prompts', {
        prompt: 'embedding:1 cat',
        negativePrompt: '(embedding:1:0.8)',
      });
      fixture.detectChanges();
      expect(component.manualWeight('1')).toEqual({ state: 'both' });
      expect(range()).toBeNull();
      const status = (fixture.nativeElement as HTMLElement).querySelector(
        '.gs-cvsel-manual',
      );
      expect(status?.classList.contains('gs-sublabel--warn')).toBe(true);
      expect(status?.textContent).toContain('generate.civitai.ti_manual_both');
    });
  });

  it('shows strength for automatic placement and emits explicit row placement changes', () => {
    fixture.componentRef.setInput('tis', [
      { name: '1', strength: 0.7, inject_ti: 'prompt' },
    ]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('input[type="range"]')).not.toBeNull();
    fixture.componentRef.setInput('tis', [{ name: '1', strength: 0.7 }]);
    const changes = vi.fn();
    component.tisChange.subscribe(changes);
    component.setPlacement(0, 'negprompt');
    expect(changes).toHaveBeenCalledWith([
      { name: '1', strength: 0.7, inject_ti: 'negprompt' },
    ]);
  });

  describe('naming a row', () => {
    it('prefers the name chosen alongside the selection', () => {
      expect(
        component.rowName(lora('246091', { label: 'Detail Tweaker' })),
      ).toBe('Detail Tweaker');
    });

    it('falls back to whatever the catalogue could supply', () => {
      metaFor.mockReturnValue({ label: 'Resolved Name' });
      expect(component.rowName(lora('246091'))).toBe('Resolved Name');
    });

    it('shows a horde asset name as it stands', () => {
      expect(component.rowName(lora('epi_noiseoffset'))).toBe(
        'epi_noiseoffset',
      );
    });

    it('declines to name an identifier nothing is known about', () => {
      // Null asks the template to word it; a bare number reads as a quantity.
      expect(component.rowName(lora('246091'))).toBeNull();
    });

    it('asks the catalogue only about rows that arrived unnamed', () => {
      setLoras([lora('1', { label: 'Known' }), lora('246091')]);

      expect(requestAll).toHaveBeenCalledWith([
        { id: '246091', isVersion: false },
      ]);
    });

    it('tells a LoRA row apart from an embedding row', () => {
      expect(component.isLora(lora('1'))).toBe(true);
      expect(component.isLora({ name: '1', strength: 1 })).toBe(false);
    });
  });

  describe('the horde cap', () => {
    const seven = (): LoraSelection[] =>
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => lora(n));

    it('marks the rows past the cap as not being sent', () => {
      setLoras(seven());

      expect(component.loraRows().map((row) => row.active)).toEqual([
        true,
        true,
        true,
        true,
        true,
        false,
        false,
      ]);
      expect(component.sentLoraCount()).toBe(5);
      expect(component.lorasOverCap()).toBe(true);
    });

    it('leaves every control on an inactive row usable', () => {
      setLoras(seven());
      const rows = fixture.nativeElement.querySelectorAll('.gs-addon');
      const lastRow = rows[rows.length - 1] as HTMLElement;

      // Disabling these would take them out of the tab order, and moving such a
      // row up is the only reason a reader visits it.
      const moveUp = lastRow.querySelector<HTMLButtonElement>(
        '[data-move="lora-6--1"]',
      );
      expect(moveUp?.disabled).toBe(false);
      expect(lastRow.classList).toContain('gs-cvsel-row--inactive');
    });

    it('draws the boundary once, between the last sent row and the first not', () => {
      setLoras(seven());
      const cutlines =
        fixture.nativeElement.querySelectorAll('.gs-cvsel-cutline');

      expect(cutlines).toHaveLength(1);
    });

    it('caps embeddings by their own, larger bound', () => {
      const many = Array.from({ length: 22 }, (_, i) => ({
        name: `ti-${i}`,
        strength: 1,
      }));
      fixture.componentRef.setInput('tis', many);
      fixture.detectChanges();

      // Keyed off the embedding bound, not the LoRA one.
      expect(component.sentTiCount()).toBe(20);
      expect(component.tiRows().filter((row) => !row.active)).toHaveLength(2);
    });

    it('says nothing about a cap the host does not enforce', () => {
      fixture.componentRef.setInput('showCap', false);
      setLoras(seven());

      expect(component.loraRows().every((row) => row.active)).toBe(true);
      expect(
        fixture.nativeElement.querySelectorAll('.gs-cvsel-cutline'),
      ).toHaveLength(0);
    });
  });

  describe('reordering', () => {
    it('swaps a row with its neighbour and emits the new order', () => {
      setLoras([lora('a'), lora('b'), lora('c')]);
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.move('lora', 2, -1);

      expect(emitted[0].map((entry) => entry.name)).toEqual(['a', 'c', 'b']);
    });

    it('refuses to move past either end', () => {
      setLoras([lora('a'), lora('b')]);

      expect(component.canMove('lora', 0, -1)).toBe(false);
      expect(component.canMove('lora', 1, 1)).toBe(false);
      expect(component.canMove('lora', 0, 1)).toBe(true);
    });

    it('promotes a row past the cap into the set that is sent', () => {
      const loras = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => lora(n));
      setLoras(loras);
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.move('lora', 5, -1);
      setLoras(emitted[0]);

      // The sixth was not being sent; after one move it is, and 'e' is not.
      expect(component.loraRows()[4].entry.name).toBe('f');
      expect(component.loraRows()[4].active).toBe(true);
      expect(component.loraRows()[5].active).toBe(false);
    });

    it('announces the move and what it changed about the request', () => {
      setLoras(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => lora(n)));

      component.move('lora', 5, -1);

      // A sighted reader watches the row cross the line; nobody else does.
      expect(component.announcementParts()).toMatchObject({
        name: 'f',
        position: 5,
        total: 6,
        sent: 5,
      });
    });
  });

  describe('editing a row', () => {
    it('opens a restored model ID through the model endpoint', () => {
      const current = lora('123');
      setLoras([current]);
      component.onDetails(current, 0);
      expect(component.openRow()?.target).toEqual({
        kind: 'lora',
        modelId: 123,
        versionId: null,
      });
    });

    it('opens a restored version ID without treating it as a model ID', () => {
      const current = lora('123', { is_version: true });
      setLoras([current]);
      component.onDetails(current, 0);
      expect(component.openRow()?.target).toEqual({
        kind: 'lora',
        modelId: null,
        versionId: 123,
      });
    });

    it('changes one strength and leaves the rest alone', () => {
      setLoras([lora('a'), lora('b')]);
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.setLoraStrength(1, 'clip', 0.4);

      expect(emitted[0][1]).toMatchObject({ name: 'b', clip: 0.4, model: 1 });
      expect(emitted[0][0]).toMatchObject({ name: 'a', clip: 1 });
    });

    it('removes the row that was asked for', () => {
      setLoras([lora('a'), lora('b'), lora('c')]);
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.remove('lora', 1);

      expect(emitted[0].map((entry) => entry.name)).toEqual(['a', 'c']);
    });

    it('hands a trigger word to whoever owns the prompt', () => {
      const appended: PromptInsertion[] = [];
      component.appendToPrompt.subscribe((text) => appended.push(text));

      component.onAppendTrigger('detailed');

      // The studio's prompt is plain text and a style's is a template, so the
      // list never writes to either itself.
      expect(appended).toEqual(['detailed']);
    });

    describe('trigger chips with the prompts in view', () => {
      const prompts = (prompt: string): void => {
        fixture.componentRef.setInput('prompts', {
          prompt,
          negativePrompt: '',
        });
      };

      it('adds a missing trigger and turns off the automatic trigger', () => {
        setLoras([lora('a', { inject_trigger: 'any' })]);
        prompts('a cat');
        const edits = vi.fn();
        const changes = vi.fn();
        component.promptEdit.subscribe(edits);
        component.lorasChange.subscribe(changes);
        component.onTrigger(0, 'detailed');
        expect(edits).toHaveBeenCalledWith({
          target: 'prompt',
          text: 'a cat, detailed',
        });
        expect(changes.mock.calls[0][0][0]).not.toHaveProperty(
          'inject_trigger',
        );
        expect(component.triggerAnnouncement()).toEqual({
          action: 'added',
          word: 'detailed',
        });
      });

      it('removes its own entry without asking', () => {
        setLoras([lora('a')]);
        const edits = vi.fn();
        component.promptEdit.subscribe(edits);
        prompts('a cat');
        component.onTrigger(0, 'detailed');
        prompts('a cat, detailed');
        component.onTrigger(0, 'detailed');
        expect(edits.mock.calls[1][0]).toEqual({
          target: 'prompt',
          text: 'a cat',
        });
        expect(component.pendingRemoval()).toBeNull();
      });

      it('asks before removing a word the user wrote, or edited after adding', () => {
        setLoras([lora('a')]);
        const edits = vi.fn();
        component.promptEdit.subscribe(edits);
        prompts('a detailed cat');
        component.onTrigger(0, 'detailed');
        expect(edits).not.toHaveBeenCalled();
        expect(component.pendingRemoval()).toEqual({
          index: 0,
          word: 'detailed',
        });
        component.closeRemoval();
        expect(component.pendingRemoval()).toBeNull();

        prompts('a cat');
        component.onTrigger(0, 'detailed');
        prompts('a cat, (detailed:1.2)');
        component.onTrigger(0, 'detailed');
        expect(edits).toHaveBeenCalledTimes(1);
        expect(component.pendingRemoval()).not.toBeNull();
      });

      it('removes every written use on confirmation', () => {
        setLoras([lora('a')]);
        const edits = vi.fn();
        component.promptEdit.subscribe(edits);
        prompts('a detailed cat, (detailed:1.2)');
        component.onTrigger(0, 'detailed');
        component.confirmRemoval();
        expect(edits).toHaveBeenCalledWith({ target: 'prompt', text: 'a cat' });
        expect(component.pendingRemoval()).toBeNull();
      });

      it('asks the host to show the first written use', () => {
        setLoras([lora('a')]);
        const reveals = vi.fn();
        TestBed.inject(PromptReviewService).connect(reveals);
        prompts('a Detailed cat');
        component.onTrigger(0, 'detailed');
        component.showInPrompt();
        expect(reveals).toHaveBeenCalledWith({
          target: 'prompt',
          start: 2,
          end: 10,
        });
        expect(component.pendingRemoval()).not.toBeNull();
      });

      it('steps through every match and offers to remove all of them', () => {
        setLoras([lora('a', { triggerWords: ['detailed'] })]);
        const reveals = vi.fn();
        TestBed.inject(PromptReviewService).connect(reveals);
        prompts('detailed, a detailed background');
        fixture.detectChanges();
        const host = fixture.nativeElement as HTMLElement;
        expect(
          host.querySelector('.gs-cvsel-trigger-count')?.textContent,
        ).toContain('2');
        component.onTrigger(0, 'detailed');
        fixture.detectChanges();
        expect(host.querySelector('.gs-cvsel-confirm')?.textContent).toContain(
          'generate.civitai.trigger_confirm_many',
        );
        component.showInPrompt();
        component.showInPrompt();
        component.showInPrompt();
        expect(reveals.mock.calls.map(([range]) => range.start)).toEqual([
          0, 12, 0,
        ]);
      });

      it('removes its own entry and reports the uses that remain', () => {
        setLoras([lora('a')]);
        const edits = vi.fn();
        component.promptEdit.subscribe(edits);
        prompts('a detailed cat');
        component.closeRemoval();
        component.onTrigger(0, 'detailed');
        expect(component.pendingRemoval()).not.toBeNull();
        component.closeRemoval();

        setLoras([lora('b')]);
        prompts('a cat');
        component.onTrigger(0, 'sharp');
        prompts('a sharp knife, sharp');
        component.onTrigger(0, 'sharp');
        expect(edits).toHaveBeenLastCalledWith({
          target: 'prompt',
          text: 'a sharp knife',
        });
        expect(component.triggerAnnouncement()).toEqual({
          action: 'removed_left_one',
          word: 'sharp',
          count: 1,
        });
      });

      it('shows the warning under the row with focus on Cancel', async () => {
        setLoras([lora('a', { triggerWords: ['detailed'] })]);
        prompts('a detailed cat');
        fixture.detectChanges();
        component.onTrigger(0, 'detailed');
        fixture.detectChanges();
        await fixture.whenStable();
        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.gs-cvsel-confirm')).not.toBeNull();
        expect(
          document.activeElement?.hasAttribute('data-confirm-cancel'),
        ).toBe(true);
      });

      it('marks the chip pressed while its word is in the prompt', () => {
        setLoras([lora('a', { triggerWords: ['detailed', 'sharp'] })]);
        prompts('(detailed:1.2) cat');
        fixture.detectChanges();
        const chips = [
          ...(fixture.nativeElement as HTMLElement).querySelectorAll(
            '.gs-cvsel-trigger',
          ),
        ].map((chip) => chip.getAttribute('aria-pressed'));
        expect(chips).toEqual(['true', 'false']);
      });
    });

    it('opens the details on the row that was asked about', () => {
      setLoras([lora('a'), lora('123', { modelId: 9, is_version: true })]);

      component.onDetails(component.loraRows()[1].entry, 1);

      expect(component.openRow()).toMatchObject({
        kind: 'lora',
        index: 1,
        target: { kind: 'lora', modelId: 9, versionId: 123 },
      });
      expect(component.openEntry()?.name).toBe('123');
    });

    it('opens a hand-added row with no catalogue page behind it', () => {
      setLoras([lora('epi_noiseoffset', { origin: 'manual' })]);

      component.onDetails(component.loraRows()[0].entry, 0);

      // The panel answers a null model with its reduced form, so no row is
      // unopenable.
      expect(component.openRow()?.target).toMatchObject({
        modelId: null,
        versionId: null,
      });
    });

    it('puts an edited row back in place even when re-pinning renamed it', () => {
      setLoras([lora('a'), lora('11', { is_version: true, modelId: 9 })]);
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.onDetails(component.loraRows()[1].entry, 1);
      component.onDetailApply({
        name: '12',
        model: 1,
        clip: 1,
        is_version: true,
        modelId: 9,
      });

      // Matching by name would append a second row rather than replace one.
      expect(emitted[0].map((entry) => entry.name)).toEqual(['a', '12']);
      expect(component.openRow()).toBeNull();
    });

    it('removes the row the panel was opened on', () => {
      setLoras([lora('a'), lora('b')]);
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.onDetails(component.loraRows()[0].entry, 0);
      component.onDetailRemove();

      expect(emitted[0].map((entry) => entry.name)).toEqual(['b']);
    });
  });
});
