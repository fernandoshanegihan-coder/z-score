# Connect the community estimate

The calculator shows a clearly labeled historical reference estimate where available. Shared estimates and contributions become available after the Supabase setup below.

1. Create a Supabase project.
2. From the project folder, run `npm install` to install the project-local CLI, then `npx supabase login` and `npx supabase link --project-ref YOUR_PROJECT_REF`.
3. Apply the database migration with `npx supabase db push`.
4. Deploy the function with `npx supabase functions deploy community-zscore`.
5. In `community-config.js`, set `endpoint` to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/community-zscore` and `publishableKey` to the project's publishable key.
6. Publish the static site over HTTPS.

The Edge Function uses the project's server-side Supabase secret key to call restricted database functions. Never put a secret or service-role key in `community-config.js` or any browser file. Supabase provides `SUPABASE_URL` to the function; configure a server-side `SUPABASE_SECRET_KEYS` JSON secret if your project does not expose the default secret key automatically.

The community estimate uses self-reported marks. The opt-in confirmation discourages false entries, but the function cannot verify marks against exam records. A per-network HMAC rate limit allows at most 10 submissions per hour; raw network addresses are not stored. Opted-in marks are held in the restricted private schema for up to 30 days so an operator can remove an incorrect submission. After that, individual marks are deleted while aggregate totals remain. The 101-contribution threshold does not establish representativeness. Subjects without enough community data fall back to the labeled historical reference when available.

## Review or remove an incorrect submission

There is no admin page inside the calculator. Use the Supabase Dashboard for the linked project and open **SQL Editor**. This runs with project-owner access; do not expose these queries or database credentials in the public app.

To review submissions that are still within the 30-day review window:

```sql
select submission_id, created_at, marks
from private.contribution_batches
where marks is not null
order by created_at desc;
```

To remove one row and subtract its three marks from the subject aggregates, run:

```sql
select public.remove_community_marks('PASTE-SUBMISSION-ID-HERE'::uuid);
```

The function returns `removed` when it corrects the totals. Rows from before this review feature, or rows whose 30-day window has expired, have no saved marks and cannot be individually removed. The private rate-limit table stores only an HMAC of the network address and hourly bucket; old buckets and expired review marks are cleared when the Edge Function receives requests.
