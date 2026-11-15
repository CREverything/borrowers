# Issue reports

Borrowers and lenders can report a problem with a borrowing from **My requests**: the quiet **Report an issue** link on each request row and active loan card.

## What happens to a report

- It's saved to the `issue_reports` table in TigerData with status `open`.
- Nothing else changes. A report never alters the borrowing, moves Switchies, cancels a booking or penalises anyone.
- The reporter can see their own reports (item, category, date, status, ID) under **My reports** on their profile. Nobody else can, and `reviewer_notes` is never sent to the browser.
- There's no admin interface and no notification to anyone. Reports wait in the database until someone reviews them by hand.

## API

| Method | Path | Who | What |
| --- | --- | --- | --- |
| `POST` | `/api/reports` | Logged in, borrower or lender of the booking | Body: `bookingId`, `category`, `description` (10–1,000 characters), `clientNonce` (UUID made per form). Returns `{ id, status, createdAt }`. |
| `GET` | `/api/reports` | Logged in | Your own reports. |

- The reporter is always the verified session user; any user id in the body is ignored.
- If you weren't part of the booking, you get the same `404` as for a booking that doesn't exist.
- **Duplicates:** resubmitting the same form (same `clientNonce`), or an identical report about the same booking within 10 minutes, returns the original report (`200`) instead of creating another.
- **Rate limit:** 5 reports per person per hour (`429` after that). Submissions from one person are serialised with an advisory lock, so the limit can't be raced.
- Categories: `damaged`, `not_returned`, `not_as_described`, `pickup_return`, `conduct`, `other`.
- Report text is never logged.

## Reviewing reports

There's no admin tooling. Use TigerData's SQL editor (or `psql` with your own credentials).

Unresolved reports:

```sql
SELECT id, category, status, created_at
FROM issue_reports
WHERE status IN ('open', 'reviewing')
ORDER BY created_at DESC;
```

One report with the borrowing it's about:

```sql
SELECT r.id, r.category, r.description, r.status, r.created_at,
       r.reporter_id, b.id AS booking_id, b.borrower_id, b.lender_id, i.title
FROM issue_reports r
JOIN borrow_requests b ON b.id = r.booking_id
JOIN items i ON i.id = b.item_id
WHERE r.id = '<report id>';
```

Recording a decision (the reporter sees the new status; they never see the notes):

```sql
UPDATE issue_reports
SET status = 'resolved', reviewed_at = now(), updated_at = now(),
    reviewer_notes = 'Spoke to both parties; item replaced.'
WHERE id = '<report id>';
```

Status values: `open`, `reviewing`, `resolved`, `dismissed`.

## Setup

The table is created by the normal migration: `npm --prefix backend run db:migrate`. It only adds things and is safe to re-run.
