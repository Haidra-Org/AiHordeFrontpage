import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptDraftCardComponent } from './prompt-draft-card.component';
import {
  PromptDraftOutcome,
  PromptDraftService,
} from '../../services/prompt-draft.service';

describe('PromptDraftCardComponent', () => {
  let fixture: ComponentFixture<PromptDraftCardComponent>;
  let draft: ReturnType<typeof vi.fn>;
  let sent: string | null;

  beforeEach(() => {
    draft = vi.fn();
    TestBed.configureTestingModule({
      imports: [
        PromptDraftCardComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: PromptDraftService,
          useValue: {
            draft,
            textModels: vi.fn().mockResolvedValue([
              { name: 'koboldcpp/L3-8B-Stheno-v3.2', count: 4 },
              { name: 'koboldcpp/gemma-4-31B-it-heretic', count: 1 },
            ]),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(PromptDraftCardComponent);
    fixture.componentRef.setInput('caption', 'a dog on a couch');
    fixture.componentRef.setInput('tags', 'dog, couch');
    fixture.componentRef.setInput('defaultOpen', true);
    sent = null;
    fixture.componentInstance.apply.subscribe((text) => (sent = text));
    fixture.detectChanges();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('lists the models online once open, curated ones first', async () => {
    await settle();
    const options = [...el().querySelectorAll('select option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual([
      'auto',
      'any',
      'model:koboldcpp/gemma-4-31B-it-heretic',
      'model:koboldcpp/L3-8B-Stheno-v3.2',
    ]);
  });

  it('asks for a draft from the material and the pick, then offers it to the studio', async () => {
    const outcome: PromptDraftOutcome = {
      kind: 'done',
      text: 'a dog on a couch, warm light',
      model: 'koboldcpp/gemma-4-31B-it-heretic',
      kudos: 2,
    };
    draft.mockResolvedValue(outcome);
    await settle();
    fixture.componentInstance.onNoteInput('make it painterly');
    fixture.componentInstance.onPickChange('model:x/y');
    await fixture.componentInstance.draft();
    fixture.detectChanges();

    expect(draft).toHaveBeenCalledWith(
      {
        caption: 'a dog on a couch',
        tags: 'dog, couch',
        note: 'make it painterly',
      },
      { model: 'x/y' },
      expect.any(Array),
    );
    expect(
      el().querySelector('.alchemy-draft__text')?.textContent?.trim(),
    ).toBe('a dog on a couch, warm light');
    (
      el().querySelector('.alchemy-draft__actions button') as HTMLButtonElement
    ).click();
    expect(sent).toBe('a dog on a couch, warm light');
  });

  it('shows the refusal as the horde worded it', async () => {
    draft.mockResolvedValue({
      kind: 'refused',
      error: { status: 400, message: 'No workers', rc: 'NoWorkers' },
    });
    await fixture.componentInstance.draft();
    fixture.detectChanges();
    expect(el().querySelector('.gs-warn')?.textContent).toContain(
      'prompt_draft.refused',
    );
  });

  it('does nothing without material to write from', async () => {
    fixture.componentRef.setInput('caption', null);
    fixture.componentRef.setInput('tags', null);
    fixture.detectChanges();
    await fixture.componentInstance.draft();
    expect(draft).not.toHaveBeenCalled();
  });

  it('improves a prompt when given one, and asks for that rather than findings', async () => {
    draft.mockResolvedValue({
      kind: 'done',
      text: 'a dog on a couch, golden hour, 35mm',
      model: 'm',
      kudos: 1,
    });
    fixture.componentRef.setInput('caption', null);
    fixture.componentRef.setInput('tags', null);
    fixture.componentRef.setInput('seed', 'a dog on a couch');
    fixture.detectChanges();
    expect(fixture.componentInstance.mode()).toBe('improve');
    expect(fixture.componentInstance.hasMaterial()).toBe(true);
    await fixture.componentInstance.draft();
    expect(draft).toHaveBeenCalledWith(
      { prompt: 'a dog on a couch', note: '' },
      'auto',
      expect.anything(),
    );
  });
});
