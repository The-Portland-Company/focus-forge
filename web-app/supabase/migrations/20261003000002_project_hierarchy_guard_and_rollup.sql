-- P1.G1/G2: sub-project cycle guard + recursive project roll-up RPC.
-- Idempotent: safe to re-run.

-- 1. Cycle guard: a project can never become its own ancestor via parent_id.
CREATE OR REPLACE FUNCTION prevent_project_parent_cycle()
RETURNS TRIGGER AS $$
DECLARE
  current_id UUID;
  depth INTEGER := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'project % cannot be its own parent', NEW.id;
  END IF;

  current_id := NEW.parent_id;
  WHILE current_id IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 1000 THEN
      RAISE EXCEPTION 'project parent chain too deep (possible cycle) for %', NEW.id;
    END IF;
    IF current_id = NEW.id THEN
      RAISE EXCEPTION 'setting parent_id would create a cycle for project %', NEW.id;
    END IF;
    SELECT parent_id INTO current_id FROM projects WHERE id = current_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_project_parent_cycle ON projects;
CREATE TRIGGER trg_prevent_project_parent_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON projects
  FOR EACH ROW
  EXECUTE FUNCTION prevent_project_parent_cycle();

-- 2. Recursive project roll-up RPC: outstanding time/cost/task counts for a
-- project plus every descendant sub-project. Mirrors lib/rollup.ts's
-- rollupProjects() logic so client and DB agree; excludes completed tasks and
-- soft-deleted tasks/projects from the totals (but still counts them toward
-- completedTaskCount for progress).
CREATE OR REPLACE FUNCTION project_rollup(root_project_id UUID)
RETURNS TABLE (
  project_id UUID,
  own_time_estimate NUMERIC,
  own_cost NUMERIC,
  total_time_estimate NUMERIC,
  total_cost NUMERIC,
  task_count BIGINT,
  completed_task_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    SELECT p.id FROM projects p WHERE p.id = root_project_id
    UNION ALL
    SELECT p.id
    FROM projects p
    JOIN descendants d ON p.parent_id = d.id
  ),
  own AS (
    SELECT
      root_project_id AS pid,
      COALESCE(SUM(t.time_estimate) FILTER (WHERE t.completed IS NOT TRUE), 0)::numeric AS own_time,
      COALESCE(SUM(
        CASE WHEN t.is_supply AND t.completed IS NOT TRUE
          THEN COALESCE(t.supply_price, 0) * COALESCE(t.supply_quantity, 1)
          ELSE 0
        END
      ), 0) AS own_cost_val,
      COUNT(*) FILTER (WHERE t.deleted_at IS NULL) AS own_count,
      COUNT(*) FILTER (WHERE t.deleted_at IS NULL AND t.completed IS TRUE) AS own_completed
    FROM tasks t
    WHERE t.project_id = root_project_id AND t.deleted_at IS NULL
  ),
  total AS (
    SELECT
      COALESCE(SUM(t.time_estimate) FILTER (WHERE t.completed IS NOT TRUE), 0)::numeric AS total_time,
      COALESCE(SUM(
        CASE WHEN t.is_supply AND t.completed IS NOT TRUE
          THEN COALESCE(t.supply_price, 0) * COALESCE(t.supply_quantity, 1)
          ELSE 0
        END
      ), 0) AS total_cost_val,
      COUNT(*) FILTER (WHERE t.deleted_at IS NULL) AS total_count,
      COUNT(*) FILTER (WHERE t.deleted_at IS NULL AND t.completed IS TRUE) AS total_completed
    FROM tasks t
    JOIN descendants d ON t.project_id = d.id
    WHERE t.deleted_at IS NULL
  )
  SELECT
    root_project_id,
    own.own_time,
    own.own_cost_val,
    total.total_time,
    total.total_cost_val,
    total.total_count,
    total.total_completed
  FROM own, total;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION project_rollup(UUID) IS
  'Recursive outstanding time/cost + task counts for a project and all its descendant sub-projects. See lib/rollup.ts rollupProjects() for the equivalent in-memory logic.';
