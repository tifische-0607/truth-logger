# Public SpyGlass landing page

## What will change
- Replace the automatic home-page redirect with a public SpyGlass V2 landing page modeled on the reference: compact header, bold operational headline, short explanation, sign-in call to action, and three capability panels.
- Tailor all wording to Facebook evidence capture, integrity verification, and legal case preparation in Malaysia.
- Use the existing SpyGlass logo, typography, color tokens, and touch-friendly controls so it feels native to the current app and works well on iPad and phone.
- Keep `/auth` as the sign-in screen and `/dashboard` as the private workspace; authenticated users can enter the workspace from the landing page.
- Add complete page-specific search and sharing metadata for the public home page.

## Technical details
- Update `src/routes/index.tsx` only; preserve the current route architecture and private authenticated area.
- Use TanStack Router links and the existing shared Button styling.
- Verify the finished page at desktop and mobile sizes, including navigation to sign in.
