import { PageGlossaryContext } from '../../../services/glossary.service';

export interface WorkerIconDef {
  type: string;
  iconName: string;
  colorClass: string;
  labelKey: string;
  descriptionKey: string;
}

export const WORKER_STATUS_ICONS: WorkerIconDef[] = [
  {
    type: 'online',
    iconName: 'play',
    colorClass: 'worker-indicator-green',
    labelKey: 'admin.workers.card.online',
    descriptionKey: 'help.glossary.page.workers.icon_online.description',
  },
  {
    type: 'issue',
    iconName: 'warning-triangle',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.issue',
    descriptionKey: 'help.glossary.page.workers.icon_issue.description',
  },
  {
    type: 'offline',
    iconName: 'x-circle',
    colorClass: 'worker-indicator-gray',
    labelKey: 'admin.workers.card.offline',
    descriptionKey: 'help.glossary.page.workers.icon_offline.description',
  },
  {
    type: 'low_speed',
    iconName: 'chevron-double-down',
    colorClass: 'worker-indicator-orange',
    labelKey: 'admin.workers.card.low_speed_warning',
    descriptionKey: 'help.glossary.page.workers.icon_low_speed.description',
  },
  {
    type: 'high_speed',
    iconName: 'bolt',
    colorClass: 'worker-indicator-yellow',
    labelKey: 'admin.workers.card.high_speed_warning',
    descriptionKey: 'help.glossary.page.workers.icon_high_speed.description',
  },
  {
    type: 'paused',
    iconName: 'no-symbol',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.paused',
    descriptionKey: 'help.glossary.page.workers.icon_paused.description',
  },
  {
    type: 'maintenance',
    iconName: 'pause-circle',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.maintenance',
    descriptionKey: 'help.glossary.page.workers.icon_maintenance.description',
  },
  {
    type: 'flagged',
    iconName: 'flag',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.flagged',
    descriptionKey: 'help.glossary.page.workers.icon_flagged.description',
  },
  {
    type: 'trusted',
    iconName: 'shield-check',
    colorClass: 'worker-indicator-green',
    labelKey: 'admin.workers.card.trusted',
    descriptionKey: 'help.glossary.page.workers.icon_trusted.description',
  },
  {
    type: 'type_image',
    iconName: 'photo-alt',
    colorClass: 'worker-type-image',
    labelKey: 'admin.workers.type.image_worker',
    descriptionKey: 'admin.workers.type.image_worker',
  },
  {
    type: 'type_text',
    iconName: 'document-text',
    colorClass: 'worker-type-text',
    labelKey: 'admin.workers.type.text_worker',
    descriptionKey: 'admin.workers.type.text_worker',
  },
  {
    type: 'type_interrogation',
    iconName: 'magnifying-glass',
    colorClass: 'worker-type-interrogation',
    labelKey: 'admin.workers.type.interrogation_worker',
    descriptionKey: 'admin.workers.type.interrogation_worker',
  },
];

export const WORKER_ICON_MAP = new Map(
  WORKER_STATUS_ICONS.map((icon) => [icon.type, icon]),
);

/** Shared glossary context for pages that display worker cards. */
export const WORKERS_GLOSSARY_CONTEXT: PageGlossaryContext = {
  pageId: 'workers',
  pageTitleKey: 'help.glossary.tab.this_page',
  relevantTermIds: [
    'worker',
    'dreamer',
    'scribe',
    'alchemist',
    'trusted',
    'maintenance_mode',
    'paused',
    'flagged',
    'megapixelsteps',
    'tokens',
    'kudos',
    'threads',
    'bridge_agent',
    'model',
    'team',
    'nsfw',
  ],
  entries: [
    ...WORKER_STATUS_ICONS.map((icon) => ({
      id: `icon-${icon.type.replace('_', '-')}`,
      titleKey: `help.glossary.page.workers.icon_${icon.type}.title`,
      descriptionKey: icon.descriptionKey,
      iconName: icon.iconName,
      iconColorClass: icon.colorClass,
    })),
    {
      id: 'badge-img2img',
      titleKey: 'help.glossary.page.workers.badge_img2img.title',
      descriptionKey: 'help.glossary.page.workers.badge_img2img.description',
    },
    {
      id: 'badge-inpainting',
      titleKey: 'help.glossary.page.workers.badge_inpainting.title',
      descriptionKey: 'help.glossary.page.workers.badge_inpainting.description',
    },
    {
      id: 'badge-post-processing',
      titleKey: 'help.glossary.page.workers.badge_post_processing.title',
      descriptionKey:
        'help.glossary.page.workers.badge_post_processing.description',
    },
    {
      id: 'badge-lora',
      titleKey: 'help.glossary.page.workers.badge_lora.title',
      descriptionKey: 'help.glossary.page.workers.badge_lora.description',
    },
    {
      id: 'badge-controlnet',
      titleKey: 'help.glossary.page.workers.badge_controlnet.title',
      descriptionKey: 'help.glossary.page.workers.badge_controlnet.description',
    },
  ],
};
