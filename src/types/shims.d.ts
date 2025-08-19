// Temporary shims to silence TS7016 for external modules in environments
// where @types packages may not be picked up by the compiler.

// Minimal uuid type declaration
declare module 'uuid' {
  export function v4(): string;
}

// Minimal express type declaration supporting namespace import and basic types
declare module 'express' {
  // Expose minimal Request/Response types for typing handlers
  export interface Request {
    [key: string]: any;
  }
  export interface Response {
    [key: string]: any;
  }

  // Default export is the express factory function (treated as any here)
  const e: any;
  export = e;
}
