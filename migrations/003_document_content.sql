CREATE TABLE IF NOT EXISTS document_blobs (
  document_id uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  content bytea NOT NULL
);

ALTER TABLE document_blobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_document_blobs ON document_blobs;
CREATE POLICY tenant_document_blobs ON document_blobs
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND d.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND d.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
);
