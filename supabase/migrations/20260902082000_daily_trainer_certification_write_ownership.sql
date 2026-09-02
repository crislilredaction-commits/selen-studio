-- Daily trainer certifications and their proof links are owned by the trainer.
-- Client managers and Studio staff keep consultation access only.

DROP POLICY IF EXISTS daily_trainer_certifications_staff_all
  ON public.daily_trainer_certifications;
DROP POLICY IF EXISTS daily_trainer_certifications_manager_insert
  ON public.daily_trainer_certifications;
DROP POLICY IF EXISTS daily_trainer_certifications_manager_update
  ON public.daily_trainer_certifications;
DROP POLICY IF EXISTS daily_trainer_certifications_manager_delete
  ON public.daily_trainer_certifications;

DROP POLICY IF EXISTS daily_trainer_certifications_staff_select
  ON public.daily_trainer_certifications;
CREATE POLICY daily_trainer_certifications_staff_select
  ON public.daily_trainer_certifications
  FOR SELECT
  TO authenticated
  USING (public.daily_is_selen_staff());

DROP POLICY IF EXISTS "Staff can manage Daily trainer document links"
  ON public.daily_trainer_profile_documents;
DROP POLICY IF EXISTS "Managers can manage organisation trainer document links"
  ON public.daily_trainer_profile_documents;

DROP POLICY IF EXISTS "Staff can read Daily trainer document links"
  ON public.daily_trainer_profile_documents;
CREATE POLICY "Staff can read Daily trainer document links"
  ON public.daily_trainer_profile_documents
  FOR SELECT
  TO authenticated
  USING (public.daily_is_selen_staff());

DROP POLICY IF EXISTS "Managers can read organisation trainer document links"
  ON public.daily_trainer_profile_documents;
CREATE POLICY "Managers can read organisation trainer document links"
  ON public.daily_trainer_profile_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.daily_trainer_profiles dtp
      WHERE dtp.id = daily_trainer_profile_documents.trainer_profile_id
        AND public.can_manage_daily_trainers(dtp.organisation_id)
    )
  );

CREATE OR REPLACE FUNCTION public.daily_guard_trainer_certification_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trainer_user_id uuid;
  request_user_id uuid := auth.uid();
BEGIN
  SELECT tp.user_id
  INTO trainer_user_id
  FROM public.daily_trainer_profiles tp
  WHERE tp.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.trainer_profile_id ELSE NEW.trainer_profile_id END;

  IF trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'trainer profile has no linked user';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF request_user_id IS NOT NULL THEN
      IF request_user_id IS DISTINCT FROM trainer_user_id THEN
        RAISE EXCEPTION 'trainer certifications can only be created by the trainer';
      END IF;
    ELSIF NEW.created_by IS DISTINCT FROM trainer_user_id THEN
      RAISE EXCEPTION 'privileged trainer certification insert must preserve trainer ownership';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.trainer_profile_id IS DISTINCT FROM OLD.trainer_profile_id THEN
      RAISE EXCEPTION 'trainer certification ownership cannot be transferred';
    END IF;

    IF request_user_id IS NOT NULL THEN
      IF request_user_id IS DISTINCT FROM trainer_user_id THEN
        RAISE EXCEPTION 'trainer certifications can only be updated by the trainer';
      END IF;
    ELSIF NEW.updated_by IS DISTINCT FROM trainer_user_id THEN
      RAISE EXCEPTION 'privileged trainer certification update must preserve trainer ownership';
    END IF;
    RETURN NEW;
  END IF;

  IF request_user_id IS NULL OR request_user_id IS DISTINCT FROM trainer_user_id THEN
    RAISE EXCEPTION 'trainer certifications can only be deleted by the trainer';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.daily_guard_trainer_certification_self_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.daily_guard_trainer_certification_self_write() FROM anon;
REVOKE ALL ON FUNCTION public.daily_guard_trainer_certification_self_write() FROM authenticated;

DROP TRIGGER IF EXISTS daily_guard_trainer_certification_self_write
  ON public.daily_trainer_certifications;
CREATE TRIGGER daily_guard_trainer_certification_self_write
BEFORE INSERT OR UPDATE OR DELETE
ON public.daily_trainer_certifications
FOR EACH ROW
EXECUTE FUNCTION public.daily_guard_trainer_certification_self_write();
