import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { ModelAutocompleteComponent } from './model-autocomplete.component';
import { ActiveModel } from '../../types/active-model';
import type { ModelWorkerFacts } from '../../services/worker-pool.service';
import en from '../../../assets/i18n/en.json';

async function render(
  models: ActiveModel[],
  modelFacts: ReadonlyMap<string, ModelWorkerFacts> | null = null,
): Promise<ComponentFixture<ModelAutocompleteComponent>> {
  await TestBed.configureTestingModule({
    imports: [
      ModelAutocompleteComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ModelAutocompleteComponent);
  const ref = fixture.componentRef;
  ref.setInput('models', models);
  ref.setInput('inputId', 'test-models');
  ref.setInput('placeholderKey', 'generate.form.model_placeholder');
  ref.setInput('listAriaLabelKey', 'generate.form.model_list_label');
  ref.setInput('toggleAriaLabelKey', 'generate.form.model_toggle_label');
  ref.setInput('hiddenCountKey', 'generate.form.model_hidden_count');
  ref.setInput('emptyKey', 'generate.form.model_empty');
  ref.setInput('modelFacts', modelFacts);
  fixture.detectChanges();
  fixture.componentInstance.toggleModelDropdown();
  fixture.detectChanges();
  return fixture;
}

function optionText(
  fixture: ComponentFixture<ModelAutocompleteComponent>,
): string[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '.autocomplete-option',
    ),
  ).map((option) => option.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('ModelAutocompleteComponent', () => {
  it('counts the workers on a model somebody is serving', async () => {
    const fixture = await render([{ name: 'Deliberate', count: 4 }]);

    expect(optionText(fixture)).toEqual(['Deliberate (4 workers)no queue']);
  });

  it('says how long a busy model is taking, as an estimate', async () => {
    const fixture = await render([{ name: 'Deliberate', count: 4, eta: 300 }]);

    expect(optionText(fixture)).toEqual(['Deliberate (4 workers)~5 min wait']);
  });

  it('says the largest size the model’s workers offer', async () => {
    const fixture = await render(
      [{ name: 'Deliberate', count: 4 }],
      new Map([
        [
          'Deliberate',
          { workers: 4, maxSide: 2048, nsfw: 2, img2img: 3, painting: 1 },
        ],
      ]),
    );

    expect(optionText(fixture)[0]).toContain('up to 2048×2048');
  });

  it('leaves the size off a model the worker list says nothing about', async () => {
    const fixture = await render([{ name: 'Deliberate', count: 4 }], new Map());

    expect(optionText(fixture)[0]).not.toContain('up to');
  });

  it('says nobody is serving a model rather than counting zero', async () => {
    const fixture = await render([{ name: 'Pony Diffusion', count: 0 }]);

    expect(optionText(fixture)).toEqual([
      'Pony Diffusion no workers right now',
    ]);
  });

  it('marks a model the official reference does not list', async () => {
    const fixture = await render([
      { name: 'Private Merge', count: 2, custom: true },
    ]);

    const host = fixture.nativeElement as HTMLElement;
    expect(optionText(fixture)).toEqual([
      'Private Merge (2 workers)customno queue',
    ]);
    expect(
      host.querySelector('.autocomplete-custom')?.textContent?.trim(),
    ).toBe('custom');
  });
});

describe('ModelAutocompleteComponent, over a chosen model', () => {
  const models: ActiveModel[] = [
    { name: 'Deliberate', count: 4 },
    { name: 'AlbedoBase XL', count: 2 },
    { name: 'Pony Diffusion', count: 0 },
  ];

  it('offers every model, with the chosen one marked, rather than only the chosen one', async () => {
    const fixture = await render(models);
    fixture.componentInstance.writeValue('Deliberate');
    fixture.detectChanges();

    expect(optionText(fixture)).toHaveLength(3);
    const host = fixture.nativeElement as HTMLElement;
    const selected = host.querySelectorAll('.autocomplete-option--selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Deliberate');
    expect(selected[0].getAttribute('aria-selected')).toBe('true');
  });

  it('still narrows the list while the reader types a partial name', async () => {
    const fixture = await render(models);
    fixture.componentInstance.writeValue('Delib');
    fixture.detectChanges();

    expect(optionText(fixture)).toHaveLength(1);
  });

  it('shows a clear control once the field holds text, and clearing reopens the whole list', async () => {
    const fixture = await render(models);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.autocomplete-clear')).toBeNull();

    fixture.componentInstance.writeValue('Deliberate');
    fixture.detectChanges();
    const clear = host.querySelector<HTMLButtonElement>('.autocomplete-clear');
    expect(clear).not.toBeNull();

    clear?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('');
    expect(fixture.componentInstance.dropdownOpen()).toBe(true);
    expect(optionText(fixture)).toHaveLength(3);
  });
});
