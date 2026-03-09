export interface WorkerIconDef {
  type: string;
  pathData: string;
  viewBox: string;
  colorClass: string;
  transform?: string;
  labelKey: string;
  descriptionKey: string;
}

export const WORKER_STATUS_ICONS: WorkerIconDef[] = [
  {
    type: 'online',
    pathData: 'M5 13l4 4L19 7',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-green',
    labelKey: 'admin.workers.card.online',
    descriptionKey: 'help.glossary.page.workers.icon_online.description',
  },
  {
    type: 'issue',
    pathData:
      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.issue',
    descriptionKey: 'help.glossary.page.workers.icon_issue.description',
  },
  {
    type: 'offline',
    pathData:
      'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-gray',
    labelKey: 'admin.workers.card.offline',
    descriptionKey: 'help.glossary.page.workers.icon_offline.description',
  },
  {
    type: 'low_speed',
    pathData: 'M19.5 5.25l-7.5 7.5-7.5-7.5m15 6l-7.5 7.5-7.5-7.5',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-orange',
    labelKey: 'admin.workers.card.low_speed_warning',
    descriptionKey: 'help.glossary.page.workers.icon_low_speed.description',
  },
  {
    type: 'high_speed',
    pathData: 'M13 10V3L4 14h7v7l9-11h-7z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-yellow',
    labelKey: 'admin.workers.card.high_speed_warning',
    descriptionKey: 'help.glossary.page.workers.icon_high_speed.description',
  },
  {
    type: 'paused',
    pathData:
      'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.paused',
    descriptionKey: 'help.glossary.page.workers.icon_paused.description',
  },
  {
    type: 'maintenance',
    pathData: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.maintenance',
    descriptionKey: 'help.glossary.page.workers.icon_maintenance.description',
  },
  {
    type: 'flagged',
    pathData:
      'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-red',
    labelKey: 'admin.workers.card.flagged',
    descriptionKey: 'help.glossary.page.workers.icon_flagged.description',
  },
  {
    type: 'trusted',
    pathData:
      'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-indicator-green',
    labelKey: 'admin.workers.card.trusted',
    descriptionKey: 'help.glossary.page.workers.icon_trusted.description',
  },
  {
    type: 'type_image',
    pathData:
      'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-type-image',
    labelKey: 'admin.workers.type.image',
    descriptionKey: 'admin.workers.type.image',
  },
  {
    type: 'type_text',
    pathData:
      'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-type-text',
    labelKey: 'admin.workers.type.text',
    descriptionKey: 'admin.workers.type.text',
  },
  {
    type: 'type_interrogation',
    pathData:
      'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
    viewBox: '0 0 24 24',
    colorClass: 'worker-type-interrogation',
    labelKey: 'admin.workers.type.interrogation',
    descriptionKey: 'admin.workers.type.interrogation',
  },
];

export const WORKER_ICON_MAP = new Map(
  WORKER_STATUS_ICONS.map((icon) => [icon.type, icon]),
);

export function getWorkerIconSvg(type: string): string {
  const def = WORKER_ICON_MAP.get(type);
  if (!def) return '';
  const transform = def.transform ? ` style="transform:${def.transform}"` : '';
  return `<svg fill="none" stroke="currentColor" viewBox="${def.viewBox}"${transform}><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${def.pathData}"/></svg>`;
}
