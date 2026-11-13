// The one ambient global the shared package may use (Pitch 21b spec RD-7).
// `process.env.NODE_ENV` is a build-time constant that every consumer inlines:
// Next.js, Jest (sets "test"), and Metro through babel-preset-expo. Declaring
// only this, instead of loading Node's types, keeps every other Node global out
// of shared code; the workspace check (rule B3e) rejects any other `process`
// use. Not referenced by web code, so it never meets @types/node.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
