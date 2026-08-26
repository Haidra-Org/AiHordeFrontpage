import { Domain, FunctionKind, ItemType, Platform } from './item-types';

export interface GuiItem {
  name: string;
  description: string;
  image?: string;
  link: string;
  sourceControlLink?: string;
  downloadButtonText?: string | null;
  categories: string[];
  itemType: ItemType;
  domain?: Domain[];
  functionKind: FunctionKind;
  platform?: Platform[];
  recommended?: boolean;
  easyToUse?: boolean;
  /** The entry is one of this site's own pages: it opens without an install. */
  onThisSite?: boolean;
  /** ISO date (YYYY-MM-DD) on which the entry was last checked. */
  lastVerified?: string;
}
