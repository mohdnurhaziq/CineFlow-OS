# CineFlow OS — Design System & UI Guidelines ("Nocturne Cine")

**Document Version**: 1.0.0  
**Design Identity**: "Nocturne Cine" — Obsidian Black, Titanium Slate & Brushed Amber  
**Craft Standard**: Inspired by Emil Kowalski UI Polish & Awwwards Gallery Principles  

---

## 1. Visual Philosophy: Anti-Slop & Cinematic Craft

CineFlow OS rejects generic SaaS templates (fuzzy purple gradient blobs, ornamental cards, and decorative noise). Every element serves a narrative, editorial, or operational purpose:

1. **Substance Over Ornament**: Large typographic hierarchy, rich real-world imagery of cinema gear (ARRI, RED, Hasselblad), and real editorial photography.
2. **Invisible Details Compound**: Micro-interactions that feel natural, tactile, and responsive.
3. **High-Contrast Operational Legibility**: High daylight contrast on-set modes for tablet and phone screens under direct outdoor lighting.

---

## 2. Color Tokens & Palette

| Token | Hex Value | Semantic Purpose |
| :--- | :--- | :--- |
| `--bg-base` | `#09090b` | Deep obsidian background for high contrast |
| `--bg-surface` | `#121215` | Elevated surface card background |
| `--bg-surface-elevated`| `#18181b` | Modals, drawers, and popovers |
| `--border-subtle` | `rgba(255, 255, 255, 0.08)` | Disciplined 1px panel boundaries |
| `--border-strong` | `#27272a` | Focused and active border outlines |
| `--accent-gold` | `#f59e0b` / `#d97706` | Brand highlights, CTAs, Golden Hour widgets |
| `--text-primary` | `#fafafa` | Headlines and high-priority figures |
| `--text-muted` | `#a1a1aa` | Labels, captions, EXIF metadata |
| `--status-success` | `#10b981` | Paid invoices, confirmed bookings, approved proofs |
| `--status-warning` | `#f59e0b` | Pending QR verification, held slots, review needed |
| `--status-danger` | `#ef4444` | Damaged gear alert, overdue invoices, expired holds |

---

## 3. Typography Scale & Hierarchy

- **Display & Section Headers**: `font-sans` with tight tracking (`tracking-tight` / `tracking-tighter`), bold or semibold weight (`font-semibold` / `font-bold`).
- **Body & Operational Tables**: Clean grotesque sans-serif with high legibility (`leading-relaxed`).
- **Technical & Time Figures**: Monospaced tabular numerals (`font-mono` / `tabular-nums`) for countdown timers, EXIF values, frame dimensions, and financial totals to prevent jitter.

---

## 4. Micro-Interactions & Emil Kowalski Standards

Every interactive element follows strict motion guidelines:

| Element | Interaction Rule | Rationale |
| :--- | :--- | :--- |
| **Buttons & CTAs** | `active:scale-[0.98] transition-transform duration-100` | Tactile feedback; buttons feel pressable |
| **Modals & Drawers** | Spring ease `cubic-bezier(0.16, 1, 0.3, 1)` | Mimics natural physical deceleration |
| **Slot Countdown** | Monospaced tabular numerals + pulse animation under 2 mins | Clear urgency without visual layout shifts |
| **Add-On Toggles** | Animated price counter recalculation | Client immediately feels the dynamic pricing |
| **Photo Lightbox** | Smooth zoom from thumbnail origin | Preserves spatial orientation |
| **Touch Signature Pad**| 60fps smooth quadratic curve smoothing | Mimics real ink pen on paper |

---

## 5. Web vs. Mobile/Tablet PWA Layout Strategies

```
┌───────────────────────────────────────────────┬───────────────────────────────────────────────┐
│               DESKTOP WIDESCREEN              │            MOBILE & TABLET ON-SET HUD         │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • Full Multi-column Kanban Project Pipeline   │ • Single-column stacked cards & swipe tabs    │
│ • Full-screen Proposal Builder & Terms editor │ • Large 48px+ touch targets for on-set gloves │
│ • Gear Inventory Table with multi-filters     │ • High-contrast solar & golden hour strip     │
│ • Studio Analytics charts & revenue graphs    │ • 1-tap WhatsApp alert dispatch button        │
│ • Dual-pane Print & Frame Wall Visualizer     │ • Full-screen mobile touch signature canvas   │
└───────────────────────────────────────────────┴───────────────────────────────────────────────┘
```
