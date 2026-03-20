export const WORKER_CARD_FIELDS = [
  'type',
  'owner',
  'team',
  'info',
  'bridgeAgent',
  'softwareContact',
  'contact',
  'ipaddr',
  'uptime',
  'speed',
  'threads',
  'requestsFulfilled',
  'generated',
  'modelsLoaded',
  'nsfw',
  'imageCapabilities',
  'messages',
] as const;

export type WorkerCardField = (typeof WORKER_CARD_FIELDS)[number];

export interface WorkerCardDisplaySettings {
  visibleFields: Record<WorkerCardField, boolean>;
  hideUnsetFields: boolean;
  alwaysShowOwnWorkerFields: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: WorkerCardDisplaySettings = {
  visibleFields: Object.fromEntries(
    WORKER_CARD_FIELDS.map((f) => [f, true]),
  ) as Record<WorkerCardField, boolean>,
  hideUnsetFields: false,
  alwaysShowOwnWorkerFields: false,
};

export const MODERATOR_ONLY_FIELDS: WorkerCardField[] = [
  'contact',
  'ipaddr',
  'messages',
];

export const FIELD_UI_METADATA: {
  group: string;
  groupLabelKey: string;
  fields: { key: WorkerCardField; labelKey: string }[];
}[] = [
  {
    group: 'basic',
    groupLabelKey: 'admin.workers.display_settings.group_basic_info',
    fields: [
      {
        key: 'type',
        labelKey: 'admin.workers.display_settings.field_type',
      },
      {
        key: 'owner',
        labelKey: 'admin.workers.display_settings.field_owner',
      },
      {
        key: 'team',
        labelKey: 'admin.workers.display_settings.field_team',
      },
      {
        key: 'info',
        labelKey: 'admin.workers.display_settings.field_info',
      },
      {
        key: 'bridgeAgent',
        labelKey: 'admin.workers.display_settings.field_bridge_agent',
      },
      {
        key: 'softwareContact',
        labelKey: 'admin.workers.display_settings.field_software_contact',
      },
      {
        key: 'contact',
        labelKey: 'admin.workers.display_settings.field_contact',
      },
      {
        key: 'ipaddr',
        labelKey: 'admin.workers.display_settings.field_ipaddr',
      },
    ],
  },
  {
    group: 'performance',
    groupLabelKey: 'admin.workers.display_settings.group_performance',
    fields: [
      {
        key: 'uptime',
        labelKey: 'admin.workers.display_settings.field_uptime',
      },
      {
        key: 'speed',
        labelKey: 'admin.workers.display_settings.field_speed',
      },
      {
        key: 'threads',
        labelKey: 'admin.workers.display_settings.field_threads',
      },
      {
        key: 'requestsFulfilled',
        labelKey: 'admin.workers.display_settings.field_requests_fulfilled',
      },
      {
        key: 'generated',
        labelKey: 'admin.workers.display_settings.field_generated',
      },
    ],
  },
  {
    group: 'capabilities',
    groupLabelKey: 'admin.workers.display_settings.group_capabilities',
    fields: [
      {
        key: 'modelsLoaded',
        labelKey: 'admin.workers.display_settings.field_models_loaded',
      },
      {
        key: 'nsfw',
        labelKey: 'admin.workers.display_settings.field_nsfw',
      },
      {
        key: 'imageCapabilities',
        labelKey: 'admin.workers.display_settings.field_image_capabilities',
      },
    ],
  },
  {
    group: 'moderator',
    groupLabelKey: 'admin.workers.display_settings.group_moderator',
    fields: [
      {
        key: 'messages',
        labelKey: 'admin.workers.display_settings.field_messages',
      },
    ],
  },
];
