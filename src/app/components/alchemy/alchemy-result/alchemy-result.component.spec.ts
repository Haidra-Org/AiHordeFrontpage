import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AlchemyResultComponent } from './alchemy-result.component';
import { AlchemyForm } from '../../../types/generation';

async function createComponent(): Promise<
  ComponentFixture<AlchemyResultComponent>
> {
  await TestBed.configureTestingModule({
    imports: [AlchemyResultComponent],
  })
    .overrideComponent(AlchemyResultComponent, { set: { template: '' } })
    .compileComponents();
  return TestBed.createComponent(AlchemyResultComponent);
}

function withForm(form: AlchemyForm): AlchemyResultComponent {
  const fixture = TestBed.createComponent(AlchemyResultComponent);
  fixture.componentRef.setInput('form', form);
  return fixture.componentInstance;
}

describe('AlchemyResultComponent', () => {
  beforeEach(async () => {
    await createComponent();
  });

  it('detects a caption result', () => {
    const c = withForm({
      form: 'caption',
      state: 'done',
      result: { caption: 'a dog' },
    });
    expect(c.kind()).toBe('caption');
    expect(c.caption()).toBe('a dog');
  });

  it('detects an nsfw result', () => {
    const safe = withForm({
      form: 'nsfw',
      state: 'done',
      result: { nsfw: false },
    });
    expect(safe.kind()).toBe('nsfw');
    expect(safe.nsfw()).toBe(false);

    const unsafe = withForm({
      form: 'nsfw',
      state: 'done',
      result: { nsfw: true },
    });
    expect(unsafe.nsfw()).toBe(true);
  });

  it('detects and sorts interrogation sections by confidence', () => {
    const c = withForm({
      form: 'interrogation',
      state: 'done',
      result: {
        interrogation: {
          tags: [
            { text: 'low', confidence: 1 },
            { text: 'high', confidence: 9 },
          ],
          artists: [],
        },
      },
    });
    expect(c.kind()).toBe('interrogation');
    const sections = c.sections();
    // empty `artists` is filtered out
    expect(sections.map((s) => s.key)).toEqual(['tags']);
    expect(sections[0].entries.map((e) => e.text)).toEqual(['high', 'low']);
  });

  it('detects a post-processor image result keyed by form name', () => {
    const c = withForm({
      form: 'RealESRGAN_x4plus',
      state: 'done',
      result: { RealESRGAN_x4plus: 'https://r2.example.com/out.webp' },
    });
    expect(c.kind()).toBe('image');
    expect(c.imageUrl()).toBe('https://r2.example.com/out.webp');
  });

  it('detects newer inline data forms keyed by form name', () => {
    const c = withForm({
      form: 'describe',
      state: 'done',
      result: { describe: { format: 'WEBP', width: 1024, height: 801 } },
    });
    expect(c.kind()).toBe('describe');
    expect(c.returnsImage()).toBe(false);
    expect(c.describeSummary()).toBe('WEBP · 1024px x 801px');
    expect(c.rawCopyText()).toContain('"format": "WEBP"');
  });

  it('stringifies structured inline data form values for display', () => {
    const c = withForm({
      form: 'palette',
      state: 'done',
      result: {
        palette: { colors: [{ hex: '#111111', proportion: 0.25 }] },
      },
    });
    expect(c.kind()).toBe('palette');
    expect(c.paletteColors()).toEqual([
      { hex: '#111111', proportion: 0.25, percentage: '25.0%' },
    ]);
    expect(c.rawCopyText()).toContain('#111111');
  });

  it('renders vectorize SVG as sanitized inline SVG while keeping raw SVG copy text', () => {
    const svg =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: visioncortex VTracer 0.6.12 -->\n<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="1024" height="801"><path d="M0 0h10v10H0z"/></svg>';
    const c = withForm({
      form: 'vectorize',
      state: 'done',
      result: { vectorize: svg },
    });
    expect(c.kind()).toBe('vectorize');
    expect(c.vectorSvgMarkup()).toContain('<svg version="1.1"');
    expect(c.vectorSvgPreviewMarkup()).toContain('<svg');
    expect(c.vectorSvgPreviewMarkup()).toContain('viewBox="0 0 1024 801"');
    expect(c.vectorSvgHtml()).toBeTruthy();
    expect(c.rawCopyText()).toBe(svg);
  });

  it('strips active content from vectorize SVG previews', () => {
    const c = withForm({
      form: 'vectorize',
      state: 'done',
      result: {
        vectorize:
          '<svg onload="alert(1)"><script>alert(1)</script><path onclick="alert(2)" d="M0 0h1v1"/></svg>',
      },
    });
    expect(c.vectorSvgPreviewMarkup()).toContain('<svg');
    expect(c.vectorSvgPreviewMarkup()).not.toContain('script');
    expect(c.vectorSvgPreviewMarkup()).not.toContain('onload');
    expect(c.vectorSvgPreviewMarkup()).not.toContain('onclick');
  });

  it('falls back to unknown for an unrecognized shape without throwing', () => {
    const c = withForm({
      form: 'caption',
      state: 'done',
      result: { something_unexpected: { nested: [1, 2, 3] } },
    });
    expect(c.kind()).toBe('unknown');
    const sections = c.rawJsonSections();
    expect(sections).toHaveLength(1);
    expect(sections[0].value).toMatchObject({
      something_unexpected: { nested: [1, 2, 3] },
    });
  });

  it('exposes no raw JSON section when there is no result', () => {
    const c = withForm({ form: 'caption', state: 'processing' });
    expect(c.kind()).toBe('unknown');
    expect(c.rawJsonSections()).toHaveLength(0);
  });

  it('formats confidence as a percentage', () => {
    const c = withForm({
      form: 'nsfw',
      state: 'done',
      result: { nsfw: false },
    });
    expect(c.formatConfidence(12.345)).toBe('12.3%');
  });

  describe('disclosure defaults', () => {
    it('opens compact results by default but folds interrogation', () => {
      const caption = withForm({
        form: 'caption',
        state: 'done',
        result: { caption: 'a dog' },
      });
      expect(caption.isOpen()).toBe(true);

      const interrogation = withForm({
        form: 'interrogation',
        state: 'done',
        result: { interrogation: { tags: [{ text: 't', confidence: 1 }] } },
      });
      expect(interrogation.isOpen()).toBe(false);
    });

    it('pins an explicit state once toggled', () => {
      const interrogation = withForm({
        form: 'interrogation',
        state: 'done',
        result: { interrogation: { tags: [{ text: 't', confidence: 1 }] } },
      });
      interrogation.toggleOpen();
      expect(interrogation.isOpen()).toBe(true);
      interrogation.toggleOpen();
      expect(interrogation.isOpen()).toBe(false);
    });
  });

  describe('interrogation capping', () => {
    const manyTags = Array.from({ length: 14 }, (_, i) => ({
      text: `tag-${i}`,
      confidence: 14 - i,
    }));

    function interrogation(): AlchemyResultComponent {
      return withForm({
        form: 'interrogation',
        state: 'done',
        result: { interrogation: { tags: manyTags } },
      });
    }

    it('summarizes total tags and facet count', () => {
      const c = interrogation();
      expect(c.totalTags()).toBe(14);
      expect(c.facetCount()).toBe(1);
    });

    it('caps a facet to the preview count until expanded', () => {
      const c = interrogation();
      const section = c.sections()[0];
      expect(c.visibleEntries(section)).toHaveLength(10);
      expect(c.hiddenCount(section)).toBe(4);

      c.toggleSection(section.key);
      expect(c.visibleEntries(section)).toHaveLength(14);
      expect(c.isSectionExpanded(section.key)).toBe(true);
    });
  });

  it('bands confidence weight into tiers', () => {
    const c = withForm({
      form: 'nsfw',
      state: 'done',
      result: { nsfw: false },
    });
    expect(c.tagTier(90)).toBe('high');
    expect(c.tagTier(75)).toBe('high');
    expect(c.tagTier(50)).toBe('mid');
    expect(c.tagTier(39)).toBe('low');
  });
});
