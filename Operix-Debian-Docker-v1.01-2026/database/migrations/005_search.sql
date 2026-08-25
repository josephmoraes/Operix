CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS tickets_search_trgm_idx
  ON tickets USING gin ((coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(requester_name,'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS work_orders_search_trgm_idx
  ON work_orders USING gin ((coalesce(service_description,'') || ' ' || coalesce(result,'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS assets_search_trgm_idx
  ON assets USING gin ((coalesce(tag,'') || ' ' || coalesce(name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(serial_number,'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS items_search_trgm_idx
  ON items USING gin ((coalesce(sku,'') || ' ' || coalesce(name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(ca_number,'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS people_search_trgm_idx
  ON people USING gin ((coalesce(full_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'')) gin_trgm_ops);
