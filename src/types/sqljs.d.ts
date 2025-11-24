declare module "sql.js" {
  import { SqlJsConfig, SqlJsStatic, Database, Statement } from "sql.js/types";
  const initSqlJs: (config?: any) => Promise<any>;
  export default initSqlJs;
  export { Database };
}
