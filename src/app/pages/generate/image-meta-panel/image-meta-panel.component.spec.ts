import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import {
  ImageMetaPanelComponent,
  MetaApplyEvent,
} from './image-meta-panel.component';
import { ImageGenerationRequest } from '../../../types/generation';
import { CivitaiResolverService } from '../../../services/civitai-resolver.service';
import { ImageMetaProvenance } from '../image-metadata';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormValue,
} from '../generate-form.model';

const REQUEST: ImageGenerationRequest = {
  prompt: 'a lighthouse ### blurry',
  models: ['AlbedoBase XL'],
  params: {
    sampler_name: 'k_euler_a',
    steps: 30,
    cfg_scale: 6.5,
    seed: '33812009',
    width: 1024,
    height: 1024,
    karras: true,
  },
};

const PROVENANCE: ImageMetaProvenance = {
  seed: '33812009',
  model: 'AlbedoBase XL',
  workerName: 'StableNode-07',
  workerId: 'worker-7',
  state: 'ok',
  censored: false,
  censorReason: null,
  aesthetic: 7.1,
  errors: [],
  styleName: 'Anime',
  kudos: null,
};

describe('ImageMetaPanelComponent', () => {
  let fixture: ComponentFixture<ImageMetaPanelComponent>;
  let component: ImageMetaPanelComponent;
  let applied: MetaApplyEvent[];
  let requestAll: ReturnType<typeof vi.fn>;
  let metaFor: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    applied = [];
    requestAll = vi.fn();
    metaFor = vi.fn().mockReturnValue(null);
    await TestBed.configureTestingModule({
      imports: [
        ImageMetaPanelComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: CivitaiResolverService,
          useValue: { requestAll, request: vi.fn(), metaFor },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageMetaPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('request', REQUEST);
    fixture.componentRef.setInput('provenance', PROVENANCE);
    fixture.componentRef.setInput('localId', 'job-1');
    component.apply.subscribe((event) => applied.push(event));
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('groups the request into prompt, sampling and size rows', () => {
    expect(component.groups().map((group) => group.id)).toEqual([
      'prompt',
      'sampling',
      'size',
    ]);
    const prompt = component.groups()[0];
    expect(prompt.rows.map((row) => row.id)).toEqual(['prompt', 'negative']);
    expect(prompt.rows[0].value).toBe('a lighthouse');
    expect(prompt.rows[1].value).toBe('blurry');
    const size = component.groups()[2];
    expect(size.rows[0].value).toBe('1024 × 1024');
    expect(size.rows[0].keys).toEqual(['width', 'height']);
  });

  it('omits rows the request does not carry', () => {
    const ids = component.groups()[1].rows.map((row) => row.id);

    expect(ids).not.toContain('loras');
    expect(ids).not.toContain('post');
    expect(ids).not.toContain('source');
  });

  it('carries the source-image setup as a single row when one was used', () => {
    fixture.componentRef.setInput('request', {
      ...REQUEST,
      source_processing: 'img2img',
      params: { ...REQUEST.params, denoising_strength: 0.6 },
    } satisfies ImageGenerationRequest);
    fixture.detectChanges();

    const source = component
      .groups()[1]
      .rows.find((row) => row.id === 'source');

    expect(source?.keys).toContain('sourceMode');
    expect(source?.keys).toContain('denoising_strength');
  });

  it('shows and carries a control strength set under the QR workflow', () => {
    fixture.componentRef.setInput('request', {
      ...REQUEST,
      params: {
        ...REQUEST.params,
        workflow: 'qr_code',
        control_strength: 1.35,
        extra_texts: [{ text: 'https://aihorde.net', reference: 'qr_code' }],
      },
    } satisfies ImageGenerationRequest);
    fixture.detectChanges();

    const rows = component.groups()[1].rows;
    const qr = rows.find((row) => row.id === 'qr');

    expect(qr?.keys).toContain('qrText');
    expect(qr?.keys).toContain('control_strength');
    expect(qr?.value).toContain('https://aihorde.net');
    // The payload alone is not the whole row: the strength rides beside it.
    expect(qr?.value).not.toBe('https://aihorde.net');
    expect(rows.find((row) => row.id === 'source')).toBeUndefined();
  });

  it('leaves a control-type strength on the source row', () => {
    fixture.componentRef.setInput('request', {
      ...REQUEST,
      source_processing: 'img2img',
      params: {
        ...REQUEST.params,
        control_type: 'canny',
        control_strength: 1.35,
      },
    } satisfies ImageGenerationRequest);
    fixture.detectChanges();

    const rows = component.groups()[1].rows;

    expect(rows.find((row) => row.id === 'source')?.keys).toContain(
      'control_strength',
    );
    expect(rows.find((row) => row.id === 'qr')).toBeUndefined();
  });

  it('renders provenance as read-only info rows', () => {
    const rows = component.infoRows();

    expect(rows.map((row) => row.value)).toContain('StableNode-07');
    expect(rows.map((row) => row.value)).toContain('Anime');
    expect(rows.find((row) => row.value === '7.10')?.tone).toBe('good');
    const html: string = fixture.nativeElement.innerHTML;
    expect(html).toContain('gs-meta-row--info');
  });

  it('omits the style row when the job recorded none', () => {
    fixture.componentRef.setInput('provenance', {
      ...PROVENANCE,
      styleName: null,
    } satisfies ImageMetaProvenance);
    fixture.detectChanges();

    expect(component.infoRows().map((row) => row.value)).not.toContain('Anime');
  });

  it('starts with every row checked', () => {
    const rows = component.groups().flatMap((group) => group.rows);

    expect(rows.every((row) => component.isChecked(row))).toBe(true);
    expect(component.selectedCount()).toBe(
      rows.reduce((total, row) => total + row.keys.length, 0),
    );
  });

  it('drops an unchecked row from the applied keys', () => {
    const steps = component.groups()[1].rows.find((row) => row.id === 'steps')!;

    component.toggleRow(steps);

    expect(component.isChecked(steps)).toBe(false);
    expect(component.selectedKeys()).not.toContain('steps');
  });

  it('reports a group as all, some or none selected', () => {
    const prompt = component.groups()[0];
    expect(component.groupState(prompt)).toBe('all');

    component.toggleRow(prompt.rows[0]);
    expect(component.groupState(prompt)).toBe('some');

    component.toggleRow(prompt.rows[1]);
    expect(component.groupState(prompt)).toBe('none');
  });

  it('clears a fully selected group and restores it on the next toggle', () => {
    const prompt = component.groups()[0];

    component.toggleGroup(prompt);
    expect(component.groupState(prompt)).toBe('none');
    expect(component.selectedKeys()).not.toContain('prompt');

    component.toggleGroup(prompt);
    expect(component.groupState(prompt)).toBe('all');
  });

  it('selects a partly selected group in full', () => {
    const sampling = component.groups()[1];
    component.toggleRow(sampling.rows[0]);

    component.toggleGroup(sampling);

    expect(component.groupState(sampling)).toBe('all');
  });

  it('emits the checked keys and the chosen mode', () => {
    const cfg = component.groups()[1].rows.find((row) => row.id === 'cfg')!;
    component.toggleRow(cfg);
    component.setMode('overlay');

    component.emitApply();

    expect(applied).toHaveLength(1);
    expect(applied[0].localId).toBe('job-1');
    expect(applied[0].mode).toBe('overlay');
    expect(applied[0].keys).toContain('prompt');
    expect(applied[0].keys).toContain('width');
    expect(applied[0].keys).not.toContain('cfg_scale');
  });

  it('does not emit when nothing is selected', () => {
    for (const group of component.groups()) {
      component.toggleGroup(group);
    }

    component.emitApply();

    expect(applied).toHaveLength(0);
  });

  describe('lora and embedding names', () => {
    const withAssets: ImageGenerationRequest = {
      ...REQUEST,
      params: {
        ...REQUEST.params,
        loras: [{ name: '246091', model: 1, clip: 0.8, is_version: true }],
        tis: [{ name: '7808', strength: 1, inject_ti: 'prompt' }],
      },
    };

    const rowValue = (id: string): string =>
      component.groups()[1].rows.find((row) => row.id === id)?.value ?? '';

    it('falls back to a labelled id when nothing resolves', () => {
      fixture.componentRef.setInput('request', withAssets);
      fixture.detectChanges();

      expect(rowValue('loras')).toContain('generate.results.meta_lora_id');
      expect(rowValue('loras')).not.toBe('246091');
      expect(rowValue('tis')).toContain('generate.results.meta_ti_id');
    });

    it('hands every identifier in the request to the resolver', () => {
      fixture.componentRef.setInput('request', withAssets);
      fixture.detectChanges();

      // A pinned LoRA is a version; a textual inversion never is, because the
      // horde's TI payload carries no version flag.
      expect(requestAll).toHaveBeenCalledWith([
        { id: '246091', isVersion: true },
        { id: '7808', isVersion: false },
      ]);
    });

    it('shows a resolved name with its weights', () => {
      metaFor.mockReturnValue({ label: 'Detail Tweaker' });
      fixture.componentRef.setInput('request', withAssets);
      fixture.detectChanges();

      expect(rowValue('loras')).toContain('Detail Tweaker');
      expect(rowValue('loras')).toContain('generate.results.meta_weight_model');
      expect(rowValue('loras')).toContain('generate.results.meta_weight_clip');
    });

    it('leaves an already-readable asset name alone', () => {
      // Nothing has to be resolved for a named asset: the resolver declines to
      // look one up, and the panel shows what the request already said.
      fixture.componentRef.setInput('request', {
        ...REQUEST,
        params: {
          ...REQUEST.params,
          loras: [{ name: 'GlowingRunes', model: 1, clip: 1 }],
        },
      } satisfies ImageGenerationRequest);
      fixture.detectChanges();

      expect(rowValue('loras')).toContain('GlowingRunes');
    });
  });

  describe('replace-mode delta markers', () => {
    const current: GenerateFormValue = {
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a lighthouse',
      negativePrompt: 'blurry',
      model: 'AlbedoBase XL',
      sampler_name: 'k_euler_a',
      steps: 30,
      cfg_scale: 6.5,
      seed: '33812009',
      scheduler: 'karras',
      width: 1024,
      height: 1024,
    };

    const row = (id: string) =>
      component
        .groups()
        .flatMap((group) => group.rows)
        .find((candidate) => candidate.id === id)!;

    it('marks nothing without a current form value', () => {
      expect(component.isDifferent(row('steps'))).toBe(false);
      expect(component.hasDifferences()).toBe(false);
    });

    it('marks only the rows that would change something', () => {
      fixture.componentRef.setInput('currentValue', {
        ...current,
        steps: 12,
      } satisfies GenerateFormValue);
      fixture.detectChanges();

      expect(component.isDifferent(row('steps'))).toBe(true);
      expect(component.isDifferent(row('prompt'))).toBe(false);
      expect(component.hasDifferences()).toBe(true);
    });

    it('treats a row of several fields as differing when any one does', () => {
      fixture.componentRef.setInput('currentValue', {
        ...current,
        height: 512,
      } satisfies GenerateFormValue);
      fixture.detectChanges();

      expect(component.isDifferent(row('size'))).toBe(true);
    });

    it('only marks in replace mode', () => {
      fixture.componentRef.setInput('currentValue', {
        ...current,
        steps: 12,
      } satisfies GenerateFormValue);
      fixture.detectChanges();

      component.setMode('overlay');

      expect(component.isDifferent(row('steps'))).toBe(false);
      expect(component.hasDifferences()).toBe(false);
    });

    it('recomputes when the panel moves to another image', () => {
      fixture.componentRef.setInput('currentValue', current);
      fixture.detectChanges();
      expect(component.hasDifferences()).toBe(false);

      fixture.componentRef.setInput('request', {
        ...REQUEST,
        params: { ...REQUEST.params, steps: 8 },
      } satisfies ImageGenerationRequest);
      fixture.detectChanges();

      expect(component.isDifferent(row('steps'))).toBe(true);
    });
  });

  it('re-seeds the apply mode from the host', () => {
    expect(component.mode()).toBe('replace');

    fixture.componentRef.setInput('defaultMode', 'overlay');
    fixture.detectChanges();

    expect(component.mode()).toBe('overlay');
  });

  it('resets the selection when the panel moves to another image', () => {
    const steps = component.groups()[1].rows.find((row) => row.id === 'steps')!;
    component.toggleRow(steps);

    fixture.componentRef.setInput('request', {
      ...REQUEST,
      prompt: 'another image',
    } satisfies ImageGenerationRequest);
    fixture.detectChanges();

    expect(component.selectedKeys()).toContain('steps');
  });
});
