import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsProseComponent, ProseParams } from './gs-prose.component';
import { GlossaryService } from '../../services/glossary.service';

const KEY = 'spec.prose.body';

const LANG = {
  [KEY]: 'placeholder',
  // The name a sentence uses for guidance, which is the chip's inline face.
  'generate.help.cfg.title': 'Guidance',
};

@Component({
  imports: [GsProseComponent],
  template: `<p>
    <app-gs-prose [key]="key" [params]="params()" [paragraphs]="paragraphs()" />
  </p>`,
})
class HostComponent {
  public readonly key = KEY;
  public readonly params = signal<ProseParams | null>(null);
  public readonly paragraphs = signal(false);
}

describe('GsProseComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let glossary: GlossaryService;

  const render = async (body: string): Promise<void> => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: { ...LANG, [KEY]: body } },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
    // The component resolves its body itself rather than through the pipe, so
    // the file has to be in the service before the first render: in the app the
    // language is loaded long before any page mounts.
    await firstValueFrom(TestBed.inject(TranslocoService).load('en'));
    glossary = TestBed.inject(GlossaryService);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a body with no marks as its own text', async () => {
    await render('Press Generate and wait.');

    expect(text()).toContain('Press Generate and wait.');
    expect(el().querySelector('button')).toBeNull();
  });

  it('draws a dictionary word as a press that opens the definition at it', async () => {
    await render('Volunteer [[gl:worker|computers]] do the work.');

    const term = el().querySelector<HTMLButtonElement>('.gs-prose-term')!;
    expect(term.textContent).toBe('computers');
    expect(term.type).toBe('button');

    term.click();

    expect(glossary.isOpen()).toBe(true);
    expect(glossary.activeTermId()).toBe('worker');
    expect(glossary.activeTab()).toBe('dictionary');
  });

  it('draws a setting as a chip carrying the name the sentence would say', async () => {
    await render('Set [[set:cfg]] to 7.5.');

    expect(el().querySelector('app-gs-setting-chip')).not.toBeNull();
    expect(text()).toContain('Guidance');
  });

  it('draws a quoted literal in the code face', async () => {
    await render('Add `ink and watercolour` to it.');

    expect(el().querySelector('.gs-prose-code')?.textContent).toBe(
      'ink and watercolour',
    );
  });

  it('never renders a body as markup', async () => {
    await render('<b>bold</b> and <a href="#">a link</a>');

    expect(el().querySelector('b')).toBeNull();
    expect(el().querySelector('a')).toBeNull();
    expect(text()).toContain('<b>bold</b>');
  });

  it('leaves an interpolated value inert however it is spelled', async () => {
    await render('The prompt was “{{ prompt }}”.');
    fixture.componentInstance.params.set({
      prompt: '[[gl:worker|press me]] and `code`',
    });
    fixture.detectChanges();

    expect(el().querySelector('.gs-prose-term')).toBeNull();
    expect(el().querySelector('.gs-prose-code')).toBeNull();
    expect(text()).toContain('[[gl:worker|press me]] and `code`');
  });

  it('starts a paragraph at a blank line only when asked to', async () => {
    await render('One.\n\nTwo.');

    expect(el().querySelectorAll('.gs-prose-p')).toHaveLength(0);

    fixture.componentInstance.paragraphs.set(true);
    fixture.detectChanges();

    const blocks = el().querySelectorAll('.gs-prose-p');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].textContent?.trim()).toBe('One.');
    expect(blocks[1].textContent?.trim()).toBe('Two.');
  });
});
