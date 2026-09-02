import { ImageGenerationRequest } from '../../types/generation';

/** A result action that changes the request being prepared in the control panel. */
export type ResultControlAction = 'variation' | 'source' | 'settings';

/** Everything the page needs to perform one guarded result action. */
export interface ResultControlActionRequest {
  action: ResultControlAction;
  localId: string;
  request?: ImageGenerationRequest;
  seed?: string | null;
  imageId?: string;
}
