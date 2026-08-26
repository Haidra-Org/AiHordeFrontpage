import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { StyleCardComponent } from './style-card.component';
import { StyleUsageService } from '../../../services/style-usage.service';
import type { ImageStyle, TextStyle } from '../../../types/style';
import en from '../../../../assets/i18n/en.json';

const IMAGE_STYLE: ImageStyle = {
  id: 'abc-123',
  name: 'Ink Wash',
  prompt: 'ink wash of {p}',
  public: true,
  nsfw: false,
  use_count: 40,
  creator: 'someone#7',
  tags: ['ink'],
  examples: [
    { id: 'e1', url: 'https://example.invalid/plain.webp' },
    { id: 'e2', url: 'https://example.invalid/primary.webp', primary: true },
  ],
};

const TEXT_STYLE: TextStyle = {
  id: 'txt-1',
  name: 'Terse',
  prompt: '{p}',
  public: false,
  nsfw: false,
  use_count: 2,
  creator: 'someone#7',
};

async function createCard(
  style: ImageStyle | TextStyle,
  styleType: 'image' | 'text',
  usageKeys: string[] = [],
): Promise<ComponentFixture<StyleCardComponent>> {
  TestBed.resetTestingModule();
  localStorage.clear();
  await TestBed.configureTestingModule({
    imports: [
      StyleCardComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  }).compileComponents();

  const usage = TestBed.inject(StyleUsageService);
  for (const key of usageKeys) {
    usage.increment(key);
  }

  const fixture = TestBed.createComponent(StyleCardComponent);
  fixture.componentRef.setInput('style', style);
  fixture.componentRef.setInput('styleType', styleType);
  fixture.detectChanges();
  return fixture;
}

describe('StyleCardComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the example its author marked primary', async () => {
    const fixture = await createCard(IMAGE_STYLE, 'image');
    expect(fixture.componentInstance.previewUrl()).toBe(
      'https://example.invalid/primary.webp',
    );
    const img = fixture.nativeElement.querySelector(
      '.style-card__shot img',
    ) as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe(
      'https://example.invalid/primary.webp',
    );
  });

  it('draws a glyph when the style has no example', async () => {
    const fixture = await createCard({ ...IMAGE_STYLE, examples: [] }, 'image');
    expect(fixture.componentInstance.previewUrl()).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.style-card__shot img'),
    ).toBeNull();
  });

  it('counts the reader own uses against the style key', async () => {
    const fixture = await createCard(IMAGE_STYLE, 'image', [
      'native:abc-123',
      'native:abc-123',
      'curated:abc-123',
    ]);
    expect(fixture.componentInstance.yourUses()).toBe(2);
  });

  it('has no picture and no usage count for a text style', async () => {
    const fixture = await createCard(TEXT_STYLE, 'text', ['native:txt-1']);
    expect(fixture.componentInstance.previewUrl()).toBeNull();
    expect(fixture.componentInstance.yourUses()).toBe(0);
  });
});
