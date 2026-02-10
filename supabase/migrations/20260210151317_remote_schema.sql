drop extension if exists "pg_net";

drop policy "Admins can manage organization users" on "public"."user_organizations";

drop policy "Admins can manage projects in their organizations" on "public"."projects";

alter table "public"."user_organizations" add column "is_owner" boolean default false;

alter table "public"."merge_events" add constraint "merge_events_source_organization_id_fkey" FOREIGN KEY (source_organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."merge_events" validate constraint "merge_events_source_organization_id_fkey";

alter table "public"."merge_events" add constraint "merge_events_target_organization_id_fkey" FOREIGN KEY (target_organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."merge_events" validate constraint "merge_events_target_organization_id_fkey";

alter table "public"."profiles" add constraint "valid_theme_preset" CHECK ((theme_preset = ANY (ARRAY['dark'::text, 'light'::text, 'liquid-glass'::text]))) not valid;

alter table "public"."profiles" validate constraint "valid_theme_preset";


  create policy "Admins can manage projects in their organizations"
  on "public"."projects"
  as permissive
  for all
  to public
using (((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])) OR public.is_super_admin()));


CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


