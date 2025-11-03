// Enums for item categorization

export enum ItemType {
  GUI_IMAGE = 'gui-image',
  GUI_TEXT = 'gui-text',
  TOOL = 'tool',
  RESOURCE = 'resource',
  DATASET = 'dataset',
}

export enum Domain {
  TEXT = 'text',
  IMAGE = 'image',
}

export enum Platform {
  WEB = 'web',
  WINDOWS = 'windows',
  LINUX = 'linux',
  MACOS = 'macos',
  IOS = 'ios',
  ANDROID = 'android',
  CLI = 'cli',
  SERVER = 'server',
  PROGRAMMING = 'programming',
  SOCIAL = 'social',
  FEDIVERSE = 'fediverse',
}

export enum FunctionKind {
  FRONTEND = 'frontend',
  WORKER = 'worker',
  BOT = 'bot',
  PLUGIN = 'plugin',
  SDK = 'sdk',
  CLI_TOOL = 'cli',
  TOOL = 'tool',
  INTERFACE = 'interface',
  UTILITY = 'utility',
  RESOURCE_COLLECTION = 'resource_collection',
  INFORMATIONAL = 'informational',
  COMMUNITY = 'community',
}
