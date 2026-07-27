import { Injectable, computed, signal } from '@angular/core';

export interface GlossaryLink {
  labelKey: string;
  routerLink: string;
  fragment?: string;
}

export interface GlossaryTerm {
  id: string;
  titleKey: string;
  bodyKey: string;
  category: GlossaryCategory;
  faqFragment?: string;
  links?: GlossaryLink[];
}

export interface PageGlossaryEntry {
  id: string;
  titleKey: string;
  descriptionKey: string;
  iconName?: string;
  iconColorClass?: string;
  colorSwatch?: string;
  /**
   * What pressing the entry does on the page that registered it, where the
   * entry names something the reader can be taken to. An entry without one is
   * read rather than pressed, and renders as static text.
   */
  action?: () => void;
}

export interface PageGlossaryContext {
  pageId: string;
  pageTitleKey: string;
  relevantTermIds: string[];
  entries: PageGlossaryEntry[];
}

export type GlossaryTab = 'dictionary' | 'this-page';

export type GlossaryCategory =
  | 'core'
  | 'worker_types'
  | 'generation'
  | 'generation_settings'
  | 'capabilities'
  | 'units'
  | 'tools';

export const GLOSSARY_CATEGORIES: {
  id: GlossaryCategory;
  labelKey: string;
}[] = [
  { id: 'core', labelKey: 'help.glossary.category.core' },
  { id: 'worker_types', labelKey: 'help.glossary.category.worker_types' },
  { id: 'generation', labelKey: 'help.glossary.category.generation' },
  {
    id: 'generation_settings',
    labelKey: 'help.glossary.category.generation_settings',
  },
  { id: 'capabilities', labelKey: 'help.glossary.category.capabilities' },
  { id: 'units', labelKey: 'help.glossary.category.units' },
  { id: 'tools', labelKey: 'help.glossary.category.tools' },
];

/**
 * Where a setting is written out in full. The dictionary says what a word means
 * to someone who has just met it; the settings reference is what the site says
 * about the setting itself, so every term that names one points there rather
 * than restating it at length.
 */
function referenceLink(topic: string): GlossaryLink {
  return {
    labelKey: 'help.glossary.link.full_reference',
    routerLink: `/generate/learn/settings/${topic}`,
  };
}

/** Where the numbers behind a wait are, for the terms that are about waiting. */
const STATUS_LINK: GlossaryLink = {
  labelKey: 'help.glossary.link.view_status',
  routerLink: '/status',
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  // Core Concepts
  {
    id: 'ai_horde',
    titleKey: 'help.glossary.terms.ai_horde.title',
    bodyKey: 'help.glossary.terms.ai_horde.body',
    category: 'core',
  },
  {
    id: 'kudos',
    titleKey: 'help.glossary.terms.kudos.title',
    bodyKey: 'help.glossary.terms.kudos.body',
    category: 'core',
    faqFragment: 'kudos',
  },
  {
    id: 'request',
    titleKey: 'help.glossary.terms.request.title',
    bodyKey: 'help.glossary.terms.request.body',
    category: 'core',
  },
  {
    id: 'job',
    titleKey: 'help.glossary.terms.job.title',
    bodyKey: 'help.glossary.terms.job.body',
    category: 'core',
  },
  {
    id: 'model',
    titleKey: 'help.glossary.terms.model.title',
    bodyKey: 'help.glossary.terms.model.body',
    category: 'core',
    links: [
      {
        labelKey: 'help.glossary.link.view_models',
        routerLink: '/details/models',
      },
    ],
  },
  {
    id: 'team',
    titleKey: 'help.glossary.terms.team.title',
    bodyKey: 'help.glossary.terms.team.body',
    category: 'core',
  },
  {
    id: 'trusted',
    titleKey: 'help.glossary.terms.trusted.title',
    bodyKey: 'help.glossary.terms.trusted.body',
    category: 'core',
  },
  {
    id: 'nsfw',
    titleKey: 'help.glossary.terms.nsfw.title',
    bodyKey: 'help.glossary.terms.nsfw.body',
    category: 'core',
    faqFragment: 'not-safe-for-work',
  },
  {
    id: 'api_key',
    titleKey: 'help.glossary.terms.api_key.title',
    bodyKey: 'help.glossary.terms.api_key.body',
    category: 'core',
  },
  {
    id: 'queue',
    titleKey: 'help.glossary.terms.queue.title',
    bodyKey: 'help.glossary.terms.queue.body',
    category: 'core',
    links: [STATUS_LINK],
  },

  // Tools & GUIs
  {
    id: 'gui',
    titleKey: 'help.glossary.terms.gui.title',
    bodyKey: 'help.glossary.terms.gui.body',
    category: 'tools',
  },
  {
    id: 'sdk',
    titleKey: 'help.glossary.terms.sdk.title',
    bodyKey: 'help.glossary.terms.sdk.body',
    category: 'tools',
  },
  {
    id: 'cli',
    titleKey: 'help.glossary.terms.cli.title',
    bodyKey: 'help.glossary.terms.cli.body',
    category: 'tools',
  },
  {
    id: 'bot',
    titleKey: 'help.glossary.terms.bot.title',
    bodyKey: 'help.glossary.terms.bot.body',
    category: 'tools',
  },
  {
    id: 'utility',
    titleKey: 'help.glossary.terms.utility.title',
    bodyKey: 'help.glossary.terms.utility.body',
    category: 'tools',
  },

  // Worker Types
  {
    id: 'worker',
    titleKey: 'help.glossary.terms.worker.title',
    bodyKey: 'help.glossary.terms.worker.body',
    category: 'worker_types',
    faqFragment: 'workers',
    links: [
      {
        labelKey: 'help.glossary.link.become_worker',
        routerLink: '/contribute/workers',
      },
      {
        labelKey: 'help.glossary.link.view_workers',
        routerLink: '/details/workers',
      },
    ],
  },
  {
    id: 'dreamer',
    titleKey: 'help.glossary.terms.dreamer.title',
    bodyKey: 'help.glossary.terms.dreamer.body',
    category: 'worker_types',
    faqFragment: 'what-is-a-worker',
    links: [
      {
        labelKey: 'help.glossary.link.become_worker',
        routerLink: '/contribute/workers',
      },
      {
        labelKey: 'help.glossary.link.view_image_workers',
        routerLink: '/details/workers/image',
      },
    ],
  },
  {
    id: 'scribe',
    titleKey: 'help.glossary.terms.scribe.title',
    bodyKey: 'help.glossary.terms.scribe.body',
    category: 'worker_types',
    faqFragment: 'what-is-a-worker',
    links: [
      {
        labelKey: 'help.glossary.link.become_worker',
        routerLink: '/contribute/workers',
      },
      {
        labelKey: 'help.glossary.link.view_text_workers',
        routerLink: '/details/workers/text',
      },
    ],
  },
  {
    id: 'alchemist',
    titleKey: 'help.glossary.terms.alchemist.title',
    bodyKey: 'help.glossary.terms.alchemist.body',
    category: 'worker_types',
    faqFragment: 'what-is-a-worker',
    links: [
      {
        labelKey: 'help.glossary.link.become_worker',
        routerLink: '/contribute/workers',
      },
      {
        labelKey: 'help.glossary.link.view_alchemy_workers',
        routerLink: '/details/workers/interrogation',
      },
    ],
  },
  {
    id: 'bridge_agent',
    titleKey: 'help.glossary.terms.bridge_agent.title',
    bodyKey: 'help.glossary.terms.bridge_agent.body',
    category: 'worker_types',
    links: [
      {
        labelKey: 'help.glossary.link.become_worker',
        routerLink: '/contribute/workers',
      },
    ],
  },

  // Generation
  {
    id: 'text2img',
    titleKey: 'help.glossary.terms.text2img.title',
    bodyKey: 'help.glossary.terms.text2img.body',
    category: 'generation',
  },
  {
    id: 'img2img',
    titleKey: 'help.glossary.terms.img2img.title',
    bodyKey: 'help.glossary.terms.img2img.body',
    category: 'generation',
    links: [referenceLink('source_modes')],
  },
  {
    id: 'inpainting',
    titleKey: 'help.glossary.terms.inpainting.title',
    bodyKey: 'help.glossary.terms.inpainting.body',
    category: 'generation',
    links: [referenceLink('source_modes')],
  },

  // Generation settings. The dictionary's half of the settings reference: one
  // sentence for a reader who met the word somewhere else on the site, and the
  // way to the page that argues about the value.
  {
    id: 'steps',
    titleKey: 'help.glossary.terms.steps.title',
    bodyKey: 'help.glossary.terms.steps.body',
    category: 'generation_settings',
    links: [referenceLink('steps')],
  },
  {
    id: 'cfg',
    titleKey: 'help.glossary.terms.cfg.title',
    bodyKey: 'help.glossary.terms.cfg.body',
    category: 'generation_settings',
    links: [referenceLink('cfg')],
  },
  {
    id: 'sampler',
    titleKey: 'help.glossary.terms.sampler.title',
    bodyKey: 'help.glossary.terms.sampler.body',
    category: 'generation_settings',
    links: [referenceLink('sampler')],
  },
  {
    id: 'seed',
    titleKey: 'help.glossary.terms.seed.title',
    bodyKey: 'help.glossary.terms.seed.body',
    category: 'generation_settings',
    links: [referenceLink('seed')],
  },
  {
    id: 'clip_skip',
    titleKey: 'help.glossary.terms.clip_skip.title',
    bodyKey: 'help.glossary.terms.clip_skip.body',
    category: 'generation_settings',
    links: [referenceLink('clip_skip')],
  },
  {
    id: 'karras',
    titleKey: 'help.glossary.terms.karras.title',
    bodyKey: 'help.glossary.terms.karras.body',
    category: 'generation_settings',
    links: [referenceLink('karras')],
  },
  {
    id: 'hires_fix',
    titleKey: 'help.glossary.terms.hires_fix.title',
    bodyKey: 'help.glossary.terms.hires_fix.body',
    category: 'generation_settings',
    links: [referenceLink('hires_fix')],
  },
  {
    id: 'denoise',
    titleKey: 'help.glossary.terms.denoise.title',
    bodyKey: 'help.glossary.terms.denoise.body',
    category: 'generation_settings',
    links: [referenceLink('denoise')],
  },
  {
    id: 'tiling',
    titleKey: 'help.glossary.terms.tiling.title',
    bodyKey: 'help.glossary.terms.tiling.body',
    category: 'generation_settings',
    links: [referenceLink('tiling')],
  },

  // Capabilities
  {
    id: 'lora',
    titleKey: 'help.glossary.terms.lora.title',
    bodyKey: 'help.glossary.terms.lora.body',
    category: 'capabilities',
    links: [referenceLink('loras')],
  },
  {
    id: 'controlnet',
    titleKey: 'help.glossary.terms.controlnet.title',
    bodyKey: 'help.glossary.terms.controlnet.body',
    category: 'capabilities',
    links: [referenceLink('source_modes')],
  },
  {
    id: 'post_processing',
    titleKey: 'help.glossary.terms.post_processing.title',
    bodyKey: 'help.glossary.terms.post_processing.body',
    category: 'capabilities',
    links: [referenceLink('upscaler')],
  },
  {
    id: 'maintenance',
    titleKey: 'help.glossary.terms.maintenance.title',
    bodyKey: 'help.glossary.terms.maintenance.body',
    category: 'capabilities',
  },
  {
    id: 'paused',
    titleKey: 'help.glossary.terms.paused.title',
    bodyKey: 'help.glossary.terms.paused.body',
    category: 'capabilities',
  },
  {
    id: 'flagged',
    titleKey: 'help.glossary.terms.flagged.title',
    bodyKey: 'help.glossary.terms.flagged.body',
    category: 'capabilities',
  },
  {
    id: 'threads',
    titleKey: 'help.glossary.terms.threads.title',
    bodyKey: 'help.glossary.terms.threads.body',
    category: 'capabilities',
  },

  // Units & Metrics
  {
    id: 'megapixelsteps',
    titleKey: 'help.glossary.terms.megapixelsteps.title',
    bodyKey: 'help.glossary.terms.megapixelsteps.body',
    category: 'units',
  },
  {
    id: 'tokens',
    titleKey: 'help.glossary.terms.tokens.title',
    bodyKey: 'help.glossary.terms.tokens.body',
    category: 'units',
  },
  {
    id: 'eta',
    titleKey: 'help.glossary.terms.eta.title',
    bodyKey: 'help.glossary.terms.eta.body',
    category: 'units',
    links: [STATUS_LINK],
  },
  {
    id: 'uptime',
    titleKey: 'help.glossary.terms.uptime.title',
    bodyKey: 'help.glossary.terms.uptime.body',
    category: 'units',
  },
];

@Injectable({ providedIn: 'root' })
export class GlossaryService {
  public readonly isOpen = signal(false);
  public readonly activeTermId = signal<string | null>(null);
  public readonly activeTab = signal<GlossaryTab>('dictionary');

  /**
   * All registered page contexts, keyed by pageId.
   * Multiple pages can register simultaneously; the glossary shows a tab for each.
   */
  public readonly pageContexts = signal<Map<string, PageGlossaryContext>>(
    new Map(),
  );

  /** Active page-context tab (pageId), used when activeTab === 'this-page'. */
  public readonly activePageId = signal<string | null>(null);

  /**
   * Backward-compatible computed: returns the current/active page context.
   * Prefers activePageId if set, otherwise falls back to the first registered.
   */
  public readonly pageContext = computed<PageGlossaryContext | null>(() => {
    const all = this.pageContexts();
    if (all.size === 0) return null;
    const active = this.activePageId();
    if (active && all.has(active)) return all.get(active)!;
    return all.values().next().value ?? null;
  });

  public open(termId?: string): void {
    this.activeTermId.set(termId ?? null);
    if (termId) {
      this.activeTab.set('dictionary');
    } else if (this.pageContexts().size > 0) {
      this.activeTab.set('this-page');
    } else {
      this.activeTab.set('dictionary');
    }
    this.isOpen.set(true);
  }

  /** Open the glossary's page-context tab and scroll to a specific entry. */
  public openToPageEntry(pageId: string, entryId: string): void {
    this.activePageId.set(pageId);
    this.activeTab.set('this-page');
    this.activeTermId.set(entryId);
    this.isOpen.set(true);
  }

  public close(): void {
    this.isOpen.set(false);
    this.activeTermId.set(null);
  }

  public registerPageContext(ctx: PageGlossaryContext): void {
    this.pageContexts.update((map) => {
      const next = new Map(map);
      next.set(ctx.pageId, ctx);
      return next;
    });
    // Set as active if it's the first, or if nothing is active yet
    if (!this.activePageId()) {
      this.activePageId.set(ctx.pageId);
    }
  }

  public clearPageContext(pageId?: string): void {
    if (pageId) {
      this.pageContexts.update((map) => {
        const next = new Map(map);
        next.delete(pageId);
        return next;
      });
      if (this.activePageId() === pageId) {
        const remaining = this.pageContexts();
        this.activePageId.set(
          remaining.size > 0 ? (remaining.keys().next().value ?? null) : null,
        );
      }
    } else {
      // Legacy: clear all
      this.pageContexts.set(new Map());
      this.activePageId.set(null);
    }
  }
}
