export type D1Adapter = {
  query<T>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  batch<T>(
    statements: { sql: string; params?: unknown[] }[]
  ): Promise<{ rows: T[] }[]>;
};

export function createD1Adapter(d1: D1Database): D1Adapter {
  return {
    async query<T>(
      sql: string,
      params?: unknown[]
    ): Promise<{ rows: T[]; rowCount: number }> {
      const stmt = d1.prepare(sql);
      const bound = params && params.length > 0 ? stmt.bind(...params) : stmt;
      const result = await bound.all<T>();
      const rows = result.results ?? [];
      return { rows, rowCount: rows.length };
    },
    async execute(sql: string, params?: unknown[]): Promise<{ changes: number }> {
      const stmt = d1.prepare(sql);
      const bound = params && params.length > 0 ? stmt.bind(...params) : stmt;
      const result = await bound.run();
      return { changes: result.meta?.changes ?? 0 };
    },
    async batch<T>(
      statements: { sql: string; params?: unknown[] }[]
    ): Promise<{ rows: T[] }[]> {
      const stmts = statements.map((statement) => {
        const stmt = d1.prepare(statement.sql);
        return statement.params && statement.params.length > 0
          ? stmt.bind(...statement.params)
          : stmt;
      });
      const results = await d1.batch<T>(stmts);
      return results.map((result) => ({ rows: result.results ?? [] }));
    }
  };
}
