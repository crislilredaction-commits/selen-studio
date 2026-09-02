-- Daily trainer certifications are owned by the trainer.
-- Studio agents remain readers/validators of the trainer profile, but must not
-- mutate certifications or proof links on behalf of the trainer.

DROP POLICY IF EXISTS daily_trainer_certifications_staff_all
  ON public.daily_trainer_certifications;

DROP POLICY IF EXISTS daily_trainer_certifications_staff_select
  ON public.daily_trainer_certifications;
CREATE POLICY daily_trainer_certifications_staff_select
  ON public.daily_trainer_certifications
  FOR SELECT
  TO authenticated
  USING (public.is_daily_staff());

DROP POLICY IF EXISTS daily_trainer_profile_documents_agent_manage_all
  ON public.daily_trainer_profile_documents;

DROP POLICY IF EXISTS daily_trainer_profile_documents_agent_select
  ON public.daily_trainer_profile_documents;
CREATE POLICY daily_trainer_profile_documents_agent_select
  ON public.daily_trainer_profile_documents
  FOR SELECT
  TO authenticated
  USING (public.is_selen_agent());

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
