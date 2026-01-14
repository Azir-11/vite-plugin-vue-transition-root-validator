export type Severity = 'error' | 'warning';

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  suggestion?: string;
  severity: Severity;
}

export type Lang = 'en' | 'zh';
