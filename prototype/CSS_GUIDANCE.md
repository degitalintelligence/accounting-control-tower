# CSS & UI Guidance — Accounting Operations Control Tower

## 1. Visual strategy

Interface harus terasa seperti **control tower**, bukan task manager generik atau ERP lama. Visual hierarchy memakai neutral charcoal dan white; warna hanya dipakai untuk makna operasional.

- Charcoal: navigation, primary action, strong structure.
- Amber: attention, pending, due soon, partial progress.
- Green: verified, approved, healthy—jangan digunakan sekadar dekorasi.
- Red: critical, overdue, rejected, destructive action.
- Blue: neutral informational status.

## 2. Core tokens

```css
:root {
  --ink: #18201f;
  --ink-2: #26312f;
  --muted: #6f7a77;
  --muted-2: #98a19f;
  --canvas: #f3f5f2;
  --surface: #ffffff;
  --line: #dfe4e1;
  --line-soft: #edf0ee;
  --amber: #f4b63e;
  --amber-soft: #fff4d8;
  --green: #20865a;
  --green-soft: #e8f6ef;
  --red: #c94040;
  --red-soft: #fceded;
  --blue: #4267a9;
  --blue-soft: #eef3fb;
}
```

Gunakan semantic aliases di production seperti `--status-critical`, bukan menyebarkan hex code di component.

## 3. Typography

- Display/headings: Manrope 700–800.
- Body/UI: DM Sans 400–700.
- Base desktop: 14px; tables 12–13px; metadata 10–11px.
- Heading page: 28–32px.
- Gunakan uppercase + letter spacing hanya untuk eyebrow/label kecil.
- Angka KPI gunakan tabular numerals: `font-variant-numeric: tabular-nums`.

## 4. Spacing system

Base unit 4px. Allowed scale: `4, 8, 12, 16, 20, 24, 32, 40, 48`.

- Page padding: 30–32px desktop, 14–20px mobile.
- Card padding: 16–20px.
- Grid gap: 12–16px.
- Table row: minimum 44px.
- Click target: minimum 40×40px; mobile 44×44px.

## 5. Surfaces and depth

```css
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgb(24 32 31 / 4%),
              0 8px 30px rgb(24 32 31 / 4.5%);
}
```

Gunakan shadow tipis. Struktur utama dibentuk oleh border dan whitespace. Hindari glassmorphism, gradient dekoratif, dan shadow berat.

## 6. Status vocabulary

| Meaning | Foreground | Background | Usage |
|---|---|---|---|
| Critical/Overdue | `#C94040` | `#FCEDED` | Critical exception only |
| Due soon/Partial | `#926214` | `#FFF4D8` | Attention without failure |
| Approved/Healthy | `#20865A` | `#E8F6EF` | Verified state only |
| Informational | `#4267A9` | `#EEF3FB` | Normal/on track |
| Blocked/Neutral | `#66716E` | `#EDF0EF` | Waiting or inactive |

Status tidak boleh dibedakan hanya dengan warna. Selalu sertakan text/icon.

## 7. Component rules

### Buttons

- Primary: satu per local decision area.
- Secondary outline: alternative action.
- Ghost: low-priority or navigation action.
- Destructive: red only after confirmation.
- Loading state wajib mencegah duplicate submit.

### Cards

- Setiap card memiliki satu purpose dan satu primary takeaway.
- Header: title + one-line description + optional action.
- Jangan meletakkan lebih dari tiga nested card levels.

### Table/list

- List/table adalah primary view accounting, bukan Kanban.
- Sticky header untuk daftar panjang.
- Kolom identitas di kiri; status/action di kanan.
- Gunakan row expansion untuk child/evidence—jangan pindahkan user tanpa kebutuhan.

### Parent–child tree

- Parent memakai stronger weight dan neutral background.
- Child indent 24px per level.
- Maksimal tiga level.
- Parent roll-up menunjukkan approved count, weighted progress, dan health flag.

### Form

- Label selalu terlihat; jangan mengandalkan placeholder.
- Required/optional harus eksplisit.
- Assignment conflict ditampilkan inline sebelum submit.
- Due date selalu menampilkan timezone.
- Advanced controls disembunyikan dalam progressive disclosure.

### Modal

- Hanya untuk bounded action seperti create/edit/approve.
- Complex workflow menggunakan dedicated page/drawer.
- Escape dan backdrop menutup modal kecuali ada unsaved destructive change.

## 8. Layout

- Sidebar: 240–248px desktop.
- Top bar: 64–68px.
- Content max width: 1440px.
- Desktop dashboard: 12-column grid.
- Tablet: cards turun menjadi 2 column.
- Mobile: 1 column; sidebar menjadi drawer.

Exception Center harus berada sebelum activity feed. Review queue dan WhatsApp suggestions adalah actionable queues, bukan sekadar statistik.

## 9. Interaction and motion

- Motion duration: 140–220ms.
- Use `ease-out` for entrance and `ease-in` for exit.
- Hover lift maksimum 1px.
- Jangan animate KPI atau progress setiap page load secara berlebihan.
- Respect `prefers-reduced-motion`.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```

## 10. Accessibility

- Minimum contrast WCAG AA.
- Visible focus ring on keyboard navigation.
- Icon-only buttons require `aria-label`.
- Modal requires focus trap in production.
- Status announcements and toast use appropriate live region.
- Charts require textual equivalent.
- Do not encode risk solely by red/green.

## 11. Engineering conventions

- Use CSS variables/tokens; no ad hoc hex values inside components.
- Prefer CSS Grid for page composition and table-like structured lists.
- Prefer Flexbox for local alignment.
- Use `data-status`/component variants, not brittle descendant selectors.
- Keep component CSS colocated or use CSS Modules/Tailwind tokens consistently; do not mix systems casually.
- Add visual regression coverage for status badges, parent–child rows, modal, empty/loading/error, and responsive layouts.
- Treat prototype emoji icons as placeholders; production uses one consistent icon set such as Lucide.

## 12. States every screen must support

1. Loading/skeleton.
2. Empty with next action.
3. Partial data.
4. Permission denied.
5. Provider disconnected.
6. Error with retry.
7. Success confirmation.
8. Stale data/sync delay.

## 13. UX guardrails

- Dashboard manager shows exceptions first, not all team activity.
- Natural-language WhatsApp findings remain suggestions until confirmed in MVP.
- Approval action always shows evidence/checklist context.
- Changing assignee or due date after submission requires a reason.
- “Overdue” is system-computed; users cannot manually select it.
- Maker and checker conflict must be rejected server-side as well as surfaced in UI.
