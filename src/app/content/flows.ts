import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
} from '../pages/generate/generate-form.model';
import { SectionId } from './sections';

/** What a step needs shown before it can point at anything. */
export interface FlowReveal {
  mode?: GenerateMode;
  sourceMode?: GenerateSourceMode;
}

/**
 * One step of a flow.
 *
 * A step is read twice: down the spine of the worked example's page, where only
 * its id and its prose matter, and inside the follow-along pane, where the rest
 * of it says what the step points at and what pressing Apply writes. Both read
 * this one list, so a technique cannot come to be explained in an order the
 * walkthrough does not follow.
 */
export interface FlowStep {
  /** Suffix of the step's i18n keys, and of nothing else. */
  id: string;
  /**
   * The {@link TutorialAnchorService} id of the control this step is about.
   * A step with none is read rather than performed, which is what a concept
   * track's steps are and what an unwired technique's steps are until they are
   * wired: {@link flowFollowable} tests exactly this.
   */
  anchorId?: string;
  /** The setting's `?` note to expand when the step becomes current. */
  helpTopic?: string;
  reveal?: FlowReveal;
  /**
   * The parameter-sweep strips this step is read against, if any are published
   * for it, stacked in the order they are written. On a technique they are the
   * setting the step names, shown changing because its value is a number the
   * reader has no intuition for. On a concept track they are the evidence the
   * step is about, which is why a track's strips are shown in every register
   * rather than only to a newcomer. A step naming none simply offers no images.
   *
   * More than one because a step can be about a pair of knobs rather than one:
   * the reader is being shown what "the knobs" are, and one strip would name
   * only half of them.
   */
  sweepParameters?: readonly string[];
  /**
   * The form fields this step's Apply writes, picked out of the committed
   * request rather than restated here, so a step can never set something the
   * example did not. Typed against the form, so a field that is renamed or
   * removed takes every step naming it with it.
   */
  applyFields?: readonly (keyof GenerateFormValue)[];
  /**
   * The flow this step offers to start instead of anything of its own. A step
   * that carries one is the end of a track that has taught an idea and has
   * somewhere to send the reader next; its button is labelled by the step's own
   * `.cta` key, so each track words the handoff in its own voice.
   */
  startsFlow?: string;
}

/** One technique or idea the Learn area teaches, and the steps it teaches it in. */
export interface FlowDef {
  id: string;
  /**
   * The panel area the flow's defining setting lives in, which is the mark and
   * hue it is read by. A flow whose subject belongs to no one card takes no mark
   * rather than a wrong one.
   */
  section?: SectionId;
  /**
   * True for a track that teaches an idea rather than a technique. There is no
   * committed request behind one: no example image, no manifest entry, and no
   * step that writes a field.
   */
  concept?: boolean;
  steps: readonly FlowStep[];
  /**
   * The technique that follows this one naturally, offered when the flow is
   * finished so a reader can chain lessons rather than return to the picker.
   * The last technique in the chain names none.
   */
  next?: string;
}

/**
 * Every flow, in the order the Learn area meets them.
 *
 * The eight techniques carry the step spine their worked example is read down.
 * A technique whose steps name no control yet is still a complete page: the
 * reader can see what it is made of and in what order, and the walkthrough
 * lights up on its own the moment those steps are wired to the panel.
 */
export const FLOWS: readonly FlowDef[] = [
  {
    id: 'txt2img',
    next: 'img2img',
    section: 'prompt',
    steps: [
      {
        // Both halves, because the payload carries them as one field and the
        // finale is a real generation: applying the description without the
        // negative it was written against would land the reader on a different
        // picture from the one the step is standing next to. An example with no
        // negative writes an empty one, which is what the form already holds.
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      { id: 'model', anchorId: 'model', applyFields: ['model'] },
      {
        // The panel sets width and height from one control (the size presets),
        // so this step writes the pair the reader would have set with one press.
        id: 'size',
        anchorId: 'size',
        applyFields: ['width', 'height'],
      },
      {
        id: 'steps',
        anchorId: 'steps',
        helpTopic: 'steps',
        sweepParameters: ['steps'],
        reveal: { mode: 'advanced' },
        applyFields: ['steps'],
      },
      {
        id: 'cfg',
        anchorId: 'cfg',
        helpTopic: 'cfg',
        sweepParameters: ['cfg_scale'],
        reveal: { mode: 'advanced' },
        applyFields: ['cfg_scale'],
      },
      {
        id: 'sampler',
        anchorId: 'sampler',
        helpTopic: 'sampler',
        reveal: { mode: 'advanced' },
        applyFields: ['sampler_name'],
      },
      {
        id: 'seed',
        anchorId: 'seed',
        helpTopic: 'seed',
        reveal: { mode: 'advanced' },
        applyFields: ['seed'],
      },
      // The finale offers nothing to apply: pressing Generate is the step.
      { id: 'generate', anchorId: 'generate' },
    ],
  },
  {
    id: 'img2img',
    next: 'inpainting',
    section: 'source',
    steps: [
      // The picture itself is the one thing a step cannot write: the form holds
      // a blob the reader attached, and the committed request carries only the
      // base64 the generator sent. So the source steps of all three sourced
      // flows point at the card and say what to put in it, and nothing else.
      {
        id: 'source',
        anchorId: 'source',
        helpTopic: 'source',
        reveal: { mode: 'advanced' },
      },
      {
        id: 'mode',
        anchorId: 'source_mode',
        reveal: { mode: 'advanced' },
        applyFields: ['sourceMode'],
      },
      {
        // The number is the whole technique, so the strip is offered here
        // rather than left to the settings reference.
        id: 'denoise',
        anchorId: 'denoise',
        helpTopic: 'denoise',
        sweepParameters: ['denoising_strength'],
        reveal: { mode: 'advanced', sourceMode: 'img2img' },
        applyFields: ['denoising_strength'],
      },
      {
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      {
        // This flow has no size step of its own: the size is not a choice here
        // but a consequence of the source, so it is set with the model that
        // wants it and the step's prose names both.
        id: 'model',
        anchorId: 'model',
        applyFields: ['model', 'width', 'height'],
      },
      { id: 'generate', anchorId: 'generate' },
    ],
  },
  {
    id: 'inpainting',
    next: 'controlnet',
    section: 'source',
    steps: [
      {
        id: 'source',
        anchorId: 'source',
        helpTopic: 'source',
        reveal: { mode: 'advanced' },
      },
      {
        id: 'mode',
        anchorId: 'source_mode',
        reveal: { mode: 'advanced' },
        applyFields: ['sourceMode'],
      },
      {
        // Painted rather than set: the mask is a canvas the reader draws on,
        // so this step points at the brush and writes nothing.
        id: 'mask',
        anchorId: 'mask',
        reveal: { mode: 'advanced', sourceMode: 'inpainting' },
      },
      {
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      {
        id: 'model',
        anchorId: 'model',
        applyFields: ['model', 'width', 'height'],
      },
      { id: 'generate', anchorId: 'generate' },
    ],
  },
  {
    id: 'controlnet',
    next: 'facefix',
    section: 'source',
    steps: [
      {
        id: 'source',
        anchorId: 'source',
        helpTopic: 'source',
        reveal: { mode: 'advanced' },
      },
      {
        id: 'mode',
        anchorId: 'source_mode',
        reveal: { mode: 'advanced' },
        applyFields: ['sourceMode'],
      },
      {
        id: 'control_type',
        anchorId: 'control_type',
        reveal: { mode: 'advanced', sourceMode: 'controlnet' },
        applyFields: ['control_type'],
      },
      {
        id: 'denoise',
        anchorId: 'denoise',
        helpTopic: 'denoise',
        reveal: { mode: 'advanced', sourceMode: 'controlnet' },
        applyFields: ['denoising_strength'],
      },
      {
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      { id: 'model', anchorId: 'model', applyFields: ['model'] },
      { id: 'size', anchorId: 'size', applyFields: ['width', 'height'] },
      { id: 'generate', anchorId: 'generate' },
    ],
  },
  {
    id: 'remix',
    section: 'source',
    steps: [
      {
        id: 'source',
        anchorId: 'source',
        helpTopic: 'source',
        reveal: { mode: 'advanced' },
      },
      {
        id: 'mode',
        anchorId: 'source_mode',
        reveal: { mode: 'advanced' },
        applyFields: ['sourceMode'],
      },
      {
        // The references are blobs with a weight each, and neither half of that
        // survives into the form value the steps read: `extra_source_images`
        // lives on the request alone. So this step points at the tiles and says
        // what to put in them, as the source step above it does.
        id: 'extras',
        anchorId: 'remix_extras',
        reveal: { mode: 'advanced', sourceMode: 'remix' },
      },
      {
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      {
        // As in img2img, the size follows the pictures rather than being a
        // choice, so it is written with the model the step names.
        id: 'model',
        anchorId: 'model',
        applyFields: ['model', 'width', 'height'],
      },
      { id: 'generate', anchorId: 'generate' },
    ],
  },
  {
    id: 'transparent',
    next: 'qr_code',
    section: 'workflows',
    steps: [
      {
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      {
        id: 'transparent',
        anchorId: 'transparent',
        helpTopic: 'transparent',
        reveal: { mode: 'advanced' },
        applyFields: ['transparent'],
      },
      { id: 'model', anchorId: 'model', applyFields: ['model'] },
      { id: 'size', anchorId: 'size', applyFields: ['width', 'height'] },
      { id: 'generate', anchorId: 'generate' },
    ],
  },
  {
    id: 'qr_code',
    next: 'remix',
    section: 'workflows',
    steps: [
      {
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      {
        // Typing into the QR field is what selects the workflow, so the text is
        // the whole of what this step writes.
        id: 'qr',
        anchorId: 'qr',
        helpTopic: 'qr',
        reveal: { mode: 'advanced' },
        applyFields: ['qrText'],
      },
      { id: 'model', anchorId: 'model', applyFields: ['model'] },
      { id: 'size', anchorId: 'size', applyFields: ['width', 'height'] },
      {
        // The four sampling values are one recipe here rather than four
        // choices: they were scan-tested together, and a code generated with
        // three of them does not read. They all live in the card this step
        // opens, and the prose names every one of them.
        id: 'cfg',
        anchorId: 'cfg',
        helpTopic: 'cfg',
        sweepParameters: ['cfg_scale'],
        reveal: { mode: 'advanced' },
        applyFields: ['cfg_scale', 'steps', 'sampler_name', 'scheduler'],
      },
      { id: 'generate', anchorId: 'generate' },
    ],
  },
  {
    id: 'facefix',
    next: 'transparent',
    section: 'finishing',
    steps: [
      {
        id: 'prompt',
        anchorId: 'prompt',
        applyFields: ['prompt', 'negativePrompt'],
      },
      { id: 'model', anchorId: 'model', applyFields: ['model'] },
      { id: 'size', anchorId: 'size', applyFields: ['width', 'height'] },
      // The first of two runs, which is the same request without the fixer:
      // there is nothing to write, and pressing Generate is the step.
      { id: 'generate_before', anchorId: 'generate' },
      {
        // The fixer and its strength are one choice: the strength row does not
        // exist until a fixer is picked, so a step that wrote only the fixer
        // would leave the reader to find a slider that had just appeared.
        id: 'facefixer',
        anchorId: 'facefixer',
        helpTopic: 'facefixer',
        reveal: { mode: 'advanced' },
        applyFields: ['post_processing', 'facefixer_strength'],
      },
      { id: 'regenerate', anchorId: 'generate' },
    ],
  },

  // The tracks that teach an idea rather than a technique. Neither points at a
  // field, so no step carries an anchor, an apply or a help topic: they are read
  // straight through, in whichever register suits.
  {
    // Read in the order the pictures make sense in rather than the order the
    // ideas were written in: the first step hands the reader a real render they
    // can scrub back to static, and every step after it points at something
    // they have already watched happen.
    id: 'concepts_images',
    concept: true,
    steps: [
      { id: 'noise_to_picture', sweepParameters: ['step_preview'] },
      { id: 'prompt_as_conditioning' },
      { id: 'what_a_model_is' },
      { id: 'the_knobs', sweepParameters: ['steps', 'cfg_scale'] },
      { id: 'why_it_differs', sweepParameters: ['seed'] },
      { id: 'try_it', startsFlow: 'txt2img' },
    ],
  },
  {
    id: 'concepts_horde',
    concept: true,
    steps: [
      { id: 'volunteers' },
      { id: 'lifecycle' },
      { id: 'kudos' },
      { id: 'trust_safety' },
      { id: 'waiting' },
      { id: 'where_next', startsFlow: 'txt2img' },
    ],
  },
  {
    // For a reader who already generates elsewhere, so it starts from what they
    // can already do rather than from what an image is: the vocabulary first,
    // then the three things the horde does differently, then where those three
    // change what they should expect of a result.
    id: 'concepts_migrating',
    concept: true,
    // A map rather than a lesson: the reader already knows the controls, so
    // each section answers one of their questions (where did my setting go,
    // what is different, what is not here) and the last one is a door.
    steps: [
      // The two controls that moved are the two the library has strips for,
      // so "same control, new place" is shown rather than asserted.
      {
        id: 'where_things_are',
        sweepParameters: ['hires_fix', 'clip_skip'],
      },
      { id: 'what_is_different', sweepParameters: ['seed'] },
      { id: 'what_is_not_here' },
      { id: 'try_it', startsFlow: 'txt2img' },
    ],
  },
];

const FLOW_BY_ID: ReadonlyMap<string, FlowDef> = new Map(
  FLOWS.map((flow) => [flow.id, flow]),
);

/** What is known about a flow, or undefined for an id nothing authors. */
export function flowDef(flowId: string): FlowDef | undefined {
  return FLOW_BY_ID.get(flowId);
}

/** A flow's steps, in the order both the page and the walkthrough read them. */
export function flowSteps(flowId: string): readonly FlowStep[] {
  return FLOW_BY_ID.get(flowId)?.steps ?? [];
}

/** The tracks that teach an idea rather than a technique. */
export const CONCEPT_FLOWS: readonly string[] = FLOWS.filter(
  (flow) => flow.concept,
).map((flow) => flow.id);

/** Whether a flow is a concept track rather than a worked technique. */
export function isConceptFlow(flowId: string | null): boolean {
  return flowId !== null && (FLOW_BY_ID.get(flowId)?.concept ?? false);
}

/**
 * Whether the follow-along pane can actually run a flow.
 *
 * A track is always followable: it is read rather than performed, so having
 * steps is all it needs. A technique is followable once its steps name the
 * controls they are about, which is the thing a walkthrough does that a page
 * cannot. This is derived rather than declared so a flow lights up the moment
 * it is wired, and can never claim to be ready before it is.
 */
export function flowFollowable(flowId: string): boolean {
  const flow = FLOW_BY_ID.get(flowId);
  if (!flow || flow.steps.length === 0) {
    return false;
  }
  return (
    flow.concept === true ||
    flow.steps.some((step) => step.anchorId !== undefined)
  );
}
