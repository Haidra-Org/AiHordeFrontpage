import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import { StudioPasteModalComponent } from './studio-paste-modal.component';
import { StudioLinkPayload } from '../studio-link';

describe('StudioPasteModalComponent', () => {
  let fixture: ComponentFixture<StudioPasteModalComponent>;
  let component: StudioPasteModalComponent;
  let applied: StudioLinkPayload[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        StudioPasteModalComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudioPasteModalComponent);
    component = fixture.componentInstance;
    applied = [];
    component.applied.subscribe((payload) => applied.push(payload));
  });

  it('says so in the box when the text is neither', () => {
    component.text.set('{not a request');
    component.apply();

    expect(component.error()).toBe('generate.link.paste_error');
    expect(applied).toHaveLength(0);
  });

  it('clears the objection as soon as the text changes', () => {
    component.text.set('nonsense');
    component.apply();
    const box = document.createElement('textarea');
    box.value = '{"prompt":"a fox"}';
    component.onInput({ target: box } as unknown as Event);

    expect(component.error()).toBeNull();
    expect(component.text()).toBe('{"prompt":"a fox"}');
  });

  it('reads a request written as JSON', () => {
    component.text.set('{"prompt":"a fox","params":{"steps":25}}');
    component.apply();

    expect(applied).toHaveLength(1);
    expect(applied[0].kind).toBe('full');
    expect(applied[0].request.params?.steps).toBe(25);
    expect(component.error()).toBeNull();
  });

  it('reads an address copied out of the studio', () => {
    component.text.set('https://aihorde.net/generate/image?model=Deliberate');
    component.apply();

    expect(applied).toHaveLength(1);
    expect(applied[0].kind).toBe('simple');
    expect(applied[0].request.models).toEqual(['Deliberate']);
  });
});
