import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OUTPAINT_ANCHORS,
  SOURCE_MODES,
} from './pages/generate/generate-form.model';

/**
 * Keeps the translation file and the code that reads it in step: nothing may ask
 * for a line that does not exist, and no line may sit in the file with nothing
 * asking for it.
 *
 * The scan is textual. It reads every template and every TypeScript file once and
 * never builds a component, so it stays cheap enough to run with the rest of the
 * suite. Commented-out markup is stripped first, so copy that is only reachable
 * from a parked block counts as unused, which is what we want to know.
 */

const SOURCE_DIR = 'src';
const TRANSLATIONS = 'src/assets/i18n/en.json';

/** A key is lowercase, dot-separated, and may carry hyphens after the first segment. */
const KEY_SHAPE = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_-]+)*$/;

/** Transloco's plural suffixes, which the caller never names in full. */
const PLURAL_SUFFIX = /^(.*)_(zero|one|two|few|many|other)$/;

/** Joins the two halves of an assembled key; no key or literal contains it. */
const SPLIT = '\u0000';

/**
 * The eight compass values the source editor offers for where the finger cursor
 * sits, mirrored from `SourceEditorComponent.pointerOffsetDirections`. The type
 * is private to the component, and importing the component here would pull in
 * Angular for a list of eight strings.
 */
const POINTER_OFFSET_DIRECTIONS = [
  'up',
  'up-right',
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
] as const;

/**
 * Keys built by appending a value from a fixed set to a stem. Enumerating them
 * here means the expansions are checked for real rather than waved through by the
 * stem rule below.
 */
const ENUMERATED_KEYS: readonly string[] = [
  ...SOURCE_MODES.map((mode) => `generate.source.mode_${mode}`),
  ...OUTPAINT_ANCHORS.map(
    (anchor) => `generate.source.outpaint_anchor_${anchor}`,
  ),
  ...POINTER_OFFSET_DIRECTIONS.map(
    (direction) => `generate.editor.pointer_offset_direction_${direction}`,
  ),
];

/**
 * References that resolve to nothing, so the reader sees the raw key where the
 * copy should be. Each is a defect in a page outside the studio and wants a copy
 * decision rather than a guess, so they are carried here until one is made. The
 * list may only shrink.
 */
const UNRESOLVED_ALLOWLIST: readonly string[] = [];

/**
 * Lines with nothing asking for them. Most are copy left behind by earlier
 * versions of the pages outside the studio; a few belong to work parked behind a
 * commented-out block. The list is a ledger of known debt rather than a licence:
 * it may shrink, and a line that appears in neither the code nor this list is a
 * genuine finding.
 */
const UNREFERENCED_ALLOWLIST: readonly string[] = [
  'docs.title',
  'docs.lead',
  'docs.area_image_hint',
  'docs.area_alchemy_hint',
  'docs.area_read',
  'generate.intro',
  'generate.source.brush_label',
  'generate.source.eraser_label',
  'generate.source.outpaint_anchor_label',
  'generate.editor.rotate',
  'generate.status.waiting',
  'generate.status.submitted',
  'generate.status.queued',
  'generate.status.processing',
  'generate.results.pending_heading',
  'generate.results.pending_empty',
  'generate.results.finished_heading',
  'generate.results.finished_empty',
  'generate.results.download_zip',
  'generate.results.no_images',
  'generate.results.kudos',
  'generate.panel.expand_label',
  'generate.panel.expand_more',
  'generate.panel.expand_less',
  'generate.learn.sheet_steps_label',
  'generate.learn.sheet_step',
  'generate.sweeps.badge_timeline_plain',
  'generate.sweeps.grid_cell',
  'generate.results.empty_invitation',
  'generate.results.copy_seed_disabled',
  'generate.results.load_settings',
  'generate.results.load',
  'generate.civitai.mature_note',
  'generate.civitai.details_action',
  'alchemy.api.response_heading',
  'alchemy.intro',
  'alchemy.request.heading',
  'alchemy.steps.submit',
  'alchemy.operations.hint',
  'alchemy.forms.analyze',
  'alchemy.forms.enhance',
  'alchemy.forms.enhance_title',
  'alchemy.forms.enhance_output',
  'alchemy.flow.hint',
  'alchemy.flow.jump',
  'alchemy.flow.view_results',
  'alchemy.submit.summary_empty',
  'alchemy.jobs.empty',
  'alchemy.crowd.queued',
  'alchemy.crowd.donate',
  'brand_subtitle',
  'service_description',
  'service_description.haidraLink',
  'service_description.serverLink',
  'more_information',
  'more_information.developerBlogLink',
  'more_information.discordLink',
  'pages_of_text',
  'stats.average_recent_performance_images.value',
  'stats.average_recent_performance_text.value',
  'stats.total_pixelsteps.value',
  'stats.total_tokens.value',
  'stats.total_images.value',
  'stats.total_texts.value',
  'stats.total_alchemy_processed.value',
  'stats.image_queue.value',
  'stats.text_queue.value',
  'stats.interrogation_queue.value',
  'Navigate to homepage',
  'guis.description.horde_ng',
  'guis.web',
  'guis.android',
  'guis.get',
  'guis.ios',
  'Get {name}',
  'guis.desktop',
  'guis_page.title',
  'guis_page.description',
  'guis_page.filter_type',
  'guis_page.filter_platform',
  'guis_page.all_types',
  'guis_page.all_platforms',
  'guis_page.no_results',
  'guis_and_tools_page.intro_guis_desc',
  'guis_and_tools_page.intro_workers_desc',
  'guis_and_tools_page.intro_tools_desc',
  'guis_and_tools_page.hide',
  'guis_and_tools_page.worker_cta_title',
  'guis_and_tools_page.worker_cta_description',
  'guis_and_tools_page.worker_cta_learn_more',
  'guis_and_tools_page.guis_section_title',
  'guis_and_tools_page.tools_section_title',
  'guis_and_tools.col_name',
  'guis_and_tools.col_action',
  'community.community',
  'tools_section_description',
  'view_all_guis_and_tools',
  'homepage.intro.cta.generate',
  'homepage.intro.cta.worker',
  'homepage.intro.cta.api',
  'homepage.intro.github_repo',
  'homepage.intro.haidra_site',
  'homepage_guis.description',
  'profile.api_key_placeholder',
  'profile.kudos',
  'profile.api_field',
  'profile.stats',
  'profile.images_generated',
  'profile.workers',
  'profile.concurrency',
  'profile.account_settings',
  'profile.usage_multiplier',
  'profile.worker_invites',
  'profile.public_workers',
  'profile.filtered',
  'profile.vpn_access',
  'profile.worker_count',
  'profile.proxy_passkey',
  'profile.value_yes',
  'profile.value_no',
  'profile.not_available',
  'profile.coming_soon',
  'profile.shared_keys.actions',
  'profile.shared_keys.id',
  'profile.delete_account_error',
  'profile.undelete_account_error',
  'profile.profile_update_error',
  'profile.generated_mps_tokens',
  'details.models.coming_soon',
  'details.models.total_workers',
  'details.models.sort_by',
  'details.models.sort.workers',
  'details.models.sort.queued',
  'details.models.sort.jobs',
  'details.models.sort.eta',
  'details.models.online',
  'details.usage.coming_soon',
  'details.usage.images_per_second',
  'details.usage.tokens_per_second',
  'details.usage.tokens',
  'details.usage.images',
  'details.usage.requests',
  'details.usage.rank',
  'admin.nav.back_to_site',
  'admin.dashboard.your_stats',
  'admin.dashboard.kudos_balance',
  'admin.dashboard.images_requested',
  'admin.dashboard.images_generated',
  'admin.dashboard.worker_count',
  'admin.dashboard.account_age',
  'admin.workers.type',
  'admin.workers.card.model_loaded',
  'admin.workers.action.set_maintenance',
  'admin.workers.action.unset_maintenance',
  'admin.workers.action.set_paused',
  'admin.workers.action.unset_paused',
  'admin.workers.button.models',
  'admin.workers.action.delete',
  'admin.users.field.username',
  'admin.users.action.enable_vpn',
  'admin.users.action.disable_vpn',
  'admin.users.action.reset_suspicion',
  'admin.users.dialog.enable_vpn_title',
  'admin.users.dialog.disable_vpn_title',
  'admin.users.success',
  'admin.users.desc.worker_count',
  'admin.users.desc.evaluating_kudos',
  'admin.users.desc.kudos',
  'admin.users.desc.suspicious',
  'admin.users.section.ratings',
  'admin.users.styles.name',
  'admin.users.styles.id',
  'admin.users.styles.example_prompt',
  'admin.users.shared_keys.id',
  'admin.users.shared_keys.permissions',
  'admin.users.shared_keys.utilization',
  'admin.users.shared_keys.kudos',
  'admin.users.shared_keys.max_image_pixels',
  'admin.users.shared_keys.max_image_steps',
  'admin.users.shared_keys.max_text_tokens',
  'admin.users.shared_keys.expiry',
  'admin.users.shared_keys.never',
  'admin.users.warning.deleted',
  'admin.users.undelete_success',
  'admin.users.undelete_error',
  'admin.common.yes',
  'admin.common.no',
  'admin.common.true',
  'admin.common.false',
  'admin.common.error',
  'admin.common.access_denied_message',
  'admin.operations.add_ip.ip_hint',
  'details.leaderboard.top_contributors',
  'details.leaderboard.combined_kudos',
  'styles.previous',
  'styles.next',
  'styles.page',
  'styles.description',
  'styles.view_details',
  'styles.filters.sort',
  'styles.form.info',
  'styles.form.info_placeholder',
  'styles.form.prompt_placeholder',
  'styles.form.public_help',
  'styles.form.nsfw_help',
  'styles.form.sharedkey',
  'styles.form.sharedkey_placeholder',
  'styles.form.image_params',
  'styles.form.loras_json',
  'styles.form.loras_json_placeholder',
  'styles.form.tis_json',
  'styles.form.tis_json_placeholder',
  'styles.form.text_params',
  'styles.form.examples',
  'styles.form.example_url',
  'styles.form.example_url_placeholder',
  'styles.form.add_example',
  'styles.form.remove_example',
  'styles.form.set_primary',
  'styles.form.json_view',
  'styles.form.json_view_help',
  'styles.form.json_invalid',
  'styles.form.creating',
  'profile.teams.loading',
  'profile.teams.create',
  'profile.teams.create_disabled_tooltip',
  'profile.teams.none_created',
  'profile.teams.none_worker',
  'profile.teams.your_created',
  'profile.teams.worker_teams',
  'profile.teams.browse_all',
  'profile.teams.dialog.create_title',
  'profile.teams.dialog.edit_title',
  'profile.teams.dialog.delete_title',
  'profile.teams.dialog.name',
  'profile.teams.dialog.name_placeholder',
  'profile.teams.dialog.info',
  'profile.teams.dialog.info_placeholder',
  'profile.teams.dialog.delete_confirm',
  'profile.teams.dialog.cancel',
  'profile.teams.dialog.create',
  'profile.teams.dialog.save',
  'profile.teams.dialog.delete',
  'profile.teams.dialog.creating',
  'profile.teams.dialog.saving',
  'profile.teams.dialog.deleting',
  'profile.teams.card.workers',
  'profile.teams.card.kudos',
  'profile.teams.card.edit',
  'profile.teams.card.delete',
  'details.teams.card.workers',
  'details.teams.card.kudos',
  'details.teams.card.created_by',
  'details.teams.detail.loading',
  'details.teams.detail.back',
  'details.teams.detail.not_found',
  'details.teams.detail.workers',
  'details.teams.detail.kudos',
  'details.teams.detail.requests',
  'details.teams.detail.uptime',
  'details.teams.detail.created_by',
  'details.teams.detail.info',
  'details.teams.detail.team_workers',
  'details.teams.detail.no_workers',
  'details.teams.detail.models',
  'details.teams.detail.no_models',
  'details.teams.detail.worker.online',
  'details.teams.detail.worker.offline',
  'details.teams.detail.worker.threads',
  'details.teams.detail.worker.performance',
  'details.teams.detail.model.count',
  'admin.workers.card.change_team',
  'admin.workers.button.team',
  'admin.workers.dialog.team_select_placeholder',
  'admin.workers.dialog.team_none',
  'details.users.description',
  'details.users.browse_title',
  'details.users.loading',
  'details.users.error_title',
  'details.users.kudos',
  'details.users.worker_count',
  'details.users.account_age',
  'details.users.contributions',
  'details.workers.lookup.label',
  'details.workers.lookup.placeholder',
  'details.workers.lookup.hint',
  'details.models.lookup.label',
  'details.models.lookup.placeholder',
  'details.models.lookup.hint',
  'breadcrumb.details',
  'breadcrumb.workers',
  'breadcrumb.users',
  'breadcrumb.models',
  'breadcrumb.teams',
  'breadcrumb.styles',
  'joining.title',
  'joining.subtitle',
  'joining.mission.title',
  'joining.mission.description',
  'joining.mission.always_free',
  'joining.mission.non_profit',
  'joining.mission.open_source',
  'joining.why_workers.title',
  'joining.why_workers.description',
  'joining.why_workers.faq_link',
  'joining.worker_types.title',
  'joining.worker_types.recommended_software',
  'joining.worker_types.compatible_backends',
  'joining.worker_types.image.title',
  'joining.worker_types.image.description',
  'joining.worker_types.image.regen_desc',
  'joining.worker_types.text.title',
  'joining.worker_types.text.description',
  'joining.worker_types.text.koboldcpp_desc',
  'joining.worker_types.text.aphrodite_desc',
  'joining.worker_types.text.bridge_note_title',
  'joining.worker_types.text.bridge_note',
  'joining.benefits.title',
  'joining.benefits.earn_kudos.title',
  'joining.benefits.earn_kudos.description',
  'joining.benefits.earn_kudos.faq_link',
  'joining.benefits.community.title',
  'joining.benefits.community.description',
  'joining.benefits.utilize_idle.title',
  'joining.benefits.utilize_idle.description',
  'joining.getting_started.title',
  'joining.getting_started.step1.title',
  'joining.getting_started.step1.description',
  'joining.getting_started.step2.title',
  'joining.getting_started.step2.description',
  'joining.getting_started.step3.title',
  'joining.getting_started.step3.description',
  'joining.getting_started.step4.title',
  'joining.getting_started.step4.description',
  'joining.cta.title',
  'joining.cta.description',
  'joining.cta.join_discord',
  'joining.cta.view_github',
  'joining.alternative_support.title',
  'joining.alternative_support.description',
  'joining.alternative_support.link',
  'contribute.tabs.joining',
  'workers.stats.failed_jobs',
  'workers.stats.cta_link',
  'donate.ways_to_donate.kofi.title',
  'donate.ways_to_donate.kofi.description',
  'donate.transparency.non_profit',
  'donate.transparency.volunteer_run',
  'donate.transparency.open_source',
  'help.workers.tooltip.worker_id',
  'help.workers.tooltip.bridge_agent',
  'help.workers.tooltip.threads',
  'help.workers.tooltip.models_loaded',
  'help.workers.tooltip.img2img',
  'help.workers.tooltip.inpainting',
  'help.workers.tooltip.post_processing',
  'help.workers.tooltip.lora',
  'help.workers.tooltip.controlnet',
  'help.workers.tooltip.sdxl_controlnet',
  'help.workers.tooltip.nsfw',
  'help.workers.tooltip.paused',
  'help.workers.tooltip.flagged',
  'help.workers.tooltip.trusted',
  'help.stats.tooltip.queued_work',
  'help.stats.tooltip.worker_count',
  'help.glossary.page.workers.icon_type_image.description',
  'help.glossary.page.workers.icon_type_text.description',
  'help.glossary.page.workers.icon_type_interrogation.description',
  'homepage.hero_cta',
  'nav.contribute',
];

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

/** Drops commented-out markup and code so parked copy does not read as live. */
function stripComments(text: string, isTemplate: boolean): string {
  const withoutMarkup = text.replace(/<!--[\s\S]*?-->/g, ' ');
  if (isTemplate) return withoutMarkup;
  return withoutMarkup
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

function collectSources(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, out);
      continue;
    }
    if (entry.name.endsWith('.spec.ts')) continue;
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.html')) continue;
    out.push({
      path: full,
      text: stripComments(
        readFileSync(full, 'utf8'),
        entry.name.endsWith('.html'),
      ),
    });
  }
  return out;
}

const translations = JSON.parse(readFileSync(TRANSLATIONS, 'utf8')) as Record<
  string,
  string
>;
const allKeys = Object.keys(translations);
const namespaces = new Set(allKeys.map((key) => key.split('.')[0]));
const sources = collectSources(SOURCE_DIR);

/** Keys named outright, which must resolve. */
const named = new Map<string, string>();
/** Keys named as data rather than as a call, which only prove a line is in use. */
const mentioned = new Set<string>();
/** Stem and tail pairs for keys assembled at runtime. */
const assembled = new Set<string>();

function remember(key: string, path: string): void {
  if (!named.has(key)) named.set(key, path);
}

function isStemShaped(value: string): boolean {
  return (
    /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)*[._]$/.test(value) &&
    namespaces.has(value.split('.')[0])
  );
}

function rememberAssembled(stem: string, tail: string): void {
  if (!KEY_SHAPE.test(stem.replace(/[._]$/, ''))) return;
  if (!namespaces.has(stem.split('.')[0])) return;
  assembled.add(`${stem}${SPLIT}${tail}`);
}

for (const { path, text } of sources) {
  for (const match of text.matchAll(
    /['"`]([^'"`\n${}]+)['"`]\s*\|\s*transloco/g,
  )) {
    if (KEY_SHAPE.test(match[1])) remember(match[1], path);
  }
  for (const match of text.matchAll(
    /(?:translate|selectTranslate|translateObject)\(\s*['"`]([^'"`\n${}]+)['"`]/g,
  )) {
    if (KEY_SHAPE.test(match[1])) remember(match[1], path);
  }
  // Key constants handed to transloco through an object, as the lint and
  // feasibility messages do: `{ key: 'generate.lint.…', params }`.
  for (const match of text.matchAll(
    /\b[a-zA-Z]*[kK]ey\s*:\s*['"`]([^'"`\n${}]+)['"`]/g,
  )) {
    const value = match[1];
    if (
      KEY_SHAPE.test(value) &&
      value.includes('.') &&
      namespaces.has(value.split('.')[0])
    ) {
      remember(value, path);
    }
  }
  for (const match of text.matchAll(/['"`]([^'"`\n${}]+)['"`]/g)) {
    const value = match[1];
    if (KEY_SHAPE.test(value) && namespaces.has(value.split('.')[0])) {
      mentioned.add(value);
    }
    // A literal that stops at a segment or word break is a stem some other line
    // completes, whether by concatenation here or through a named constant.
    if (isStemShaped(value)) rememberAssembled(value, '');
  }
  // 'generate.source.mode_' + mode, optionally closed by a literal tail.
  for (const match of text.matchAll(
    /['"]([^'"\n]*)['"]\s*\+\s*[^'"\n+]+(?:\+\s*['"]([^'"\n]*)['"])?/g,
  )) {
    rememberAssembled(match[1], match[2] ?? '');
  }
  // `generate.learn.world.${id}` and the same shape with a tail.
  for (const match of text.matchAll(/`([^`\n$]*)\$\{[^`]*?\}([^`\n$]*)`/g)) {
    rememberAssembled(match[1], match[2]);
  }
}

const assembledPairs = [...assembled].map(
  (entry) => entry.split(SPLIT) as [string, string],
);
const referenced = new Set([...named.keys(), ...mentioned, ...ENUMERATED_KEYS]);

function isReferenced(key: string): boolean {
  if (referenced.has(key)) return true;
  const fits = assembledPairs.some(
    ([stem, tail]) =>
      key.length >= stem.length + tail.length &&
      key.startsWith(stem) &&
      key.endsWith(tail),
  );
  if (fits) return true;
  const plural = PLURAL_SUFFIX.exec(key);
  return plural !== null && isReferenced(plural[1]);
}

describe('translation coverage', () => {
  it('resolves every key the code names', () => {
    const known = new Set(UNRESOLVED_ALLOWLIST);
    const unresolved = [...named.entries()]
      .filter(([key]) => !known.has(key) && !(key in translations))
      .map(([key, path]) => `${key} (${path})`)
      .sort();

    expect(unresolved).toEqual([]);
  });

  it('keeps the unresolved list free of keys that now resolve', () => {
    expect(UNRESOLVED_ALLOWLIST.filter((key) => key in translations)).toEqual(
      [],
    );
  });

  it('resolves every key built from a fixed set of values', () => {
    expect(ENUMERATED_KEYS.filter((key) => !(key in translations))).toEqual([]);
  });

  it('has something asking for every line in the file', () => {
    const allowed = new Set(UNREFERENCED_ALLOWLIST);
    const unreferenced = allKeys.filter(
      (key) => !allowed.has(key) && !isReferenced(key),
    );

    expect(unreferenced).toEqual([]);
  });

  it('keeps the allowlist free of lines that are now in use', () => {
    expect(UNREFERENCED_ALLOWLIST.filter((key) => isReferenced(key))).toEqual(
      [],
    );
  });

  it('keeps the allowlist free of lines that have been removed', () => {
    expect(
      UNREFERENCED_ALLOWLIST.filter((key) => !(key in translations)),
    ).toEqual([]);
  });
});
