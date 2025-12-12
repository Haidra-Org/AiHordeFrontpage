import { FormControl, FormGroup } from '@angular/forms';

/**
 * Fields that support unlimited (-1) values.
 */
export type LimitField =
  | 'kudos'
  | 'expiry'
  | 'max_image_pixels'
  | 'max_image_steps'
  | 'max_text_tokens';

export const LIMIT_FIELDS: readonly LimitField[] = [
  'kudos',
  'expiry',
  'max_image_pixels',
  'max_image_steps',
  'max_text_tokens',
] as const;

/**
 * Form value structure for shared key create/edit forms.
 */
export interface SharedKeyFormValue {
  name: string;
  kudos: number;
  kudos_unlimited: boolean;
  expiry: number;
  expiry_unlimited: boolean;
  max_image_pixels: number;
  max_image_pixels_unlimited: boolean;
  max_image_steps: number;
  max_image_steps_unlimited: boolean;
  max_text_tokens: number;
  max_text_tokens_unlimited: boolean;
}

/**
 * Typed form controls matching SharedKeyFormValue.
 */
export type SharedKeyFormControls = {
  [K in keyof SharedKeyFormValue]: FormControl<SharedKeyFormValue[K]>;
};

/**
 * Typed FormGroup for shared key forms.
 */
export type SharedKeyFormGroup = FormGroup<SharedKeyFormControls>;

/**
 * Default form values for creating a new shared key.
 */
export const SHARED_KEY_DEFAULTS: SharedKeyFormValue = {
  name: '',
  kudos: 5000,
  kudos_unlimited: false,
  expiry: -1,
  expiry_unlimited: true,
  max_image_pixels: -1,
  max_image_pixels_unlimited: true,
  max_image_steps: -1,
  max_image_steps_unlimited: true,
  max_text_tokens: -1,
  max_text_tokens_unlimited: true,
};

/**
 * Fallback finite values for each limit field when toggling off "unlimited".
 */
export const FINITE_FALLBACKS: Record<LimitField, number> = {
  kudos: 5000,
  expiry: 30,
  max_image_pixels: 1_048_576,
  max_image_steps: 30,
  max_text_tokens: 256,
};

/**
 * Common image pixel presets for quick selection.
 */
export const IMAGE_PIXEL_PRESETS: readonly { label: string; value: number }[] =
  [
    { label: '512 x 512', value: 262144 },
    { label: '768 x 768', value: 589824 },
    { label: '1024 x 1024', value: 1048576 },
  ] as const;
