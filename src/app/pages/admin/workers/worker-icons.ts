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
    pathData:
      'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
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
];

export const WORKER_ICON_MAP = new Map(
  WORKER_STATUS_ICONS.map((icon) => [icon.type, icon]),
);

export function getWorkerIconSvg(type: string): string {
  const def = WORKER_ICON_MAP.get(type);
  if (!def) return '';
  const transform = def.transform
    ? ` style="transform:${def.transform}"`
    : '';
  return `<svg fill="none" stroke="currentColor" viewBox="${def.viewBox}"${transform}><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${def.pathData}"/></svg>`;
}
