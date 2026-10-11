import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CivitaiDetailComponent } from './civitai-detail.component';
import {
  CivitaiModel,
  CivitaiModelVersion,
  CivitaiService,
} from '../../services/civitai.service';
import { CivitaiCacheService } from '../../services/civitai-cache.service';
import type { LoraSelection, TiSelection } from '../../types/civitai-asset';

function version(
  id: number,
  extra: Partial<CivitaiModelVersion> = {},
): CivitaiModelVersion {
  return {
    id,
    modelId: 1,
    modelName: 'Detail Tweaker',
    name: `v${id}`,
    baseModel: 'SD 1.5',
    baseModelType: null,
    publishedAt: '2025-01-01T00:00:00Z',
    index: 0,
    trainedWords: ['detailed'],
    fileSizeKb: 144000,
    fileName: 'x.safetensors',
    sha256: null,
    nsfwLevel: 1,
    availability: 'Public',
    paidAccess: false,
    images: [],
    ...extra,
  };
}

const MODEL: CivitaiModel = {
  id: 1,
  name: 'Detail Tweaker',
  type: 'LORA',
  rawType: 'LORA',
  creator: 'alice',
  nsfw: false,
  nsfwLevel: 1,
  poi: false,
  minor: false,
  downloadCount: 10,
  thumbsUp: 3,
  thumbsDown: 0,
  tags: [],
  baseModels: ['SD 1.5'],
  availability: 'Public',
  preview: null,
  versions: [version(11), version(12, { baseModel: 'Pony' })],
};

describe('CivitaiDetailComponent', () => {
  let fixture: ComponentFixture<CivitaiDetailComponent>;
  let component: CivitaiDetailComponent;
  let fetchModel: ReturnType<typeof vi.fn>;
  let fetchVersion: ReturnType<typeof vi.fn>;

  async function open(
    overrides: Partial<{
      model: CivitaiModel;
      kind: 'lora' | 'ti';
      baseline: string | null;
      current: LoraSelection | TiSelection | null;
      allowSha256: boolean;
      modelId: number | null;
      versionId: number | null;
    }> = {},
  ): Promise<void> {
    fetchModel.mockReturnValue(of(overrides.model ?? MODEL));
    fixture = TestBed.createComponent(CivitaiDetailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('target', {
      kind: overrides.kind ?? 'lora',
      modelId: 'modelId' in overrides ? overrides.modelId : 1,
      versionId: overrides.versionId ?? null,
    });
    fixture.componentRef.setInput('baseline', overrides.baseline ?? null);
    fixture.componentRef.setInput('current', overrides.current ?? null);
    fixture.componentRef.setInput(
      'allowSha256',
      overrides.allowSha256 ?? false,
    );
    fixture.detectChanges();
    // The panel reads the store before the network, and that settles on the
    // macrotask queue.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  beforeEach(() => {
    fetchModel = vi.fn();
    fetchVersion = vi.fn().mockReturnValue(of(null));
    TestBed.configureTestingModule({
      imports: [
        CivitaiDetailComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        { provide: CivitaiService, useValue: { fetchModel, fetchVersion } },
        {
          provide: CivitaiCacheService,
          useValue: {
            getModel: vi.fn().mockResolvedValue(null),
            getVersion: vi.fn().mockResolvedValue(null),
            putVersion: vi.fn().mockResolvedValue(undefined),
            putSearchResult: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
  });

  it('starts on the version the chosen model can load', async () => {
    await open({ baseline: 'stable_diffusion_1' });

    expect(component.selectedVersion()?.id).toBe(11);
  });

  it('hands back a LoRA pinned to the version in view', async () => {
    await open({ baseline: 'stable_diffusion_1' });
    const applied: (LoraSelection | TiSelection)[] = [];
    component.apply.subscribe((entry) => applied.push(entry));

    component.selectVersion(12);
    component.onApply();

    // Named by version, so the request keeps meaning the same thing after the
    // author publishes an update.
    expect(applied[0]).toMatchObject({
      name: '12',
      is_version: true,
      label: 'Detail Tweaker',
      baseModel: 'Pony',
      modelId: 1,
    });
  });

  it('hands back an embedding named by its model page', async () => {
    await open({ kind: 'ti' });
    const applied: (LoraSelection | TiSelection)[] = [];
    component.apply.subscribe((entry) => applied.push(entry));

    component.onApply();

    // The horde's embedding payload has no version field at all.
    expect(applied[0]).toMatchObject({ name: '1', label: 'Detail Tweaker' });
    expect(applied[0]).not.toHaveProperty('is_version');
  });

  it('seeds its controls from the entry it was opened on', async () => {
    await open({
      current: {
        name: '11',
        model: 0.3,
        clip: 0.9,
        is_version: true,
        inject_trigger: 'detailed',
      },
    });

    expect(component.modelStrength()).toBe(0.3);
    expect(component.clipStrength()).toBe(0.9);
    expect(component.injectTrigger()).toBe('detailed');
    expect(component.isEditing()).toBe(true);
  });

  describe('trigger words', () => {
    it('refuses to hand a long one to the horde but still offers the prompt', async () => {
      await open();
      const long = 'w'.repeat(31);

      // The payload's own bound refuses it, so promising insertion would only
      // produce a rejected request.
      expect(component.canInject(long)).toBe(false);
      expect(component.canInject('detailed')).toBe(true);
    });

    it('passes the raw word to whoever owns the prompt', async () => {
      await open();
      const appended: string[] = [];
      component.appendToPrompt.subscribe((word) => appended.push(word));

      component.onAppendTrigger('detailed');

      expect(appended).toEqual(['detailed']);
    });

    // The prompt it wrote into is behind this panel and the picker over it, so
    // the button is the only place the press can be seen to have worked.
    it('says on the button which word went into the prompt', async () => {
      await open();
      vi.useFakeTimers();
      try {
        component.onAppendTrigger('detailed');
        expect(component.promptedWord()).toBe('detailed');

        vi.advanceTimersByTime(5000);
        expect(component.promptedWord()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('carries the wildcard through as the horde spells it', async () => {
      await open();
      const applied: LoraSelection[] = [];
      component.apply.subscribe((entry) =>
        applied.push(entry as LoraSelection),
      );

      component.setTrigger(component.injectAny);
      component.onApply();

      expect(applied[0].inject_trigger).toBe('any');
    });
  });

  it('claims a fit only against a model the reader has chosen', async () => {
    await open({ baseline: null });
    expect(component.suitsBaseline(component.versions()[0])).toBe(false);

    await open({ baseline: 'stable_diffusion_1' });
    expect(component.suitsBaseline(component.versions()[0])).toBe(true);
    expect(component.suitsBaseline(component.versions()[1])).toBe(false);
  });

  it('marks a version no worker could fetch', async () => {
    await open({
      model: {
        ...MODEL,
        versions: [version(11, { availability: 'EarlyAccess' }), version(12)],
      },
    });

    expect(component.isFetchable(component.versions()[0])).toBe(false);
    expect(component.isFetchable(component.versions()[1])).toBe(true);
  });

  it('covers a preview above the tamest rating until it is asked for', async () => {
    await open();

    expect(component.isCovered('u', 4)).toBe(true);
    component.reveal('u');
    expect(component.isCovered('u', 4)).toBe(false);
  });

  it('opens one preview whole and closes it again', async () => {
    await open();

    expect(component.enlarged()).toBeNull();
    component.enlarge('https://example.invalid/a.png');
    expect(component.enlarged()).toBe('https://example.invalid/a.png');
    expect(component.enlargedLabel()).toBe('Detail Tweaker');

    component.closeEnlarged();
    expect(component.enlarged()).toBeNull();
  });

  it('keeps a hash only where the host allows one', async () => {
    await open({ allowSha256: true });
    const applied: LoraSelection[] = [];
    component.apply.subscribe((entry) => applied.push(entry as LoraSelection));

    component.sha256.set('c'.repeat(64));
    component.onApply();

    expect(applied[0].sha256).toBe('c'.repeat(64));
  });

  it('links to the exact version being looked at', async () => {
    await open();
    component.selectVersion(12);

    expect(component.civitaiUrl()).toBe(
      'https://civitai.com/models/1?modelVersionId=12',
    );
  });

  it('resolves a manual version ID to its model and preserves the pin on update', async () => {
    fetchVersion.mockReturnValue(of(version(12, { baseModel: 'Pony' })));
    await open({
      modelId: null,
      versionId: 12,
      current: {
        name: '12',
        model: 0.3,
        clip: 0.9,
        is_version: true,
        origin: 'manual',
      },
    });
    expect(fetchVersion).toHaveBeenCalledWith(12);
    expect(fetchModel).toHaveBeenCalledWith(1);
    expect(component.selectedVersion()?.id).toBe(12);
    const apply = vi.fn();
    component.apply.subscribe(apply);
    component.modelStrength.set(0.8);
    component.onApply();
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '12',
        model: 0.8,
        clip: 0.9,
        is_version: true,
        modelId: 1,
        origin: 'manual',
      }),
    );
  });

  it('preserves the identifier, flag and display metadata when lookup fails', async () => {
    const current: LoraSelection = {
      name: '99',
      model: 0.3,
      clip: 0.9,
      is_version: true,
      label: 'Saved name',
      versionLabel: 'Saved version',
      inject_trigger: 'saved',
      sha256: 'a'.repeat(64),
    };
    await open({ modelId: null, versionId: 99, current });
    const apply = vi.fn();
    component.apply.subscribe(apply);
    component.setTrigger(null);
    component.onApply();
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '99',
        is_version: true,
        label: 'Saved name',
        versionLabel: 'Saved version',
      }),
    );
    expect(apply.mock.calls[0][0]).not.toHaveProperty('inject_trigger');
    expect(apply.mock.calls[0][0]).not.toHaveProperty('sha256');
  });

  it('preserves a pinned version missing from the model response', async () => {
    await open({
      versionId: 99,
      current: { name: '99', model: 1, clip: 1, is_version: true, modelId: 1 },
    });
    expect(component.selectedVersion()).toBeNull();
    const apply = vi.fn();
    component.apply.subscribe(apply);
    component.onApply();
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ name: '99', is_version: true }),
    );
  });

  it('uses cached version metadata when refreshing it fails', async () => {
    const cached = version(12, { baseModel: 'Pony' });
    vi.mocked(TestBed.inject(CivitaiCacheService).getVersion).mockResolvedValue(
      { data: cached, stale: true },
    );
    await open({
      modelId: null,
      versionId: 12,
      current: { name: '12', model: 0.4, clip: 0.6, is_version: true },
    });
    expect(fetchVersion).toHaveBeenCalledWith(12);
    expect(fetchModel).toHaveBeenCalledWith(1);
    expect(component.selectedVersion()?.id).toBe(12);
  });

  it('keeps a cached pin when the refreshed model omits that version', async () => {
    const cache = TestBed.inject(CivitaiCacheService);
    vi.mocked(cache.getVersion).mockResolvedValue({
      data: version(99),
      stale: false,
    });
    await open({
      modelId: null,
      versionId: 99,
      current: { name: '99', model: 0.4, clip: 0.6, is_version: true },
    });
    expect(fetchVersion).not.toHaveBeenCalled();
    expect(component.selectedVersion()?.id).toBe(99);
    const apply = vi.fn();
    component.apply.subscribe(apply);
    component.onApply();
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ name: '99', is_version: true, modelId: 1 }),
    );
  });

  it('preserves a pin when Update is pressed before the response arrives', async () => {
    const response = new Subject<CivitaiModel | null>();
    await open({
      versionId: 11,
      current: { name: '11', model: 1, clip: 1, is_version: true, modelId: 1 },
    });
    fetchModel.mockReturnValue(response);
    fixture.componentRef.setInput('target', {
      kind: 'lora',
      modelId: 1,
      versionId: 11,
    });
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const apply = vi.fn();
    component.apply.subscribe(apply);
    component.onApply();
    expect(component.loading()).toBe(true);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ name: '11', is_version: true }),
    );
    response.next(MODEL);
    response.complete();
  });

  it('keeps model-ID mode until the user explicitly chooses a version', async () => {
    await open({ current: { name: '1', model: 0.4, clip: 0.6 } });
    const apply = vi.fn();
    component.apply.subscribe(apply);
    component.onApply();
    expect(apply.mock.calls[0][0].name).toBe('1');
    expect(apply.mock.calls[0][0].is_version).not.toBe(true);
    component.selectVersion(12);
    component.onApply();
    expect(apply.mock.calls[1][0]).toMatchObject({
      name: '12',
      is_version: true,
      model: 0.4,
      clip: 0.6,
    });
  });

  it('ignores an old response after opening a different asset', async () => {
    const oldResponse = new Subject<CivitaiModel | null>();
    await open();
    fetchModel.mockReturnValue(oldResponse);
    fixture.componentRef.setInput('target', {
      kind: 'lora',
      modelId: 1,
      versionId: 11,
    });
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fetchModel.mockReturnValue(
      of({ ...MODEL, id: 2, versions: [version(22)] }),
    );
    fixture.componentRef.setInput('target', {
      kind: 'lora',
      modelId: 2,
      versionId: 22,
    });
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    oldResponse.next(MODEL);
    oldResponse.complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(component.model()?.id).toBe(2);
    expect(component.selectedVersion()?.id).toBe(22);
  });
});
