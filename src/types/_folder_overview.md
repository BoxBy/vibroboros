# Folder: src/types

## Role
This directory holds global TypeScript type definitions (`.d.ts` files) and shims. These files help the TypeScript compiler understand the shape of objects or modules that don't have explicit types, such as external libraries or environment-specific features.

## File Breakdown
- **`shims.d.ts`**: Provides type definitions for modules or global variables that are not automatically recognized by TypeScript. This could include shims for browser APIs, Node.js modules, or custom file types.

## AI Reading Guide
- Check this folder if you encounter TypeScript errors related to missing type definitions for global or imported modules.
- Add new `.d.ts` files here for any new broad, project-wide type declarations.
