export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (globalThis.isSecureContext && clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Async clipboard access failed, use fallback below.
  }

  const body = globalThis.document?.body;
  if (!body) {
    return false;
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
    return globalThis.document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}
