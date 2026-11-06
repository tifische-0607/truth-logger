# Access levels, menus and the Account section

Every login has one access level (`account_access`), kept in step with existing data by database triggers:

| Level | Comes from | Menu |
|---|---|---|
| SuperAdmin | `owner` role | Everything FA Staff sees, plus Users and access, Vaults and evidence move, Billing and pricing, Connectors, Executive agent access, Team, Settings, Account |
| FA Staff | analyst / Curator / Management roles | Dashboard, Engagements, Search, Cases, Collect, Integrity, Research, Early warning, Links, Narratives, Evidence search, Library, Frameworks, Sources, Case templates, Client preview, Account; Curator adds Curator inbox and Connectors (certification); Management adds Management, Billing and Users and access (Members only) |
| Client Admin | client login, administrator | Dashboard, Reports, Engagement progress, Team and seats (with Users and access for own Client Staff), Pricing and upgrade, Billing and invoices, Account |
| Client Staff | client login, user (uses a seat) | Dashboard, Reports, Engagement progress, Notices, Account |
| Member | Member invitation (no client, no seat) | Reports released to Members, Notices, Account |

- The database function `access_menu()` lists the screens for the caller's level plus job role. Staff route guards and the portal tabs read it; a direct URL to a screen not in the list shows "Your access level does not include this screen…". Data rules stay in RLS and guarded functions.
- Only a SuperAdmin switches SuperAdmin ↔ FA Staff (`access_set_level`); nobody changes their own level; at least one active SuperAdmin must remain. Client and Member levels come from their invitation. Every level/status change goes to the append-only `access_level_log`.
- Deactivation (`access_set_status`) removes every staff right (`has_role`/`portal_is_staff` check the status) and the server also blocks sign-in. Client logins deactivate through the existing client-login rules.
- Members are invited only by SuperAdmin or Management (single-use link, no email sent). They read only reports that are shared, ticked "Members" in the Library, and (if tiers are ticked) match their tier.
- Account section: profile (name, display name, phone, job title, language, theme), email change (confirmation email), password change (current password required), sign out of other sessions. Admin actions on others (reset link, deactivate/reactivate, profile edit) follow `access_can_manage`: SuperAdmin for anyone, Client Admin for own Client Staff. All logged in the append-only `account_admin_events` and shown under "User activity".
- Account emails stay off and show "Not configured" until the `ACCOUNT_EMAILS_ENABLED` server setting is present.

## Creating accounts (0056)
- Users and access → Create account (SuperAdmin: any level; Management: Member only). Name, email, level, then job roles (FA Staff), client (Client Admin/Staff) or optional tier (Member).
- `account_invite()` records a single-use invitation (7-day expiry); the person opens the link and sets their own password. Level and roles come only from the invitation (`staff_invitations`, `client_users`, `member_invitations`).
- Refused in the database: non-SuperAdmin creating SuperAdmin/FA Staff/Client Admin; email already in use; third Client Admin; Client Staff with no tier or beyond seats; used/expired links.
- Pending invitations list with Resend (new link, old one stops working) and Cancel. Creation, resend and cancel are logged in User activity. Email sending shows "Not configured"; links are copied from the screen.
