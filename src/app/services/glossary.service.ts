import { Injectable, signal } from '@angular/core';

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
  iconSvg?: string;
  iconColorClass?: string;
  colorSwatch?: string;
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
  { id: 'capabilities', labelKey: 'help.glossary.category.capabilities' },
  { id: 'units', labelKey: 'help.glossary.category.units' },
  { id: 'tools', labelKey: 'help.glossary.category.tools' },
];

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
  },
  {
    id: 'inpainting',
    titleKey: 'help.glossary.terms.inpainting.title',
    bodyKey: 'help.glossary.terms.inpainting.body',
    category: 'generation',
  },

  // Capabilities
  {
    id: 'lora',
    titleKey: 'help.glossary.terms.lora.title',
    bodyKey: 'help.glossary.terms.lora.body',
    category: 'capabilities',
  },
  {
    id: 'controlnet',
    titleKey: 'help.glossary.terms.controlnet.title',
    bodyKey: 'help.glossary.terms.controlnet.body',
    category: 'capabilities',
  },
  {
    id: 'post_processing',
    titleKey: 'help.glossary.terms.post_processing.title',
    bodyKey: 'help.glossary.terms.post_processing.body',
    category: 'capabilities',
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
  public readonly pageContext = signal<PageGlossaryContext | null>(null);

  public open(termId?: string): void {
    this.activeTermId.set(termId ?? null);
    if (termId) {
      this.activeTab.set('dictionary');
    } else if (this.pageContext()) {
      this.activeTab.set('this-page');
    } else {
      this.activeTab.set('dictionary');
    }
    this.isOpen.set(true);
  }

  public close(): void {
    this.isOpen.set(false);
    this.activeTermId.set(null);
  }

  public registerPageContext(ctx: PageGlossaryContext): void {
    this.pageContext.set(ctx);
  }

  public clearPageContext(): void {
    this.pageContext.set(null);
  }
}
