WITH ranked_memberships AS (
  SELECT
    uo.organization_id,
    uo.user_id,
    ROW_NUMBER() OVER (
      PARTITION BY uo.organization_id
      ORDER BY uo.created_at ASC, uo.user_id ASC
    ) AS membership_rank
  FROM public.user_organizations uo
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_organizations existing_owner
    WHERE existing_owner.organization_id = uo.organization_id
      AND existing_owner.is_owner = TRUE
  )
)
UPDATE public.user_organizations uo
SET is_owner = TRUE
FROM ranked_memberships ranked
WHERE uo.organization_id = ranked.organization_id
  AND uo.user_id = ranked.user_id
  AND ranked.membership_rank = 1;
