-- Paid admission remains disabled until trusted quote production and 0446
-- atomic authority rechecks are implemented. Own-report connection only.
-- No grants are created by login/read/quote. app_users is the personal account
-- namespace; business_id is a report subject, never proof of company ownership.
CREATE TABLE IF NOT EXISTS public.reanalysis_report_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site text NOT NULL CHECK (site IN ('blockid.au','startupvalueindex.com')),
  owned_analysis_id uuid REFERENCES public.analyses(id) ON DELETE CASCADE,
  report_id text NOT NULL CHECK (length(report_id) BETWEEN 1 AND 200),
  actor_user_id uuid NOT NULL REFERENCES public.app_users(id),
  account_user_id uuid NOT NULL REFERENCES public.app_users(id),
  business_id text NOT NULL CHECK (length(business_id) BETWEEN 1 AND 200),
  revision text NOT NULL CHECK (length(revision) BETWEEN 1 AND 200),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  raw_sha256 text NOT NULL CHECK (raw_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_payload jsonb NOT NULL CHECK (jsonb_typeof(snapshot_payload) = 'object' AND octet_length(snapshot_payload::text) <= 1048576),
  snapshot_ref text NOT NULL CHECK (length(snapshot_ref) BETWEEN 1 AND 1024),
  authority_kind text NOT NULL CHECK (authority_kind IN ('blockid_personal_report','svi_signed_creator')),
  can_read boolean NOT NULL CHECK (can_read),
  can_create_revision boolean NOT NULL CHECK (can_create_revision),
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (actor_user_id = account_user_id),
  CHECK ((site='blockid.au' AND owned_analysis_id IS NOT NULL AND report_id=owned_analysis_id::text) OR (site='startupvalueindex.com' AND owned_analysis_id IS NULL)),
  CHECK (expires_at > valid_from),
  CHECK ((site = 'blockid.au' AND authority_kind = 'blockid_personal_report') OR
         (site = 'startupvalueindex.com' AND authority_kind = 'svi_signed_creator')),
  UNIQUE (actor_user_id, site, report_id, revision),
  UNIQUE (id, actor_user_id, site)
);
CREATE TABLE IF NOT EXISTS public.reanalysis_wallet_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.app_users(id),
  site text NOT NULL,
  wallet_id uuid NOT NULL REFERENCES public.credit_balances(id),
  wallet_owner_user_id uuid NOT NULL REFERENCES public.app_users(id),
  granting_user_id uuid NOT NULL REFERENCES public.app_users(id),
  consent_version text NOT NULL CHECK (consent_version = 'personal-wallet-connection-v1'),
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (actor_user_id = wallet_owner_user_id AND actor_user_id = granting_user_id),
  CHECK (expires_at > valid_from),
  FOREIGN KEY (association_id, actor_user_id, site)
    REFERENCES public.reanalysis_report_associations(id, actor_user_id, site) ON DELETE CASCADE,
  UNIQUE (id, association_id, actor_user_id, wallet_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS reanalysis_one_active_wallet_grant
  ON public.reanalysis_wallet_grants(association_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS public.reanalysis_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES public.reanalysis_report_associations(id) ON DELETE CASCADE,
  grant_id uuid NOT NULL,
  requester_user_id uuid NOT NULL REFERENCES public.app_users(id),
  wallet_id uuid NOT NULL REFERENCES public.credit_balances(id),
  billing_owner_user_id uuid NOT NULL REFERENCES public.app_users(id),
  intent_sha256 text NOT NULL CHECK (intent_sha256 ~ '^[a-f0-9]{64}$'),
  pricing_version text NOT NULL CHECK (length(pricing_version) BETWEEN 1 AND 200),
  credit_micro_units bigint NOT NULL CHECK (credit_micro_units BETWEEN 0 AND 9007199254740991 AND credit_micro_units % 10000 = 0),
  displayed_terms text NOT NULL CHECK (length(displayed_terms) BETWEEN 1 AND 65536),
  displayed_terms_sha256 text NOT NULL CHECK (displayed_terms_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (requester_user_id = billing_owner_user_id),
  CHECK (displayed_terms_sha256 = encode(sha256(convert_to(displayed_terms,'UTF8')),'hex')),
  CHECK (expires_at > created_at),
  FOREIGN KEY (grant_id, association_id, requester_user_id, wallet_id)
    REFERENCES public.reanalysis_wallet_grants(id, association_id, actor_user_id, wallet_id) ON DELETE CASCADE
);
-- Only revocation may change a sealed association or grant. Quotes are immutable.
CREATE OR REPLACE FUNCTION public.guard_reanalysis_authority_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Permit only parent-driven erasure. Parent row has already disappeared
    -- when FK CASCADE fires; a direct deletion while parent exists is denied.
    IF TG_TABLE_NAME = 'reanalysis_report_associations' THEN
      IF OLD.owned_analysis_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.analyses WHERE id=OLD.owned_analysis_id) THEN RETURN OLD; END IF;
    ELSIF TG_TABLE_NAME = 'reanalysis_wallet_grants' THEN
      IF NOT EXISTS(SELECT 1 FROM public.reanalysis_report_associations WHERE id=OLD.association_id) THEN RETURN OLD; END IF;
    ELSIF TG_TABLE_NAME = 'reanalysis_quotes' THEN
      IF NOT EXISTS(SELECT 1 FROM public.reanalysis_report_associations WHERE id=OLD.association_id) OR
         NOT EXISTS(SELECT 1 FROM public.reanalysis_wallet_grants WHERE id=OLD.grant_id) THEN RETURN OLD; END IF;
    END IF;
    RAISE EXCEPTION 'authority_record_immutable';
  END IF;
  IF TG_TABLE_NAME = 'reanalysis_quotes' THEN RAISE EXCEPTION 'authority_record_immutable'; END IF;
  IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at') OR
     OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'authority_record_immutable';
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['reanalysis_report_associations','reanalysis_wallet_grants','reanalysis_quotes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role',t);
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = format('public.%I',t)::regclass AND tgname = 'authority_immutable') THEN
      EXECUTE format('CREATE TRIGGER authority_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_reanalysis_authority_immutable()',t);
    END IF;
  END LOOP;
END $$;
-- Authentication/CSRF/explicit acceptance is a future trusted server producer's
-- responsibility. No untrusted owner, wallet, report hash or grant fields enter.
CREATE OR REPLACE FUNCTION public.connect_personal_reanalysis_wallet(
  p_actor uuid, p_association uuid, p_explicit_acceptance boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.reanalysis_report_associations; w uuid; g uuid; now_at timestamptz := clock_timestamp();
BEGIN
  IF p_explicit_acceptance IS DISTINCT FROM true THEN RAISE EXCEPTION 'explicit_connection_required'; END IF;
  PERFORM 1 FROM public.app_users WHERE id = p_actor AND deleted_at IS NULL AND erased_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_forbidden'; END IF;
  SELECT * INTO a FROM public.reanalysis_report_associations WHERE id = p_association FOR UPDATE;
  IF NOT FOUND OR a.actor_user_id <> p_actor OR a.account_user_id <> p_actor OR
    a.revoked_at IS NOT NULL OR a.valid_from > now_at OR a.expires_at <= now_at THEN
    RAISE EXCEPTION 'association_denied';
  END IF;
  SELECT id INTO w FROM public.credit_balances WHERE user_id = p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_unavailable'; END IF;
  SELECT id INTO g FROM public.reanalysis_wallet_grants WHERE association_id = a.id AND revoked_at IS NULL;
  IF g IS NOT NULL THEN RETURN g; END IF;
  INSERT INTO public.reanalysis_wallet_grants(association_id,actor_user_id,site,wallet_id,wallet_owner_user_id,granting_user_id,consent_version,valid_from,expires_at)
    VALUES(a.id,p_actor,a.site,w,p_actor,p_actor,'personal-wallet-connection-v1',now_at,a.expires_at) RETURNING id INTO g;
  RETURN g;
END $$;
CREATE OR REPLACE FUNCTION public.revoke_personal_reanalysis_wallet(p_actor uuid, p_association uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  -- Same account -> association -> grant lock order as connection. Revocation
  -- remains possible for a deleted/erased owner; it never grants new access.
  PERFORM 1 FROM public.app_users WHERE id = p_actor FOR NO KEY UPDATE;
  PERFORM 1 FROM public.reanalysis_report_associations WHERE id = p_association AND actor_user_id = p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'association_denied'; END IF;
  UPDATE public.reanalysis_wallet_grants SET revoked_at = clock_timestamp()
    WHERE association_id = p_association AND actor_user_id = p_actor AND revoked_at IS NULL;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.guard_reanalysis_authority_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.connect_personal_reanalysis_wallet(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_personal_reanalysis_wallet(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Read-only terms: one SQL statement joins the active owner and real wallet.
CREATE OR REPLACE FUNCTION public.preview_owned_analysis_wallet(p_actor uuid,p_analysis uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r record; payload jsonb; terms jsonb; raw_hash text; input_hash text;
BEGIN
  SELECT x.*, w.id AS wallet_id INTO r FROM public.analyses x
    JOIN public.app_users u ON u.id = x.user_id
    JOIN public.credit_balances w ON w.user_id = u.id
    WHERE x.id = p_analysis AND u.id = p_actor AND u.deleted_at IS NULL AND u.erased_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_forbidden'; END IF;
  IF r.full_report_status IS DISTINCT FROM 'done' OR r.full_report_json IS NULL OR
    jsonb_typeof(r.full_report_json) <> 'object' OR r.input_text IS NULL OR
    length(btrim(r.input_text)) = 0 OR r.input_truncated THEN RAISE EXCEPTION 'authority_unavailable'; END IF;
  payload := jsonb_build_object('schema','blockid-owned-analysis-v1','analysisId',r.id,
    'inputKind',r.input_kind,'inputText',r.input_text,'intake',r.intake,'context',r.context,
    'svi',r.svi,'fullReport',r.full_report_json);
  raw_hash := encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  input_hash := encode(sha256(convert_to(r.input_text,'UTF8')),'hex');
  terms := jsonb_build_object('version','personal-reanalysis-wallet-v1','actorId',p_actor,
    'reportId',r.id,'site','blockid.au','walletId',r.wallet_id,'accountId',p_actor,
    'businessId',r.id,'revision','sha256:' || raw_hash,'inputSha256',input_hash,'rawSha256',raw_hash,
    'grantDurationDays',7,'chargeRule','separate_quote_approval_required','scoreRule','may_decrease_or_remain_unchanged');
  RETURN jsonb_build_object('version','personal-reanalysis-wallet-v1','terms',terms,
    'displayedTermsSha256',encode(sha256(convert_to(terms::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.preview_owned_analysis_wallet(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_owned_analysis_wallet(uuid,uuid) TO service_role;
-- The only association producer exposed to the backend. Browser identity MUST
-- come from the verified application session, never from request JSON.
CREATE OR REPLACE FUNCTION public.connect_owned_analysis_wallet(
  p_actor uuid, p_analysis uuid, p_explicit_acceptance boolean, p_expected_terms_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.analyses; a public.reanalysis_report_associations; payload jsonb;
  raw_hash text; input_hash text; grant_id uuid; wallet uuid; preview jsonb;
BEGIN
  IF p_explicit_acceptance IS DISTINCT FROM true THEN RAISE EXCEPTION 'explicit_connection_required'; END IF;
  PERFORM 1 FROM public.app_users WHERE id = p_actor AND deleted_at IS NULL AND erased_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_forbidden'; END IF;
  SELECT * INTO r FROM public.analyses WHERE id = p_analysis AND user_id = p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_forbidden'; END IF;
  SELECT id INTO wallet FROM public.credit_balances WHERE user_id = p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_unavailable'; END IF;
  preview := public.preview_owned_analysis_wallet(p_actor,p_analysis);
  IF p_expected_terms_sha256 IS NULL OR p_expected_terms_sha256 IS DISTINCT FROM preview->>'displayedTermsSha256' THEN RAISE EXCEPTION 'authority_snapshot_changed'; END IF;
  IF r.full_report_status IS DISTINCT FROM 'done' OR r.full_report_json IS NULL OR
    jsonb_typeof(r.full_report_json) <> 'object' OR r.input_text IS NULL OR
    length(btrim(r.input_text)) = 0 OR r.input_truncated THEN
    RAISE EXCEPTION 'authority_unavailable';
  END IF;
  payload := jsonb_build_object('schema','blockid-owned-analysis-v1','analysisId',r.id,
    'inputKind',r.input_kind,'inputText',r.input_text,'intake',r.intake,'context',r.context,
    'svi',r.svi,'fullReport',r.full_report_json);
  raw_hash := encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  input_hash := encode(sha256(convert_to(r.input_text,'UTF8')),'hex');
  SELECT * INTO a FROM public.reanalysis_report_associations
    WHERE actor_user_id = p_actor AND site = 'blockid.au' AND report_id = r.id::text AND revision = 'sha256:' || raw_hash FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.reanalysis_report_associations(owned_analysis_id,site,report_id,actor_user_id,account_user_id,
      business_id,revision,input_sha256,raw_sha256,snapshot_payload,snapshot_ref,authority_kind,
      can_read,can_create_revision,expires_at)
    VALUES(r.id,'blockid.au',r.id::text,p_actor,p_actor,r.id::text,'sha256:' || raw_hash,input_hash,raw_hash,
      payload,'db:analyses:' || r.id::text || ':sha256:' || raw_hash,'blockid_personal_report',true,true,
      clock_timestamp() + interval '7 days') RETURNING * INTO a;
  END IF;
  grant_id := public.connect_personal_reanalysis_wallet(p_actor,a.id,true);
  SELECT wallet_id INTO wallet FROM public.reanalysis_wallet_grants WHERE id = grant_id;
  RETURN jsonb_build_object('associationId',a.id,'grantId',grant_id,'walletId',wallet,
    'accountId',a.account_user_id,'businessId',a.business_id,'revision',a.revision,
    'inputSha256',a.input_sha256,'rawSha256',a.raw_sha256,'expiresAt',a.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.connect_owned_analysis_wallet(uuid,uuid,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.connect_owned_analysis_wallet(uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_personal_reanalysis_wallet(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_personal_reanalysis_wallet(uuid,uuid) FROM service_role;
CREATE OR REPLACE FUNCTION public.revoke_owned_analysis_wallet(p_actor uuid,p_analysis uuid,p_grant uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE association uuid;
BEGIN
  PERFORM 1 FROM public.app_users WHERE id=p_actor FOR NO KEY UPDATE;
  PERFORM 1 FROM public.analyses WHERE id=p_analysis AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_forbidden'; END IF;
  SELECT a.id INTO association FROM public.reanalysis_report_associations a
    JOIN public.reanalysis_wallet_grants g ON g.association_id=a.id
    WHERE a.actor_user_id=p_actor AND a.site='blockid.au' AND a.report_id=p_analysis::text
      AND g.id=p_grant AND g.actor_user_id=p_actor FOR UPDATE OF a;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority_forbidden'; END IF;
  UPDATE public.reanalysis_wallet_grants SET revoked_at=clock_timestamp()
    WHERE id=p_grant AND association_id=association AND actor_user_id=p_actor AND revoked_at IS NULL;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.revoke_owned_analysis_wallet(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.revoke_owned_analysis_wallet(uuid,uuid,uuid) TO service_role;
