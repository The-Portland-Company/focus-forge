-- Allow merge_events to reference org IDs even after org deletion
ALTER TABLE merge_events
  DROP CONSTRAINT IF EXISTS merge_events_source_organization_id_fkey;

ALTER TABLE merge_events
  DROP CONSTRAINT IF EXISTS merge_events_target_organization_id_fkey;
