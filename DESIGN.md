# Design notes

## Interface

The app is a bilingual Z-score estimate calculator. It has three searchable subject selectors, raw-mark inputs, a contribution option that is off by default, a confirmation dialog, live contribution progress, and an estimate panel. Subjects without 101 community contributions use a clearly labeled 2017–2019 historical reference when available; ready subjects use community data. Results are labeled unofficial. At tablet widths the columns tighten; below 700px they stack, and below 480px the form and explanatory panels use a single-column layout.

## Visual system

The interface uses a bright academic palette: lavender page background, white work surface, deep indigo text and outlines, with blue, coral, yellow, lilac, and cyan accents. Panels use bold outlines, rounded corners, and flat fills. Headings use Century Gothic when available; body copy and controls use Segoe UI with Noto Sans Sinhala in the fallback stack. Functional text is at least 11px.

## Interaction and accessibility

- The page includes a skip link, visible keyboard focus, reduced-motion support, and responsive layouts.
- The language controls update interface labels, document language, and the title.
- Subject menus support search and prevent selecting the same subject twice.
- The form checks that three distinct subjects and whole-number marks from 0 to 100 are provided.
- The contribution option is off by default. Checking it opens a confirmation that asks for actual 2026 results and warns that guessed or false marks can distort the shared estimate.
- After an estimate is displayed, a delayed, dismissible inline prompt invites students with official 2026 results to contribute. The prompt opens the same confirmation and does not submit data itself.
- Contribution is available only when the Supabase service is configured and community statistics can be loaded. A successful contribution updates aggregates and refreshes displayed progress.
- Historical reference statistics are used before community data reaches 101 contributions for a subject. The interface labels those values as historical; ready subjects use community means and sample standard deviations. It says contributions are self-reported and both estimates are unofficial.
- Marks are not sent unless the student opts in and confirms. The database stores anonymous aggregates and opaque submission IDs, not individual marks or identity fields.

## Palette

The principal colors are `#f3f2ff` (page), `#ffffff` (surface), `#27294f` (ink and outlines), `#4c5ff0` (blue), `#ef776a` (coral), `#f7d96f` (yellow), `#e9e5ff` (lilac), and `#e1f5f6` (cyan). The implementation tokens are defined at the top of `styles.css`.
