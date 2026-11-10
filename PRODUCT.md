# Product

## Current state

This is a bilingual browser calculator for Sri Lankan G.C.E. Advanced Level students. Students can enter marks privately or optionally contribute actual 2026 results to anonymous subject aggregates through a Supabase Edge Function.

## What students can do

- Choose English or Sinhala.
- Select three distinct subjects from the list and enter marks from 0 to 100.
- Before community data is ready, view a clearly labeled historical reference estimate for subjects with complete 2017–2019 data. Once each selected subject reaches 101 contributions, the app switches to the 2026 community estimate, using `(mark − community mean) ÷ sample standard deviation` and averaging the three subject Z-scores.
- After viewing an estimate, students with loaded community data see a dismissible optional prompt to share official 2026 marks. It opens the existing confirmation and never submits on its own.
- Keep marks in the browser by default. Contribution requires an explicit checkbox and confirmation, is limited to the three selected marks, and can be removed by an operator during the 30-day review window.

## Data and limitations

The historical reference uses the Department of Examinations, Statistical Handbook 2017–2019, Table 3.14.1 (2017, 2018, and 2019 New syllabus means and standard deviations). Contributions are self-reported and are not verified against examination records. The confirmation warns that guessed or false marks can distort everyone’s estimate. Counts below 101 are visible, while means and standard deviations are withheld until the subject reaches the threshold. The 101 threshold is a product display threshold, not proof that a sample is representative or authentic. Both estimates are unofficial and must not guide university admission.

The database stores per-subject counts, sums, and squared sums. Opted-in marks are kept in restricted storage for up to 30 days so an incorrect submission can be removed; after that, individual marks are deleted. No names or index numbers are collected. A one-way HMAC of the requester network address is retained for up to 48 hours for rate limiting; the raw address is not stored. The estimate is unavailable until a Supabase project is configured and has sufficient contributions.

## Files

- `index.html`: page structure and interface copy.
- `styles.css`: responsive visual styling.
- `subjects.js` and `copy.js`: bilingual subjects and interface messages.
- `community-app.js`: subject selection, validation, private estimates, contribution consent, and API integration.
- `community-stats.js`: estimate calculation from community aggregates.
- `historical-stats.js`: historical reference values used until a subject has enough 2026 contributions.
- `community-config.js`: public Edge Function URL and Supabase publishable key placeholders.
- `supabase/`: database migrations, Edge Function, and operator instructions for reviewing and removing contributions.
- `assets/gemini-mascot.svg`: header illustration.
- `DESIGN.md`: current interface design notes.
