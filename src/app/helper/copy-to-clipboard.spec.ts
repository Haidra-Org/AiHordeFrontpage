import { vi } from 'vitest';
import { copyToClipboard } from './copy-to-clipboard';

type ClipboardDocument = Document & {
  execCommand?: (commandId: string) => boolean;
};

function mockExecCommand(result: boolean) {
  const doc = document as ClipboardDocument;

  if (!doc.execCommand) {
    Object.defineProperty(doc, 'execCommand', {
      value: () => false,
      configurable: true,
      writable: true,
    });
  }

  return vi.spyOn(doc, 'execCommand').mockReturnValue(result);
}

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses async clipboard API in secure contexts when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const execSpy = mockExecCommand(true);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    const copied = await copyToClipboard('gen-123');

    expect(copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith('gen-123');
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when async clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execSpy = mockExecCommand(true);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    const copied = await copyToClipboard('gen-456');

    expect(copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith('gen-456');
    expect(execSpy).toHaveBeenCalledWith('copy');
    expect(document.querySelectorAll('textarea').length).toBe(0);
  });

  it('uses fallback path when secure clipboard is unavailable', async () => {
    const execSpy = mockExecCommand(false);

    vi.stubGlobal('isSecureContext', false);
    vi.stubGlobal('navigator', {} as unknown as Navigator);

    const copied = await copyToClipboard('gen-789');

    expect(copied).toBe(false);
    expect(execSpy).toHaveBeenCalledWith('copy');
  });

  it('returns false when fallback execCommand throws', async () => {
    const doc = document as ClipboardDocument;

    if (!doc.execCommand) {
      Object.defineProperty(doc, 'execCommand', {
        value: () => false,
        configurable: true,
        writable: true,
      });
    }

    vi.spyOn(doc, 'execCommand').mockImplementation(() => {
      throw new Error('copy not supported');
    });

    vi.stubGlobal('isSecureContext', false);
    vi.stubGlobal('navigator', {} as unknown as Navigator);

    const copied = await copyToClipboard('gen-000');

    expect(copied).toBe(false);
  });
});
