/**
 * `node:sqlite`（Node 22 の組み込み SQLite）は @types/node 20 に型が無いため、
 * 使っている範囲だけ最小限に宣言する。ネイティブ依存を増やさないための選択。
 */
declare module "node:sqlite" {
  export type SqliteValue = string | number | bigint | null | Uint8Array;

  export interface StatementResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Statement {
    run(...params: SqliteValue[]): StatementResult;
    get(...params: SqliteValue[]): Record<string, unknown> | undefined;
    all(...params: SqliteValue[]): Record<string, unknown>[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}
