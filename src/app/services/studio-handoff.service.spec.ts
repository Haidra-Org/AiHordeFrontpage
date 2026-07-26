import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StudioHandoffService } from './studio-handoff.service';

describe('StudioHandoffService', () => {
  let service: StudioHandoffService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [StudioHandoffService] });
    service = TestBed.inject(StudioHandoffService);
  });

  it('starts with nothing pending', () => {
    expect(service.has()).toBe(false);
    expect(service.consume()).toBeNull();
  });

  it('hands the image over exactly once', () => {
    const blob = new Blob(['x'], { type: 'image/webp' });
    service.set({ blob, mimeType: 'image/webp' });

    expect(service.has()).toBe(true);
    const first = service.consume();

    expect(first?.blob).toBe(blob);
    expect(first?.mimeType).toBe('image/webp');
    // A later visit must not re-apply an image the user has moved on from.
    expect(service.has()).toBe(false);
    expect(service.consume()).toBeNull();
  });

  it('keeps only the most recent handoff', () => {
    const first = new Blob(['1'], { type: 'image/webp' });
    const second = new Blob(['2'], { type: 'image/png' });
    service.set({ blob: first, mimeType: 'image/webp' });
    service.set({ blob: second, mimeType: 'image/png' });

    expect(service.consume()?.blob).toBe(second);
  });
});
