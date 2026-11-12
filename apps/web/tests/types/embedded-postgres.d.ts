// Minimal ambient declaration for embedded-postgres (its package.json exposes
// no `types` condition, so TS cannot resolve the shipped declarations under the
// test tsconfig). Only the surface the test harness uses is declared.
declare module "embedded-postgres" {
  interface EmbeddedPostgresOptions {
    databaseDir: string;
    user: string;
    password: string;
    port: number;
    persistent?: boolean;
  }

  export default class EmbeddedPostgres {
    constructor(options: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
  }
}
