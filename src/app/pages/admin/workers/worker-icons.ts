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
    iconName: 'check',
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
