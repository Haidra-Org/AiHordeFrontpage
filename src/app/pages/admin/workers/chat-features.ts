import { WorkerChatDeclaration } from '../../../types/horde-worker';

/**
 * The groups shown for a chat declaration. A guarantee means the backend
 * follows one part of the OpenAI contract exactly. The other groups hold
 * features, which mean the backend supports an optional part. The horde sends
 * features and guarantees together in the `features` list and image
 * transports in a separate list, so each name's group is recorded here.
 */
export type ChatCapabilityGroupId =
  | 'sampling'
  | 'images'
  | 'tools'
  | 'format'
  | 'guarantees'
  | 'other';

/** Where a name comes from in the worker's chat declaration. */
export type ChatCapabilitySource = 'feature' | 'transport';

export interface ChatCapabilityDef {
  /** The name as sent by the horde. */
  name: string;
  source: ChatCapabilitySource;
  group: ChatCapabilityGroupId;
  titleKey: string;
  descriptionKey: string;
  /**
   * Listed only when declared. An image transport for the whole conversation
   * does not show whether the worker reads images, so a worker without it is
   * not missing anything.
   */
  onlyWhenDeclared?: boolean;
}

/** One name in a group, ready to show. */
export interface ChatCapabilityBadge {
  name: string;
  declared: boolean;
  /** Null for a name without a description on this site. */
  def: ChatCapabilityDef | null;
}

export interface ChatCapabilityGroup {
  id: ChatCapabilityGroupId;
  labelKey: string;
  /**
   * Set when the group label has an explanation, shown on hover, tap or
   * focus.
   */
  descriptionKey: string | null;
  badges: ChatCapabilityBadge[];
}

const feature = (
  name: string,
  group: ChatCapabilityGroupId,
): ChatCapabilityDef => ({
  name,
  source: 'feature',
  group,
  titleKey: `admin.workers.chat.feature.${name}.title`,
  descriptionKey: `admin.workers.chat.feature.${name}.description`,
});

const transport = (
  name: string,
  onlyWhenDeclared = false,
): ChatCapabilityDef => ({
  name,
  source: 'transport',
  group: 'images',
  titleKey: `admin.workers.chat.transport.${name}.title`,
  descriptionKey: `admin.workers.chat.transport.${name}.description`,
  onlyWhenDeclared,
});

/**
 * The features, guarantees and image transports defined by the chat
 * specification, in display order within each group. The descriptions come
 * from the specification's feature, guarantee and transport tables.
 */
export const CHAT_CAPABILITIES: readonly ChatCapabilityDef[] = [
  feature('seed', 'sampling'),
  feature('presence_penalty', 'sampling'),
  feature('frequency_penalty', 'sampling'),
  feature('reasoning_effort', 'sampling'),
  feature('vision', 'images'),
  transport('url'),
  transport('base64'),
  transport('messages_url', true),
  feature('tools', 'tools'),
  feature('tools_with_response_format', 'tools'),
  feature('json_object', 'format'),
  feature('json_schema', 'format'),
  feature('tool_choice_enforced', 'guarantees'),
  feature('single_tool_call_enforced', 'guarantees'),
  feature('structured_output_enforced', 'guarantees'),
  feature('prompt_overflow_refused', 'guarantees'),
];

const GROUPS: readonly {
  id: ChatCapabilityGroupId;
  descriptionKey: string | null;
}[] = [
  { id: 'sampling', descriptionKey: null },
  { id: 'images', descriptionKey: null },
  { id: 'tools', descriptionKey: null },
  { id: 'format', descriptionKey: null },
  {
    id: 'guarantees',
    descriptionKey: 'admin.workers.chat.group.guarantees_description',
  },
  { id: 'other', descriptionKey: null },
];

/**
 * Converts a declaration into groups of badges.
 *
 * With `showUndeclared`, every described name is listed and undeclared names
 * are marked, matching how the image worker card shows switched-off
 * capabilities. Without it, only declared names are listed. This is for
 * summaries over several workers, which list only what at least one worker
 * declared. A declared name without a description goes in the last group, so
 * names added by a newer horde are still shown. Empty groups are dropped.
 */
export function chatCapabilityGroups(
  features: readonly string[],
  transports: readonly string[] | null,
  showUndeclared: boolean,
): ChatCapabilityGroup[] {
  const declaredFeatures = new Set(features);
  const declaredTransports = new Set(transports ?? []);
  const isDeclared = (def: ChatCapabilityDef): boolean =>
    def.source === 'feature'
      ? declaredFeatures.has(def.name)
      : declaredTransports.has(def.name);

  const known = CHAT_CAPABILITIES.filter(
    (def) => transports !== null || def.source === 'feature',
  );
  const describedFeatures = new Set(
    CHAT_CAPABILITIES.filter((def) => def.source === 'feature').map(
      (def) => def.name,
    ),
  );
  const describedTransports = new Set(
    CHAT_CAPABILITIES.filter((def) => def.source === 'transport').map(
      (def) => def.name,
    ),
  );
  const unknown: ChatCapabilityBadge[] = [
    ...features.filter((name) => !describedFeatures.has(name)),
    ...(transports ?? []).filter((name) => !describedTransports.has(name)),
  ]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, declared: true, def: null }));

  return GROUPS.map((group) => ({
    id: group.id,
    labelKey: `admin.workers.chat.group.${group.id}`,
    descriptionKey: group.descriptionKey,
    badges:
      group.id === 'other'
        ? unknown
        : known
            .filter((def) => def.group === group.id)
            .map((def) => ({ name: def.name, declared: isDeclared(def), def }))
            .filter(
              (badge) =>
                badge.declared ||
                (showUndeclared && !badge.def.onlyWhenDeclared),
            ),
  })).filter((group) => group.badges.length > 0);
}

/**
 * Whether the worker reads images in chat messages. This requires `vision`
 * and an image transport (`url` or `base64`). `messages_url` sends the whole
 * conversation, so it does not count.
 */
export function chatReadsImages(chat: WorkerChatDeclaration): boolean {
  return (
    chat.features.includes('vision') &&
    (chat.image_transports.includes('url') ||
      chat.image_transports.includes('base64'))
  );
}

/** Whether a declaration offers the tools feature. */
export function chatHasTools(chat: WorkerChatDeclaration): boolean {
  return chat.features.includes('tools');
}

/** Whether a declaration constrains replies to a JSON schema. */
export function chatHasJsonSchema(chat: WorkerChatDeclaration): boolean {
  return chat.features.includes('json_schema');
}
