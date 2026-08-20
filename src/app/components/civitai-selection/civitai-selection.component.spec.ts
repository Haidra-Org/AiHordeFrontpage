import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CivitaiSelectionComponent } from './civitai-selection.component';
import { CivitaiResolverService } from '../../services/civitai-resolver.service';
import type { LoraSelection, TiSelection } from '../../types/civitai-asset';

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
      expect(component.isLora({ name: '1', strength: 1 } as TiSelection)).toBe(
        false,
      );
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
      const appended: string[] = [];
      component.appendToPrompt.subscribe((text) => appended.push(text));

      component.onAppendTrigger('detailed');

      // The studio's prompt is plain text and a style's is a template, so the
      // list never writes to either itself.
      expect(appended).toEqual(['detailed']);
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
