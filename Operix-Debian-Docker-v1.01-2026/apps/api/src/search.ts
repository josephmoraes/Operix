import type pg from 'pg';
import { z } from 'zod';
import type { Role } from './auth.js';

export const searchTypes = ['ticket', 'work_order', 'asset', 'item', 'person'] as const;
export type SearchType = typeof searchTypes[number];

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  types: z.string().optional().transform(value => {
    if (!value) return [...searchTypes];
    return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
  }).pipe(z.array(z.enum(searchTypes)).min(1)),
});

export type SearchResult = {
  type: SearchType;
  id: string;
  title: string;
  description: string;
  status: string | null;
  reference: string | null;
  url: string;
  score: number;
  occurredAt: string | null;
};

const technicalRoles: Role[] = ['TECHNICIAN', 'MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'];
const administrativeRoles: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export function searchableTypesForRole(role: Role): SearchType[] {
  if (administrativeRoles.includes(role)) return [...searchTypes];
  if (technicalRoles.includes(role)) return ['ticket', 'work_order', 'asset', 'item'];
  return ['ticket', 'work_order'];
}

export async function runSearch(
  client: pg.PoolClient,
  input: { tenantId: string; userId: string; role: Role; query: string; limit: number; types: SearchType[]; includeWeakMatches?: boolean },
): Promise<SearchResult[]> {
  const allowedTypes = searchableTypesForRole(input.role);
  const selectedTypes = input.types.filter(type => allowedTypes.includes(type));
  const canReadAllTickets = technicalRoles.includes(input.role);
  const canReadPeople = administrativeRoles.includes(input.role);

  if (!selectedTypes.length) return [];

  const result = await client.query<SearchResult>(`
    WITH viewer AS (
      SELECT person_id FROM users WHERE id = $2
    ), candidates AS (
      SELECT
        'ticket'::text AS type,
        t.id,
        concat('Chamado #', t.number, ' · ', t.title) AS title,
        concat_ws(' · ', t.description, s.name, t.category) AS description,
        t.status::text AS status,
        t.number::text AS reference,
        concat('/tickets/', t.id) AS url,
        t.requested_at AS "occurredAt",
        concat_ws(' ', t.number::text, t.title, t.description, t.category, t.requester_name, s.name) AS searchable
      FROM tickets t
      LEFT JOIN sectors s ON s.id = t.sector_id
      CROSS JOIN viewer v
      WHERE t.tenant_id = $1
        AND ($5::boolean OR t.requester_id = v.person_id)
        AND 'ticket' = ANY($6::text[])

      UNION ALL

      SELECT
        'work_order',
        w.id,
        concat('OS #', w.number, ' · ', coalesce(t.title, 'Ordem de serviço')),
        concat_ws(' · ', w.service_description, w.result, s.name, t.description),
        w.status,
        w.number::text,
        concat('/work-orders/', w.id),
        coalesce(w.finished_at, w.started_at, w.scheduled_for, t.requested_at),
        concat_ws(' ', w.number::text, w.kind::text, w.status, w.service_description, w.result, t.title, t.description, s.name)
      FROM work_orders w
      LEFT JOIN tickets t ON t.id = w.ticket_id
      LEFT JOIN sectors s ON s.id = t.sector_id
      CROSS JOIN viewer v
      WHERE w.tenant_id = $1
        AND ($5::boolean OR t.requester_id = v.person_id)
        AND 'work_order' = ANY($6::text[])

      UNION ALL

      SELECT
        'asset',
        a.id,
        concat(a.name, ' · ', a.tag),
        concat_ws(' · ', a.category, a.serial_number, s.name),
        a.status,
        a.tag,
        concat('/assets/', a.id),
        a.purchase_date::timestamptz,
        concat_ws(' ', a.tag, a.name, a.category, a.serial_number, a.status, s.name, a.metadata::text)
      FROM assets a
      LEFT JOIN sectors s ON s.id = a.sector_id
      WHERE a.tenant_id = $1
        AND $5::boolean
        AND 'asset' = ANY($6::text[])

      UNION ALL

      SELECT
        'item',
        i.id,
        concat(i.name, ' · ', i.sku),
        concat_ws(' · ', i.category, i.unit, CASE WHEN i.ca_number IS NOT NULL THEN concat('CA ', i.ca_number) END),
        CASE WHEN i.active THEN 'ACTIVE' ELSE 'INACTIVE' END,
        i.sku,
        concat('/warehouse/items/', i.id),
        NULL::timestamptz,
        concat_ws(' ', i.sku, i.name, i.category, i.unit, i.ca_number)
      FROM items i
      WHERE i.tenant_id = $1
        AND $5::boolean
        AND 'item' = ANY($6::text[])

      UNION ALL

      SELECT
        'person',
        p.id,
        p.full_name,
        concat_ws(' · ', s.name, p.email, p.phone, p.extension),
        CASE WHEN p.active THEN 'ACTIVE' ELSE 'INACTIVE' END,
        NULL,
        concat('/admin/people/', p.id),
        p.created_at,
        concat_ws(' ', p.full_name, p.email, p.phone, p.extension, s.name)
      FROM people p
      LEFT JOIN sectors s ON s.id = p.sector_id
      WHERE p.tenant_id = $1
        AND $7::boolean
        AND 'person' = ANY($6::text[])
    ), ranked AS (
      SELECT
        type, id, title, description, status, reference, url, "occurredAt",
        greatest(
          similarity(lower(searchable), lower($3)),
          ts_rank_cd(to_tsvector('portuguese', searchable), plainto_tsquery('portuguese', $3)),
          CASE WHEN lower(searchable) LIKE '%' || lower($3) || '%' THEN 0.75 ELSE 0 END
        )::float AS score
      FROM candidates
    )
    SELECT type, id, title, description, status, reference, url, score, "occurredAt"
    FROM ranked
    WHERE ($8::boolean OR score >= 0.08)
    ORDER BY score DESC, "occurredAt" DESC NULLS LAST
    LIMIT $4
  `, [input.tenantId, input.userId, input.query, input.limit, canReadAllTickets, selectedTypes, canReadPeople, input.includeWeakMatches ?? false]);

  return result.rows;
}
