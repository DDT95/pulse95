# Design QA — Carte de stress

- Source visual truth: user captures `/var/folders/3h/px_6bwl96w50x8y34bkz_k_80000gn/T/TemporaryItems/NSIRD_screencaptureui_MFDDwJ/Capture d’écran 2026-08-28 à 11.17.02.png`, `.../NSIRD_screencaptureui_RDXhah/Capture d’écran 2026-08-28 à 11.18.17.png`, `.../NSIRD_screencaptureui_KpZArG/Capture d’écran 2026-08-28 à 11.20.32.png`, and `.../NSIRD_screencaptureui_Wbcmev/Capture d’écran 2026-08-28 à 11.23.18.png`.
- Implementation: `http://127.0.0.1:8765/`, captured in the Codex in-app browser on 2026-08-28.
- Viewport: 1280 × 720 CSS px, device scale factor 1.
- State: map clicked near Ennery with diagnostic drawer open; departmental view opened separately.
- Source dimensions: supplied captures range from 1242 × 2048 to 4468 × 2498 px. Comparison used content regions rather than browser chrome because the source captures have different viewport sizes.
- Implementation screenshot: in-app browser capture from the local implementation, 1280 × 720 px.

## Full-view comparison evidence

The original drawer separated notes from a collapsed regulatory section and gave priority to the generic fiche label. The revised view leads with the commune and address, enlarges the global score, and places measurement, rule/classification, and source/freshness inside every criterion card. The departmental modal now uses a clear header, four current-data KPIs, and two structural exposure panels rather than a mostly empty grid.

## Focused region evidence

The diagnostic drawer was inspected at readable scale. The commune, BAN address, exact coordinates, current calculation time, note, measure, rule, and source are all visible in the intended hierarchy. The source screenshot’s main complaint—regulatory evidence separated from the note—is removed. A focused check was necessary because card labels and freshness text are too small to judge reliably in the full-page view.

## Findings and iteration history

1. Earlier P1: the global average diluted simultaneous rail, mobility, air/noise, and aircraft pressures. Fixed with an unweighted quadratic cumulative score, capped at 5.
2. Earlier P1: regulatory measures lived in a separate disclosure. Fixed by integrating evidence and classification into each card and PDF row.
3. Earlier P1: generic “Point sélectionné / Fiche de stress” hierarchy obscured the location. Fixed by promoting commune and address.
4. Earlier P2: departmental synthesis was sparse and noise-only. Fixed with current transport, road-traffic freshness, aircraft, weather, and clearer structural-noise sections.
5. Earlier P2: stale Sytadin data could appear current. Fixed with a 15-minute freshness gate; stale traffic is identified and excluded from the score.
6. Post-fix visual evidence: local browser capture shows the new branded header, location-first drawer, prominent score, evidence columns, and redesigned departmental modal. Browser console errors: none.

## Required fidelity surfaces

- Fonts and typography: Marianne retained; hierarchy strengthened with larger commune and score.
- Spacing and layout rhythm: evidence cards use consistent header and three-column proof grid; drawer remains scrollable.
- Colors and visual tokens: semantic stress colors are retained consistently for score, badge, and card edge.
- Image quality and assets: official prefecture logo and map assets are unchanged and remain sharp.
- Copy and content: “Carte de stress” replaces “Pulse 95” in the main experience and export; real-time versus profile/static data is explicitly labelled.

## Primary interactions tested

- Map click opens a diagnostic for the exact clicked coordinates.
- Departmental-view button opens the redesigned modal.
- Drawer content scrolls and exposes the PDF/data actions.
- No console errors were observed.

## Follow-up polish

- P3: add an official Météo-France vigilance feed when a stable public endpoint is wired; current weather observations already affect the score.

final result: passed
