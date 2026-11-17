// Converting values that come back from Supabase

// Postgres numeric/bigint values can arrive as strings; null means "no data"
export function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
