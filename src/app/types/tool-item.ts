import { Domain, Platform, FunctionType } from './item-types';

export interface ToolItem {
  name: string;
  description: string;
  link: string;
  category: string; // Legacy field - kept for backward compatibility
  image?: string;
  categories?: string[];
  hasFrontend?: boolean;
  // Enhanced explicit properties
  domain?: Domain;
  platform?: Platform[];
  functionType?: FunctionType;
}
