-- Fictional TEST data so the evidence screens have content to show.
insert into public.cases (id, opened_on, target_of_complaint, offence_alleged, jurisdiction_agency, lead_handler, status, related_cases, notes)
values ('2026-014', '2026-09-21', 'TEST Page: Halaman Contoh', 'CMA 1998 s.233', 'MCMC', 'M. Hafidz', 'open', array['2026-009'],
  'TEST DATA — fictional case created for demonstration. Not a real complaint.')
on conflict (id) do nothing;

insert into public.incidents (case_id, incident_id, start_date, end_date, narrative_themes, escalation_stage, summary)
values ('2026-014', '03', '2026-09-21', '2026-09-22', array['defamation','harassment'], 'amplification',
  'TEST DATA — fictional post and comment thread naming a fictional complainant.')
on conflict (case_id, incident_id) do nothing;

with inc as (select id from public.incidents where case_id = '2026-014' and incident_id = '03'),
acc as (
  insert into public.accounts (incident_uuid, platform, handle, display_name, profile_url, platform_id)
  select inc.id, 'FB', 'test.halaman.contoh', 'TEST Halaman Contoh', 'https://www.facebook.com/test.halaman.contoh', '100064000000001' from inc
  on conflict (incident_uuid, platform, handle) do update set display_name = excluded.display_name
  returning id
),
snap as (
  insert into public.account_snapshots (account_id, display_name, followers, following, verified, bio_verbatim, created, captured_at)
  select acc.id, 'TEST Halaman Contoh', 18422::bigint, 31::bigint, false, 'TEST DATA — berita dan pandangan (contoh).', '2019-04-11', now() - interval '2 days' from acc
  union all
  select acc.id, 'TEST Halaman Contoh', 18960::bigint, 33::bigint, false, 'TEST DATA — berita dan pandangan (contoh).', '2019-04-11', now() - interval '3 hours' from acc
  returning id
),
post as (
  insert into public.items (account_id, item_code, item_type, parent_item_id, url, platform_item_id, author_name, author_handle, author_url, published_at, text_original, text_en, translator_statement, engagement, captured_at, folder_path)
  select acc.id, 'POST-900000001', 'post', null,
    'https://www.facebook.com/test.halaman.contoh/posts/900000001', '900000001',
    'TEST Halaman Contoh', 'test.halaman.contoh', 'https://www.facebook.com/test.halaman.contoh',
    '2026-09-21T14:02:00+08:00'::timestamptz,
    'TEST DATA — Ini ialah contoh kenyataan untuk tujuan ujian sahaja. Maklumat dalam siaran ini tidak menggambarkan sebarang individu, organisasi atau kejadian sebenar.',
    'TEST DATA — This is a sample statement for testing purposes only. Nothing in this post refers to any real individual, organisation or event.',
    'Machine translation reviewed by the handler (M. Hafidz) on 23 Sep 2026. Fictional demonstration text.',
    '{"reactions": 128, "comments": 24, "shares": 12}'::jsonb,
    now() - interval '3 hours',
    'CASE-2026-014/INC-03_2026-09-21/FB_@test.halaman.contoh/POST-900000001'
  from acc
  on conflict (account_id, item_code) do nothing
  returning id, account_id
),
c1 as (
  insert into public.items (account_id, item_code, item_type, parent_item_id, url, author_name, author_handle, published_at, text_original, text_en, translator_statement, engagement, captured_at, folder_path)
  select post.account_id, 'CMT-0001', 'comment', post.id,
    'https://www.facebook.com/test.halaman.contoh/posts/900000001?comment_id=1',
    'TEST Ali bin Abu', 'test.ali.abu', '2026-09-21T14:20:00+08:00'::timestamptz,
    'TEST DATA — Komen contoh pertama di bawah siaran ujian ini.',
    'TEST DATA — First sample comment under this test post.',
    'Machine translation reviewed by the handler on 23 Sep 2026.',
    '{"reactions": 22, "replies": 2}'::jsonb, now() - interval '3 hours',
    'CASE-2026-014/INC-03_2026-09-21/FB_@test.halaman.contoh/CMT-0001'
  from post
  on conflict (account_id, item_code) do nothing
  returning id, account_id
),
c2 as (
  insert into public.items (account_id, item_code, item_type, parent_item_id, author_name, published_at, text_original, text_en, engagement, captured_at)
  select post.account_id, 'CMT-0002', 'comment', post.id, 'TEST Siti Nor', '2026-09-21T15:05:00+08:00'::timestamptz,
    'TEST DATA — Komen contoh kedua.', 'TEST DATA — Second sample comment.',
    '{"reactions": 4, "replies": 0}'::jsonb, now() - interval '3 hours'
  from post
  on conflict (account_id, item_code) do nothing
  returning id
),
replies as (
  insert into public.items (account_id, item_code, item_type, parent_item_id, author_name, published_at, text_original, text_en, engagement, captured_at)
  select c1.account_id, 'CMT-0001-R01', 'reply', c1.id, 'TEST Rajesh K.', '2026-09-21T14:41:00+08:00'::timestamptz,
    'TEST DATA — Balasan contoh pertama.', 'TEST DATA — First sample reply.', '{"reactions": 3}'::jsonb, now() - interval '3 hours' from c1
  union all
  select c1.account_id, 'CMT-0001-R02', 'reply', c1.id, 'TEST Mei Ling', '2026-09-21T14:52:00+08:00'::timestamptz,
    'TEST DATA — Balasan contoh kedua.', 'TEST DATA — Second sample reply.', '{"reactions": 1}'::jsonb, now() - interval '3 hours' from c1
  returning id
),
art as (
  insert into public.artefacts (item_id, filename, kind, storage_path, sha256, size_bytes, mime_type, captured_at)
  select post.id, 'live_post.png', 'screenshot',
    'CASE-2026-014/INC-03_2026-09-21/FB_@test.halaman.contoh/POST-900000001/artefacts/live_post.png',
    '951ca5b186bee509fc631820568befcac4b9ace1b16900b1d80978ebcfba7ee7', 724743::bigint, 'image/png', now() - interval '3 hours'
  from post
  union all
  select c1.id, 'render_comment.png', 'render',
    'CASE-2026-014/INC-03_2026-09-21/FB_@test.halaman.contoh/CMT-0001/artefacts/render_comment.png',
    '52e2962fc58b9f8a70c89db6b576c8f91b6104fec5a696d1f38d824fc18287a9', 663322::bigint, 'image/png', now() - interval '3 hours'
  from c1
  returning id, item_id, filename, sha256
),
prof as (
  insert into public.subject_profiles (item_id, account_id, subject_type, stated, observed, insufficient_data)
  select post.id, post.account_id, 'poster',
    '{"bio": "TEST DATA — berita dan pandangan (contoh).", "location_tag": "Kuala Lumpur", "stated_affiliation": "none stated", "listed_language": "Bahasa Melayu"}'::jsonb,
    '{"posting_language": "Bahasa Melayu", "posting_time_pattern": "20:00-23:00 MYT", "account_created": "2019-04-11", "follower_following_ratio": 594.3, "verified": false}'::jsonb,
    false
  from post
  returning id
)
insert into public.custody_events (artefact_id, item_id, filename, sha256, action, handler, tool_version, notes)
select art.id, art.item_id, art.filename, art.sha256, 'captured', 'M. Hafidz', 'worker-1.4.2-test', 'TEST DATA — captured by the fictional demonstration run.' from art
union all
select art.id, art.item_id, art.filename, art.sha256, 'transferred', 'mac-mini-worker', 'worker-1.4.2-test', 'uploaded from Mac mini worker, hash MATCH' from art;

insert into public.capture_jobs (url, case_id, incident_id, incident_date, handler, options, case_meta, incident_meta, status, log, warnings, finished_at, result)
values (
  'https://www.facebook.com/test.halaman.contoh/posts/900000001', '2026-014', '03', '2026-09-21', 'M. Hafidz',
  '{"max_comments":500,"live_comment_limit":100,"include_replies":true,"live_screenshots":true,"rendered_sheets":true,"archive":true,"translate":true,"download_media":true,"recapture":false}'::jsonb,
  '{}'::jsonb, '{}'::jsonb, 'done',
  array['TEST DATA — demonstration job','Claimed by worker mac-mini','Loaded post, 24 comments visible','Captured live screenshot of post','Rendered comment sheet for CMT-0001','Uploaded 2 artefacts','Ingest complete'],
  array['TEST DATA — 1 comment had no permalink and was recorded without a URL'],
  now() - interval '3 hours',
  '{"items_captured": 5, "artefacts": 2}'::jsonb
);