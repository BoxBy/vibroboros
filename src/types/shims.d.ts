// Temporary shims to silence TS7016 for external modules in environments
// where @types packages may not be picked up by the compiler.
// Minimal uuid type declaration
declare module 'uuid' {
	export function v4(): string;
}
