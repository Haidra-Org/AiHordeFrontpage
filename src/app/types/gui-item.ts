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
}
