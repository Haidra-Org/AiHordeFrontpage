import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { defer, firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CivitaiDetailComponent } from './civitai-detail.component';
import { CivitaiPickerComponent } from '../civitai-picker/civitai-picker.component';
import { CivitaiCacheService } from '../../services/civitai-cache.service';
import {
  CivitaiService,
  type CivitaiModel,
  type CivitaiModelVersion,
} from '../../services/civitai.service';
import { HordeApiCacheService } from '../../services/horde-api-cache.service';
import { DatabaseService } from '../../services/database.service';
import {
  buildImageRequest,
  DEFAULT_GENERATE_FORM_VALUE,
  requestToFormValue,
} from '../../pages/generate/generate-form.model';
import {
  manualLoraSelection,
  type LoraSelection,
} from '../../types/civitai-asset';

// Live requests are opt-in so an upstream outage cannot break ordinary CI.
describe.runIf(process.env['CIVITAI_LIVE_TESTS'] === '1')(
  'LoRA editing against live CivitAI',
  () => {
    const responses = new Map<string, unknown>();
    let requests: string[];

    beforeEach(() => {
      const key = process.env['CIVITAI_API_KEY'];
      if (!key)
        throw new Error('CIVITAI_API_KEY is required for live verification');
      requests = [];
      const models = new Map<number, CivitaiModel>();
      const versions = new Map<number, CivitaiModelVersion>();
      TestBed.configureTestingModule({
        imports: [
          CivitaiDetailComponent,
          CivitaiPickerComponent,
          TranslocoTestingModule.forRoot({
            langs: {},
            translocoConfig: { defaultLang: 'en' },
          }),
        ],
        providers: [
          CivitaiService,
          {
            provide: HordeApiCacheService,
            useValue: {
              cachedGet: (url: string) =>
                defer(async () => {
                  requests.push(url);
                  if (responses.has(url)) return responses.get(url);
                  const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${key}` },
                    signal: AbortSignal.timeout(15000),
                  });
                  if (!response.ok)
                    throw new Error(`CivitAI returned HTTP ${response.status}`);
                  const data: unknown = await response.json();
                  responses.set(url, data);
                  return data;
                }),
            },
          },
          {
            provide: CivitaiCacheService,
            useValue: {
              getModel: (id: number) =>
                Promise.resolve(
                  models.has(id)
                    ? { data: models.get(id), stale: false }
                    : null,
                ),
              getVersion: (id: number) =>
                Promise.resolve(
                  versions.has(id)
                    ? { data: versions.get(id), stale: false }
                    : null,
                ),
              putVersion: (version: CivitaiModelVersion) => {
                versions.set(version.id, version);
                return Promise.resolve();
              },
              putSearchResult: (model: CivitaiModel) => {
                models.set(model.id, model);
                return Promise.resolve();
              },
            },
          },
          {
            provide: DatabaseService,
            useValue: { get: () => false, store: vi.fn() },
          },
        ],
      });
    });

    it('resolves, updates, restores and re-pins a manual version through the real service', async () => {
      const api = TestBed.inject(CivitaiService);
      const model = await firstValueFrom(api.fetchModel(122359));
      expect(model).not.toBeNull();
      expect(model!.versions.length).toBeGreaterThan(1);
      const original = model!.versions[model!.versions.length - 1];
      const replacement = model!.versions.find(
        (version) => version.id !== original.id,
      )!;
      const manual = manualLoraSelection({
        name: String(original.id),
        isVersion: true,
        model: 0.4,
        clip: 0.6,
      })!;

      const open = async (current: LoraSelection) => {
        const fixture = TestBed.createComponent(CivitaiDetailComponent);
        fixture.componentRef.setInput('target', {
          kind: 'lora',
          modelId: current.modelId ?? null,
          versionId: Number(current.name),
        });
        fixture.componentRef.setInput('current', current);
        fixture.detectChanges();
        await vi.waitFor(
          () => {
            expect(fixture.componentInstance.loading()).toBe(false);
            expect(fixture.componentInstance.model()?.id).toBe(model!.id);
          },
          { timeout: 20000 },
        );
        fixture.detectChanges();
        return fixture;
      };

      const fixture = await open(manual);
      const detail = fixture.componentInstance;
      expect(requests).toContain(
        `https://civitai.com/api/v1/model-versions/${original.id}`,
      );
      expect(detail.selectedVersion()?.id).toBe(original.id);
      expect(detail.modelStrength()).toBe(0.4);
      const apply = vi.fn();
      detail.apply.subscribe(apply);
      detail.modelStrength.set(0.8);
      detail.onApply();
      const updated = apply.mock.calls[0][0] as LoraSelection;
      const request = buildImageRequest({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a landscape',
        loras: [updated],
      });
      expect(request.params?.loras).toEqual([
        { name: String(original.id), model: 0.8, clip: 0.6, is_version: true },
      ]);
      const restored = requestToFormValue(request).loras[0];
      expect(restored.modelId).toBeUndefined();
      fixture.destroy();

      const restoredFixture = await open(restored);
      expect(restoredFixture.componentInstance.selectedVersion()?.id).toBe(
        original.id,
      );
      const repinned = vi.fn();
      restoredFixture.componentInstance.apply.subscribe(repinned);
      restoredFixture.componentInstance.selectVersion(replacement.id);
      restoredFixture.componentInstance.onApply();
      const entry = repinned.mock.calls[0][0] as LoraSelection;
      expect(entry).toMatchObject({
        name: String(replacement.id),
        is_version: true,
        model: 0.8,
        clip: 0.6,
        modelId: model!.id,
      });
      const liveVersion = await firstValueFrom(api.fetchVersion(entry.name));
      expect(liveVersion?.modelId).toBe(model!.id);
      expect(liveVersion?.id).toBe(replacement.id);
      restoredFixture.destroy();
    }, 60000);

    it('opens catalogue Details on the saved version and retains both ID namespaces', async () => {
      const model = await firstValueFrom(
        TestBed.inject(CivitaiService).fetchModel(122359),
      );
      const chosen = model!.versions[model!.versions.length - 1];
      const current: LoraSelection = {
        name: String(chosen.id),
        model: 0.35,
        clip: 0.65,
        is_version: true,
      };
      const other: LoraSelection = { name: current.name, model: 1, clip: 1 };
      const fixture = TestBed.createComponent(CivitaiPickerComponent);
      fixture.componentRef.setInput('loras', [current, other]);
      // Catalogue searching is independent of editing a supplied live model.
      vi.spyOn(TestBed.inject(CivitaiService), 'searchModels').mockReturnValue(
        of({
          kind: 'success',
          items: [],
          metadata: { nextCursor: null },
        }),
      );
      fixture.detectChanges();
      fixture.componentInstance.openDetails(model!);
      fixture.detectChanges();
      await vi.waitFor(
        () =>
          expect(
            fixture.nativeElement
              .querySelector('.gs-cv-version--on .gs-cv-version-name')
              ?.textContent?.trim(),
          ).toBe(chosen.name),
        { timeout: 20000 },
      );
      expect(fixture.componentInstance.detailCurrent()).toBe(current);
      const emitted = vi.fn();
      fixture.componentInstance.lorasChange.subscribe(emitted);
      const strengths = fixture.nativeElement.querySelectorAll(
        '.gs-cv-detail input[type="range"]',
      ) as NodeListOf<HTMLInputElement>;
      expect([...strengths].map((input) => Number(input.value))).toEqual([
        0.35, 0.65,
      ]);
      strengths[0].value = '0.7';
      strengths[0].dispatchEvent(new Event('input'));
      (
        fixture.nativeElement.querySelector(
          '.gs-cv-detail-foot .gs-modal-done',
        ) as HTMLButtonElement
      ).click();
      expect(emitted.mock.calls[0][0]).toHaveLength(2);
      expect(emitted.mock.calls[0][0][0]).toMatchObject({
        ...current,
        model: 0.7,
        modelId: model!.id,
      });
      expect(emitted.mock.calls[0][0][1]).toEqual(other);
      fixture.destroy();
    }, 60000);
  },
);
