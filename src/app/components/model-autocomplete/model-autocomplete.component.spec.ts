import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { ModelAutocompleteComponent } from './model-autocomplete.component';
import { ActiveModel } from '../../types/active-model';
import en from '../../../assets/i18n/en.json';

async function render(
  models: ActiveModel[],
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

    expect(optionText(fixture)).toEqual(['Deliberate (4 workers)']);
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
    expect(optionText(fixture)).toEqual(['Private Merge (2 workers)custom']);
    expect(
      host.querySelector('.autocomplete-custom')?.textContent?.trim(),
    ).toBe('custom');
  });
});
