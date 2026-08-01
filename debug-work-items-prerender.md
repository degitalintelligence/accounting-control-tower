# Debug Session: work-items prerender

Status: [OPEN]

## Symptom

Production build fails while prerendering `/work-items` with Next.js error `useSearchParams() should be wrapped in a suspense boundary`.

## Evidence received

- Build reaches `npm run build` and static page generation.
- Failure occurs at `/work-items` during prerender.
- Supabase Node.js 20 message is a warning.
- `$NIXPACKS_PATH` message is a Docker warning.

## Hypotheses

1. The `/work-items` page directly calls `useSearchParams()` without a Suspense boundary.
2. A client filter component called by `/work-items` calls `useSearchParams()` without a Suspense boundary.
3. The Supabase Node.js 20 warning causes the build failure.
4. The `$NIXPACKS_PATH` warning causes the build failure.
5. Other routes contain the same unwrapped `useSearchParams()` pattern.

## Investigation

- [confirmed] The build log identifies `/work-items` as the failed prerender route.
- [confirmed] The build log identifies missing Suspense around `useSearchParams()` as the direct error.
- [confirmed] `WorkItemsPageContent` calls `useSearchParams()` and the page had no Suspense boundary.
- [confirmed] `WorkItemFilters` also calls `useSearchParams()` and is rendered under the page content.
- [confirmed] `/projects` and `/templates` already use the required Suspense pattern.

## Fix and verification

- Added a Suspense boundary around `WorkItemsPageContent`, matching the existing `/projects` and `/templates` pattern.
- Local production build verification: [passed] `npm run build` completed successfully; 51 static pages generated and `/work-items` was prerendered successfully.
