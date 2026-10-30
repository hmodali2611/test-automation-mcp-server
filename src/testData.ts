import { readFileSync } from 'node:fs';

type Record_ = Record<string, unknown>;

/**
 * Look up test data (accounts, products, cards...) from a JSON file shaped like
 * { "users": [ ... ], "products": [ ... ] }. Filters match on exact field values.
 */
export function queryTestData(file: string, entity: string, filter: Record<string, string> = {}, limit = 10) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record_[]>;
  const rows = data[entity];
  if (!rows) throw new Error(`Unknown entity "${entity}". Available: ${Object.keys(data).join(', ')}`);
  const matches = rows.filter((row) => Object.entries(filter).every(([k, v]) => String(row[k]) === v));
  return { entity, total: matches.length, rows: matches.slice(0, limit) };
}

export function listEntities(file: string): string[] {
  return Object.keys(JSON.parse(readFileSync(file, 'utf8')));
}
