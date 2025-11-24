declare module "sql.js" {
  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export interface Statement {
    bind(values: any[]): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(): Record<string, any>;
    run(values?: any[]): void;
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string): any;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
    Statement: Statement;
  }

  const initSqlJs: (config?: SqlJsConfig) => Promise<SqlJsStatic>;

  export default initSqlJs;
}
