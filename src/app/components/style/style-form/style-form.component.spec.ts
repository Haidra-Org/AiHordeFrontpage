import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideTransloco } from '@jsverse/transloco';
import { StyleFormComponent } from './style-form.component';
import { AiHordeService } from '../../../services/ai-horde.service';
import { ImageStyle, TextStyle } from '../../../types/style';

describe('StyleFormComponent', () => {
  const aiHordeMock = {
    getImageModels: jasmine.createSpy('getImageModels').and.returnValue(of([])),
    getTextModels: jasmine.createSpy('getTextModels').and.returnValue(of([])),
  };

  const imageStyleA: ImageStyle = {
    id: 'img-a',
    name: 'Image Style A',
    info: 'This is image style A info text.',
    prompt: '{p}',
    public: true,
    nsfw: false,
    tags: ['a'],
    models: ['ModelA'],
    params: { width: 512, height: 512 },
    creator: 'user',
    use_count: 1,
  } as ImageStyle;

  const imageStyleB: ImageStyle = {
    id: 'img-b',
    name: 'Image Style B',
    info: 'This is image style B info text.',
    prompt: '{p}{np}',
    public: false,
    nsfw: true,
    tags: ['b'],
    models: ['ModelB'],
    params: { width: 768, height: 768 },
    creator: 'user',
    use_count: 2,
  } as ImageStyle;

  const textStyle: TextStyle = {
    id: 'txt-a',
    name: 'Text Style A',
    info: 'This is text style A info text.',
    prompt: '{p}',
    public: true,
    nsfw: false,
    tags: ['t'],
    models: ['TextModel'],
    params: { temperature: 0.7 },
    creator: 'user',
    use_count: 3,
  } as TextStyle;

  beforeEach(() => {
    aiHordeMock.getImageModels.calls.reset();
    aiHordeMock.getTextModels.calls.reset();

    TestBed.configureTestingModule({
      imports: [StyleFormComponent],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
        }),
        { provide: AiHordeService, useValue: aiHordeMock },
      ],
    });
  });

  it('should rebase unsaved-change snapshot when initialValues changes', () => {
    const fixture = TestBed.createComponent(StyleFormComponent);

    fixture.componentRef.setInput('styleType', 'image');
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialValues', imageStyleA);
    fixture.detectChanges();

    const component = fixture.componentInstance;

    expect(component.form.controls['name'].value).toBe('Image Style A');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(false);

    component.form.controls['name'].setValue('Locally edited name');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(true);

    fixture.componentRef.setInput('initialValues', imageStyleB);
    fixture.detectChanges();

    expect(component.form.controls['name'].value).toBe('Image Style B');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(false);
  });

  it('should reinitialize form when styleType changes and reset snapshot', () => {
    const fixture = TestBed.createComponent(StyleFormComponent);

    fixture.componentRef.setInput('styleType', 'image');
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialValues', imageStyleA);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.controls['name'].setValue('Changed while image');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(true);

    fixture.componentRef.setInput('styleType', 'text');
    fixture.componentRef.setInput('initialValues', textStyle);
    fixture.detectChanges();

    expect(component.form.controls['name'].value).toBe('Text Style A');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(false);
    expect(aiHordeMock.getTextModels).toHaveBeenCalled();
  });
});
