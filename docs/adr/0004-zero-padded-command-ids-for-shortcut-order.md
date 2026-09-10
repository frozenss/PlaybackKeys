# Zero-padded Command ids for Chrome shortcut order

Chrome’s extension shortcuts page sorts Commands by **command name string**, not by manifest insertion order and not by the order PlaybackKeys shows in its own Settings. Unpadded ids made `10-` / `11-` sort next to `1-`, and the historical numbering (`3`/`4` Skip, then `5`/`6`/`7` non-Skip, then more Skip) split the three Skip back/forward pairs across the list. We renumber the full Command set with **zero-padded ids** so non-Skip Commands come first and the six Skip Commands form one contiguous block (back/forward for intervals 1–3). Users must rebind affected chords after upgrade; that cost is accepted so the browser page matches the product grouping.

**Status:** accepted

This replaces the ADR-0002 choice to keep Interval 1 on `3-skip-back` / `4-skip-forward` for binding survival. ADR-0002’s other decisions still hold: three static Skip intervals, six manifest Skip Commands, slot-based Chrome labels, no dynamic command add/remove.

## Considered options

- **Rename only `10-` / `11-`.** Rejected: fixes the worst lexicographic glitch but leaves Skip pairs split among speed/switch Commands.
- **Keep non-Skip ids; rename only the six Skip Commands into a contiguous block.** Rejected: still a breaking Skip rebind for a half-clean scheme; full zero-pad is clearer in changelog and code.
- **Leave browser order wrong; rely on in-extension sorted lists.** Rejected: users bind keys on `chrome://extensions/shortcuts` (and Edge’s equivalent), so that page is the source of truth for discovery.

## Consequences

- Target shape (zero-padded): non-Skip Commands in product order, then Skip back/forward for intervals 1, 2, and 3 as one block (exact id strings live in `manifest.json`).
- Existing user bindings on old ids are dropped by Chrome on id rename; release notes must tell users to rebind.
- In-extension shortcut lists should keep matching this product order (not raw `getAll()` order).
