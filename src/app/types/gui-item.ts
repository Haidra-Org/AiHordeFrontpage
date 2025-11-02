import { Domain, Platform } from './item-types';

export interface GuiItem {
  name: string;
  description: string;
  image: string;
  link: string;
  downloadButtonText?: string | null;
  categories: string | string[];
  // New explicit properties to eliminate magic string inference
  domain?: Domain;
  platform?: Platform[];
}
