export interface PrivacyPolicyItem {
  text: string;
  section: string;
  subsection: string | null;
  context?: Record<string, {
      valueType: 'date';
      value: string;
    }>;
}
