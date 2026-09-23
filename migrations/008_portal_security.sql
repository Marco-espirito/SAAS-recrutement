CREATE OR REPLACE FUNCTION resolve_client_portal_organization(link_hash text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT organization_id FROM public.client_portal_links
  WHERE token_hash = link_hash AND revoked_at IS NULL AND expires_at > now()
  LIMIT 1
$$;
