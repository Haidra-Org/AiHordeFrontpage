import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { highlightJson, stringifyAsJson } from '../../helper/json-formatter';

export interface JsonInspectorSection {
  id: string;
  label: string;
  value: unknown;
}

interface PreparedSection extends JsonInspectorSection {
  json: string;
  highlighted: string;
}

@Component({
  selector: 'app-json-inspector',
  templateUrl: './json-inspector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonInspectorComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly dialogRef =
    viewChild<ElementRef<HTMLDialogElement>>('dialogRef');

  public readonly open = input(false);
  public readonly title = input('Raw JSON');
  public readonly closeLabel = input('Close');
  public readonly downloadFilePrefix = input('raw-json');
  public readonly sections = input.required<readonly JsonInspectorSection[]>();

  public readonly closed = output<void>();

  public readonly activeSectionId = signal<string>('');

  public readonly preparedSections = computed<PreparedSection[]>(() => {
    return this.sections().map((section) => {
      const json = stringifyAsJson(section.value);
      return {
        ...section,
        json,
        highlighted: highlightJson(json),
      };
    });
  });

  public readonly activeSection = computed<PreparedSection | null>(() => {
    const sections = this.preparedSections();
    if (sections.length === 0) {
      return null;
    }

    const activeId = this.activeSectionId();
    return sections.find((section) => section.id === activeId) ?? sections[0];
  });

  public readonly hasMultipleSections = computed(
    () => this.preparedSections().length > 1,
  );

  constructor() {
    effect(() => {
      const sections = this.preparedSections();
      const activeId = this.activeSectionId();

      if (sections.length === 0) {
        this.activeSectionId.set('');
        return;
      }

      if (!activeId || !sections.some((section) => section.id === activeId)) {
        this.activeSectionId.set(sections[0].id);
      }
    });

    effect(() => {
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog || !isPlatformBrowser(this.platformId)) {
        return;
      }

      if (this.open() && !dialog.open) {
        dialog.showModal();
      }

      if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  public setActiveSection(id: string): void {
    this.activeSectionId.set(id);
  }

  public close(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog?.open) {
      dialog.close();
      return;
    }

    this.closed.emit();
  }

  public onDialogClosed(): void {
    this.closed.emit();
  }

  public onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  public async copyActiveSection(): Promise<void> {
    const section = this.activeSection();
    if (!section?.json) {
      return;
    }

    await this.copyToClipboard(section.json);
  }

  public downloadActiveSection(): void {
    const section = this.activeSection();
    if (!section?.json) {
      return;
    }

    const fileName = this.sanitizeFileName(
      `${this.downloadFilePrefix()}-${section.id}.json`,
    );
    this.downloadJson(fileName, section.json);
  }

  public downloadAllSections(): void {
    const sections = this.preparedSections();
    if (sections.length === 0) {
      return;
    }

    const payload = sections.reduce<Record<string, unknown>>((acc, section) => {
      acc[section.id] = section.value;
      return acc;
    }, {});

    const combinedJson = stringifyAsJson(payload);
    if (!combinedJson) {
      return;
    }

    const fileName = this.sanitizeFileName(
      `${this.downloadFilePrefix()}-all.json`,
    );
    this.downloadJson(fileName, combinedJson);
  }

  private async copyToClipboard(text: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (globalThis.isSecureContext && clipboard?.writeText) {
        await clipboard.writeText(text);
        return;
      }
    } catch (error) {
      console.error('Async clipboard copy failed.', error);
    }

    const body = globalThis.document?.body;
    if (!body) {
      return;
    }

    const textArea = globalThis.document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    body.append(textArea);
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    try {
      globalThis.document.execCommand('copy');
    } catch (error) {
      console.error('Fallback clipboard copy failed.', error);
    } finally {
      textArea.remove();
    }
  }

  private downloadJson(fileName: string, json: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = fileName;
    globalThis.document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9_.-]/g, '-');
  }
}
