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
}
