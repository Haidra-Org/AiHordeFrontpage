import { Domain, Platform, FunctionKind, ItemType } from './item-types';

export interface ToolItem {
  name: string;
  description: string;
  link: string;
  image?: string;
  categories: string[];
  hasFrontend?: boolean;
  itemType: ItemType;
  domain?: Domain[];
  platform?: Platform[];
  functionKind: FunctionKind;
  sourceControlLink?: string;
  downloadButtonText?: string | null;
  recommended?: boolean;
  /** The entry is one of this site's own pages: it opens without an install. */
  onThisSite?: boolean;
  /** ISO date (YYYY-MM-DD) on which the entry was last checked. */
  lastVerified?: string;
}
