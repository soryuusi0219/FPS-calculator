export interface SourceRange { start: number; end: number }
export interface Diagnostic extends SourceRange { message: string }
export class SourceError extends Error {
  readonly start: number; readonly end: number;
  constructor(message: string, start: number, end: number) { super(message); this.start = start; this.end = end; }
}
export function diagnosticOf(error: unknown): Diagnostic | undefined {
  return error instanceof SourceError ? { start: error.start, end: error.end, message: error.message } : undefined;
}
