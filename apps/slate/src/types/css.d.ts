/**
 * Metro handles `.css` side-effect imports on the web build and strips them
 * on native. TypeScript has no concept of either, so it needs the module
 * shape declared explicitly.
 */
declare module '*.css';
