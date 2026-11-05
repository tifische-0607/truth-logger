-- U2: pricing, upgrade requests and billing. Additive only.
CREATE TABLE public.billing_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 currency text NOT NULL DEFAULT 'RM' CHECK (currency IN ('RM','USD')),
 billing_period text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly')),
 updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_settings_read ON public.billing_settings FOR SELECT TO authenticated USING (true);
INSERT INTO public.billing_settings (id) VALUES (1);

CREATE TABLE public.billing_tiers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 rank integer NOT NULL UNIQUE CHECK (rank BETWEEN 1 AND 3),
 name text NOT NULL CHECK (length(trim(name)) > 0),
 price numeric(12,2) CHECK (price IS NULL OR price >= 0),
 seat_limit integer CHECK (seat_limit IS NULL OR seat_limit > 0),
 contents text[] NOT NULL DEFAULT '{}',
 updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_tiers TO authenticated;
GRANT ALL ON public.billing_tiers TO service_role;
ALTER TABLE public.billing_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_tiers_read ON public.billing_tiers FOR SELECT TO authenticated USING (true);
-- Placeholder tiers. Seat limits follow the agreed U1 counts (3, 10, unlimited); names, prices and contents are not decided.
INSERT INTO public.billing_tiers (rank, name, seat_limit) VALUES (1,'Tier 1',3),(2,'Tier 2',10),(3,'Tier 3',NULL);

ALTER TABLE public.clients ADD COLUMN tier_id uuid REFERENCES public.billing_tiers(id);

CREATE TABLE public.billing_price_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tier_id uuid REFERENCES public.billing_tiers(id),
 field text NOT NULL, old_value jsonb, new_value jsonb,
 actor uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_price_log TO authenticated;
GRANT ALL ON public.billing_price_log TO service_role;
ALTER TABLE public.billing_price_log ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER billing_price_log_immutable BEFORE UPDATE OR DELETE ON public.billing_price_log FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.upgrade_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id),
 current_tier_id uuid REFERENCES public.billing_tiers(id),
 requested_tier_id uuid NOT NULL REFERENCES public.billing_tiers(id),
 requested_by uuid NOT NULL DEFAULT auth.uid(), requested_by_name text,
 note text CHECK (note IS NULL OR length(note) <= 1000),
 status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','declined')),
 decided_by uuid, decided_at timestamptz, decision_note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.upgrade_requests TO authenticated;
GRANT ALL ON public.upgrade_requests TO service_role;
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

CREATE SEQUENCE public.invoice_number_seq START 1;
CREATE TABLE public.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id),
 number text UNIQUE,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
 currency text NOT NULL CHECK (currency IN ('RM','USD')),
 lines jsonb NOT NULL DEFAULT '[]',
 total numeric(12,2) NOT NULL CHECK (total >= 0),
 for_tier_id uuid REFERENCES public.billing_tiers(id),
 notes text, due_date date,
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 issued_at timestamptz, paid_at timestamptz,
 payment_date date, payment_method text, payment_reference text, payment_amount numeric(12,2),
 void_reason text, voided_at timestamptz
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.billing_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id),
 invoice_id uuid REFERENCES public.invoices(id),
 request_id uuid REFERENCES public.upgrade_requests(id),
 kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
 actor uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER billing_events_immutable BEFORE UPDATE OR DELETE ON public.billing_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

CREATE TABLE public.client_tier_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id),
 old_tier_id uuid REFERENCES public.billing_tiers(id),
 new_tier_id uuid NOT NULL REFERENCES public.billing_tiers(id),
 invoice_id uuid REFERENCES public.invoices(id),
 seats_used integer NOT NULL, note text,
 actor uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_tier_log TO authenticated;
GRANT ALL ON public.client_tier_log TO service_role;
ALTER TABLE public.client_tier_log ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER client_tier_log_immutable BEFORE UPDATE OR DELETE ON public.client_tier_log FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- Helpers
CREATE OR REPLACE FUNCTION public.billing_is_finance(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(u,'owner') OR public.has_role(u,'management'); $$;
CREATE OR REPLACE FUNCTION public.billing_member_client(u uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.client_id FROM public.client_users a JOIN public.clients b ON b.id=a.client_id
 WHERE a.user_id=u AND a.status='active' AND b.portal_enabled AND b.status='active' AND NOT public.portal_is_staff(u) LIMIT 1; $$;
CREATE OR REPLACE FUNCTION public.billing_seats_used(c uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT count(*)::int FROM public.client_users WHERE client_id=c AND status IN ('pending','active'); $$;
REVOKE ALL ON FUNCTION public.billing_is_finance(uuid), public.billing_member_client(uuid), public.billing_seats_used(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_is_finance(uuid), public.billing_member_client(uuid), public.billing_seats_used(uuid) TO authenticated, service_role;

-- Read policies: staff finance see all; a client sees only its own rows.
CREATE POLICY billing_price_log_read ON public.billing_price_log FOR SELECT TO authenticated USING (public.billing_is_finance(auth.uid()));
CREATE POLICY upgrade_requests_read ON public.upgrade_requests FOR SELECT TO authenticated
 USING (public.billing_is_finance(auth.uid()) OR client_id = public.billing_member_client(auth.uid()));
CREATE POLICY invoices_read ON public.invoices FOR SELECT TO authenticated
 USING (public.billing_is_finance(auth.uid()) OR (status <> 'draft' AND public.portal_is_admin(auth.uid(), client_id)));
CREATE POLICY billing_events_read ON public.billing_events FOR SELECT TO authenticated USING (public.billing_is_finance(auth.uid()));
CREATE POLICY client_tier_log_read ON public.client_tier_log FOR SELECT TO authenticated USING (public.billing_is_finance(auth.uid()));

-- A client's tier changes only through billing_change_tier.
CREATE OR REPLACE FUNCTION public.billing_client_tier_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.tier_id IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.tier_id IS DISTINCT FROM OLD.tier_id) THEN
  IF coalesce(current_setting('fa.billing_tier_change', true),'') <> 'on' THEN
   RAISE EXCEPTION 'A client''s tier can only be changed in Billing by the owner or Management.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clients_tier_guard BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.billing_client_tier_guard();

-- Settings and tier edits (owner / Management only), every changed field logged.
CREATE OR REPLACE FUNCTION public.billing_update_settings(_currency text, _period text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.billing_settings;
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can change pricing.'; END IF;
 IF _currency NOT IN ('RM','USD') THEN RAISE EXCEPTION 'Currency must be RM or USD.'; END IF;
 IF _period NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'Billing period must be monthly or yearly.'; END IF;
 SELECT * INTO s FROM public.billing_settings WHERE id=1 FOR UPDATE;
 IF s.currency <> _currency THEN INSERT INTO public.billing_price_log(field,old_value,new_value) VALUES ('currency',to_jsonb(s.currency),to_jsonb(_currency)); END IF;
 IF s.billing_period <> _period THEN INSERT INTO public.billing_price_log(field,old_value,new_value) VALUES ('billing_period',to_jsonb(s.billing_period),to_jsonb(_period)); END IF;
 UPDATE public.billing_settings SET currency=_currency, billing_period=_period, updated_by=auth.uid(), updated_at=now() WHERE id=1;
END $$;

CREATE OR REPLACE FUNCTION public.billing_update_tier(_tier uuid, _name text, _price numeric, _seat_limit integer, _contents text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.billing_tiers; over text; clean text[];
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can change pricing.'; END IF;
 SELECT * INTO t FROM public.billing_tiers WHERE id=_tier FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Tier not found.'; END IF;
 IF _name IS NULL OR length(trim(_name))=0 THEN RAISE EXCEPTION 'A tier needs a name.'; END IF;
 IF _price IS NOT NULL AND _price < 0 THEN RAISE EXCEPTION 'A price cannot be negative.'; END IF;
 IF _seat_limit IS NOT NULL AND _seat_limit < 1 THEN RAISE EXCEPTION 'A seat limit must be at least 1, or left empty for unlimited.'; END IF;
 IF _seat_limit IS NOT NULL THEN
  SELECT string_agg(c.name || ' (' || public.billing_seats_used(c.id) || ' seats used)', ', ') INTO over
  FROM public.clients c WHERE c.tier_id=_tier AND public.billing_seats_used(c.id) > _seat_limit;
  IF over IS NOT NULL THEN RAISE EXCEPTION 'This seat limit is below the seats already used by: %. Move those clients first or choose a higher limit.', over; END IF;
 END IF;
 SELECT coalesce(array_agg(trim(x)) FILTER (WHERE length(trim(x))>0), '{}') INTO clean FROM unnest(coalesce(_contents,'{}')) x;
 IF t.name IS DISTINCT FROM trim(_name) THEN INSERT INTO public.billing_price_log(tier_id,field,old_value,new_value) VALUES (_tier,'name',to_jsonb(t.name),to_jsonb(trim(_name))); END IF;
 IF t.price IS DISTINCT FROM _price THEN INSERT INTO public.billing_price_log(tier_id,field,old_value,new_value) VALUES (_tier,'price',to_jsonb(t.price),to_jsonb(_price)); END IF;
 IF t.seat_limit IS DISTINCT FROM _seat_limit THEN INSERT INTO public.billing_price_log(tier_id,field,old_value,new_value) VALUES (_tier,'seat_limit',to_jsonb(t.seat_limit),to_jsonb(_seat_limit)); END IF;
 IF t.contents IS DISTINCT FROM clean THEN INSERT INTO public.billing_price_log(tier_id,field,old_value,new_value) VALUES (_tier,'contents',to_jsonb(t.contents),to_jsonb(clean)); END IF;
 UPDATE public.billing_tiers SET name=trim(_name), price=_price, seat_limit=_seat_limit, contents=clean, updated_by=auth.uid(), updated_at=now() WHERE id=_tier;
END $$;

-- Client: own summary (tier, seats) for any active client user.
CREATE OR REPLACE FUNCTION public.billing_client_summary(c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; cl public.clients;
BEGIN
 IF public.billing_is_finance(auth.uid()) OR public.portal_is_staff(auth.uid()) THEN cid := c;
 ELSE cid := public.billing_member_client(auth.uid()); END IF;
 IF cid IS NULL THEN RAISE EXCEPTION 'This account has no active client access.'; END IF;
 SELECT * INTO cl FROM public.clients WHERE id=cid;
 RETURN jsonb_build_object('client_id',cid,'client_name',cl.name,'tier_id',cl.tier_id,'seats_used',public.billing_seats_used(cid),
  'is_admin',public.portal_is_admin(auth.uid(),cid));
END $$;

CREATE OR REPLACE FUNCTION public.billing_request_upgrade(_tier uuid, _note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid := public.billing_member_client(auth.uid()); cur public.billing_tiers; want public.billing_tiers; rid uuid; nm text;
BEGIN
 IF cid IS NULL THEN RAISE EXCEPTION 'Only a signed-in client user can request an upgrade.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text,7));
 SELECT t.* INTO cur FROM public.billing_tiers t JOIN public.clients c ON c.tier_id=t.id WHERE c.id=cid;
 SELECT * INTO want FROM public.billing_tiers WHERE id=_tier;
 IF want.id IS NULL THEN RAISE EXCEPTION 'Tier not found.'; END IF;
 IF cur.id IS NOT NULL AND want.rank <= cur.rank THEN RAISE EXCEPTION 'You can only request a higher tier than your current one.'; END IF;
 IF EXISTS (SELECT 1 FROM public.upgrade_requests WHERE client_id=cid AND status='requested') THEN RAISE EXCEPTION 'You already have an upgrade request waiting for FridayAnalytics.'; END IF;
 SELECT name INTO nm FROM public.client_users WHERE user_id=auth.uid() AND client_id=cid;
 INSERT INTO public.upgrade_requests(client_id,current_tier_id,requested_tier_id,requested_by_name,note)
  VALUES (cid,cur.id,_tier,nm,nullif(trim(coalesce(_note,'')),'')) RETURNING id INTO rid;
 INSERT INTO public.billing_events(client_id,request_id,kind,detail) VALUES (cid,rid,'upgrade_requested',jsonb_build_object('tier',want.name));
 RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.billing_decide_request(_request uuid, _approve boolean, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.upgrade_requests;
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can decide upgrade requests.'; END IF;
 SELECT * INTO r FROM public.upgrade_requests WHERE id=_request FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found.'; END IF;
 IF r.status <> 'requested' THEN RAISE EXCEPTION 'This request has already been decided.'; END IF;
 UPDATE public.upgrade_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'declined' END, decided_by=auth.uid(), decided_at=now(), decision_note=nullif(trim(coalesce(_note,'')),'') WHERE id=_request;
 INSERT INTO public.billing_events(client_id,request_id,kind,detail) VALUES (r.client_id,_request,CASE WHEN _approve THEN 'upgrade_approved' ELSE 'upgrade_declined' END,jsonb_build_object('note',_note));
END $$;

-- Invoices
CREATE OR REPLACE FUNCTION public.billing_create_invoice(_client uuid, _lines jsonb, _due date, _notes text, _tier uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tot numeric := 0; l jsonb; q numeric; p numeric; iid uuid; cur text;
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can create invoices.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id=_client) THEN RAISE EXCEPTION 'Client not found.'; END IF;
 IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines)=0 THEN RAISE EXCEPTION 'An invoice needs at least one line.'; END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
  IF length(trim(coalesce(l->>'description','')))=0 THEN RAISE EXCEPTION 'Every invoice line needs a description.'; END IF;
  q := (l->>'quantity')::numeric; p := (l->>'unit_price')::numeric;
  IF q IS NULL OR q <= 0 OR p IS NULL OR p < 0 THEN RAISE EXCEPTION 'Every invoice line needs a quantity above 0 and a unit price of 0 or more.'; END IF;
  tot := tot + round(q*p,2);
 END LOOP;
 SELECT currency INTO cur FROM public.billing_settings WHERE id=1;
 INSERT INTO public.invoices(client_id,currency,lines,total,for_tier_id,notes,due_date) VALUES (_client,cur,_lines,tot,_tier,nullif(trim(coalesce(_notes,'')),''),_due) RETURNING id INTO iid;
 INSERT INTO public.billing_events(client_id,invoice_id,kind,detail) VALUES (_client,iid,'invoice_created',jsonb_build_object('total',tot,'currency',cur));
 RETURN iid;
END $$;

CREATE OR REPLACE FUNCTION public.billing_issue_invoice(_invoice uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invoices; num text;
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can issue invoices.'; END IF;
 SELECT * INTO i FROM public.invoices WHERE id=_invoice FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
 IF i.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft invoice can be issued.'; END IF;
 num := 'FA-INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text,5,'0');
 UPDATE public.invoices SET status='issued', number=num, issued_at=now() WHERE id=_invoice;
 INSERT INTO public.billing_events(client_id,invoice_id,kind,detail) VALUES (i.client_id,_invoice,'invoice_issued',jsonb_build_object('number',num,'total',i.total,'currency',i.currency));
 RETURN num;
END $$;

CREATE OR REPLACE FUNCTION public.billing_record_payment(_invoice uuid, _date date, _method text, _reference text, _amount numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invoices;
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can record payments.'; END IF;
 SELECT * INTO i FROM public.invoices WHERE id=_invoice FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
 IF i.status <> 'issued' THEN RAISE EXCEPTION 'Payment can only be recorded on an issued invoice.'; END IF;
 IF _date IS NULL OR length(trim(coalesce(_method,'')))=0 OR length(trim(coalesce(_reference,'')))=0 THEN RAISE EXCEPTION 'Payment needs a date, method and reference.'; END IF;
 IF _amount IS NULL OR _amount <> i.total THEN RAISE EXCEPTION 'The amount paid must equal the invoice total of % %.', i.currency, i.total; END IF;
 UPDATE public.invoices SET status='paid', paid_at=now(), payment_date=_date, payment_method=trim(_method), payment_reference=trim(_reference), payment_amount=_amount WHERE id=_invoice;
 INSERT INTO public.billing_events(client_id,invoice_id,kind,detail) VALUES (i.client_id,_invoice,'payment_recorded',jsonb_build_object('date',_date,'method',_method,'reference',_reference,'amount',_amount));
END $$;

CREATE OR REPLACE FUNCTION public.billing_void_invoice(_invoice uuid, _reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invoices;
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can void invoices.'; END IF;
 SELECT * INTO i FROM public.invoices WHERE id=_invoice FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
 IF i.status NOT IN ('draft','issued') THEN RAISE EXCEPTION 'Only a draft or issued invoice can be voided.'; END IF;
 IF length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'Voiding needs a reason.'; END IF;
 UPDATE public.invoices SET status='void', void_reason=trim(_reason), voided_at=now() WHERE id=_invoice;
 INSERT INTO public.billing_events(client_id,invoice_id,kind,detail) VALUES (i.client_id,_invoice,'invoice_voided',jsonb_build_object('reason',_reason,'number',i.number));
END $$;

-- Tier change: owner/Management, after a paid invoice for that client (or first assignment), never below seats used.
CREATE OR REPLACE FUNCTION public.billing_change_tier(_client uuid, _tier uuid, _invoice uuid, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cl public.clients; t public.billing_tiers; used integer;
BEGIN
 IF NOT public.billing_is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only the owner or Management can change a client''s tier.'; END IF;
 SELECT * INTO cl FROM public.clients WHERE id=_client FOR UPDATE;
 IF cl.id IS NULL THEN RAISE EXCEPTION 'Client not found.'; END IF;
 SELECT * INTO t FROM public.billing_tiers WHERE id=_tier;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Tier not found.'; END IF;
 IF cl.tier_id = _tier THEN RAISE EXCEPTION 'The client is already on this tier.'; END IF;
 IF cl.tier_id IS NOT NULL THEN
  IF _invoice IS NULL OR NOT EXISTS (SELECT 1 FROM public.invoices WHERE id=_invoice AND client_id=_client AND status='paid') THEN
   RAISE EXCEPTION 'A tier can only be changed after a paid invoice for this client.'; END IF;
 END IF;
 used := public.billing_seats_used(_client);
 IF t.seat_limit IS NOT NULL AND used > t.seat_limit THEN
  RAISE EXCEPTION '% allows % seats, but % already uses %. Remove users first or choose a larger tier.', t.name, t.seat_limit, cl.name, used; END IF;
 PERFORM set_config('fa.billing_tier_change','on',true);
 UPDATE public.clients SET tier_id=_tier WHERE id=_client;
 PERFORM set_config('fa.billing_tier_change','',true);
 INSERT INTO public.client_tier_log(client_id,old_tier_id,new_tier_id,invoice_id,seats_used,note) VALUES (_client,cl.tier_id,_tier,_invoice,used,nullif(trim(coalesce(_note,'')),''));
 INSERT INTO public.billing_events(client_id,invoice_id,kind,detail) VALUES (_client,_invoice,'tier_changed',jsonb_build_object('from',cl.tier_id,'to',_tier,'seats_used',used));
END $$;

REVOKE ALL ON FUNCTION public.billing_update_settings(text,text), public.billing_update_tier(uuid,text,numeric,integer,text[]), public.billing_client_summary(uuid),
 public.billing_request_upgrade(uuid,text), public.billing_decide_request(uuid,boolean,text), public.billing_create_invoice(uuid,jsonb,date,text,uuid),
 public.billing_issue_invoice(uuid), public.billing_record_payment(uuid,date,text,text,numeric), public.billing_void_invoice(uuid,text), public.billing_change_tier(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_update_settings(text,text), public.billing_update_tier(uuid,text,numeric,integer,text[]), public.billing_client_summary(uuid),
 public.billing_request_upgrade(uuid,text), public.billing_decide_request(uuid,boolean,text), public.billing_create_invoice(uuid,jsonb,date,text,uuid),
 public.billing_issue_invoice(uuid), public.billing_record_payment(uuid,date,text,text,numeric), public.billing_void_invoice(uuid,text), public.billing_change_tier(uuid,uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_client_tier_guard() FROM PUBLIC, anon, authenticated;
