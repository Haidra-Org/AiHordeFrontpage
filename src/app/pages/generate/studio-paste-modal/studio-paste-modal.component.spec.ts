import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import { StudioPasteModalComponent } from './studio-paste-modal.component';
import { StudioLinkPayload } from '../studio-link';
import { webpFile } from '../../../testing/webp-fixture';

/** A change event from the hidden file input, standing in for a picked file. */
function pickEvent(file: File): Event {
  return {
    target: { files: [file], value: 'result.webp' },
  } as unknown as Event;
}

function dropEvent(file: File): DragEvent {
  return {
    preventDefault: () => undefined,
    dataTransfer: { files: [file] },
  } as unknown as DragEvent;
}

/** Let the file read and the parse behind it settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

  it('reads the settings off a chosen image', async () => {
    const parameters = [
      'a fox in the snow',
      'Steps: 25, Seed: 12345, Model: Deliberate',
    ].join('\n');
    component.onImagePicked(pickEvent(webpFile(parameters)));
    await settle();

    expect(applied).toHaveLength(1);
    expect(applied[0].kind).toBe('full');
    expect(applied[0].request.prompt).toBe('a fox in the snow');
    expect(applied[0].request.models).toEqual(['Deliberate']);
    expect(component.error()).toBeNull();
  });

  it('reads the settings off an image dropped on the box', async () => {
    component.onDragOver(dropEvent(webpFile(null)));
    expect(component.dragActive()).toBe(true);

    component.onDrop(dropEvent(webpFile('a fox\nSteps: 20')));
    await settle();

    expect(component.dragActive()).toBe(false);
    expect(applied).toHaveLength(1);
    expect(applied[0].request.params?.steps).toBe(20);
  });

  it('says so in the box when the image carries no settings', async () => {
    component.onImagePicked(pickEvent(webpFile(null)));
    await settle();

    expect(component.error()).toBe('generate.link.paste_image_none');
    expect(applied).toHaveLength(0);
  });
});
