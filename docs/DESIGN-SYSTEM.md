# Design system

The requirement was uniform design across iOS, Android, and the web. This is how
that is enforced rather than merely intended.

---

## The one rule

**Nothing outside `src/design/` sets a colour, a font size, or a shadow.**

Screens compose primitives and pick tokens. They never write `#F26B2B`, never
write `fontSize: 17`, never write a `shadowOffset`. Every value that could drift
between platforms has exactly one definition, so drift is not something to
police in review — it is not expressible.

---

## Tokens — `design/tokens.ts`

### Colour

Dark-first, and single-theme by product decision, not preference: the app is
used on set at night, in edit bays, and in colour suites, where a light UI is
genuinely unusable.

| Role | Token | Value |
|---|---|---|
| Page ground | `bg` | `#0E1626` |
| Raised (header, nav, sheets) | `bgElev` | `#152039` |
| Cards | `surface` | `#1C2942` |
| Nested cards, inputs | `surfaceAlt` | `#25334F` |
| Pressed / hovered | `surfaceHot` | `#2C3B5B` |
| Primary action | `accent` | `#F26B2B` |
| Wordmark, Super Pitch, info | `brand` | `#2F7FF6` |
| Success / warning / danger | `success` `warning` `danger` | `#35C77E` `#F2B33D` `#E8524A` |
| Text | `text` `textMuted` `textFaint` | `#F3F6FB` `#94A6C4` `#61759B` |

Each semantic colour also has a `Soft` variant (14–15% alpha) for chip fills, so
a tinted background is never hand-mixed at the call site.

`color.series` is the categorical ramp for charts, ordered so the first two
entries stay distinguishable for the most common two-series case.

### Type

Ten variants — `display` `title` `heading` `subheading` `body` `bodyStrong`
`label` `caption` `micro` `overline` `numeric` — each fixing size, line height,
weight, and tracking together. A screen picks a variant and a tone:

```tsx
<Text variant="subheading" tone="muted">Detective Ruiz</Text>
<Text variant="numeric" tone="success">{formatMoney(cents)}</Text>
```

`fontFamily` resolves per platform (`System` / `sans-serif` / a web stack) so the
app reads native everywhere without shipping a webfont, while the rhythm stays
identical.

### Spacing, radius, elevation

Spacing is a 4-based scale (`xxs` 4 → `huge` 40). Radius runs `xs` 6 → `pill`.

`elevation(0–3)` emits the correct primitive per platform — `boxShadow` on web,
`elevation` on Android, `shadowOffset`/`shadowRadius`/`shadowOpacity` on iOS.
React Native and the web disagree about shadows; approximating one with the
other is what makes a "same" design look subtly wrong on one platform.

---

## Primitives — `design/primitives.tsx`

`Row` `Stack` `Card` `Button` `Pill` `Avatar` `Photo` `Stat` `Toggle` `Divider`
`SectionTitle` `EmptyState` `Loading` `ErrorNote`.

Two are worth calling out.

**`Avatar` / `Photo`** render a deterministic gradient plus initials
*immediately*, then swap in the remote image on load. If the photo is slow,
blocked, or the device is offline, the card still looks finished — a roster of
forty cards never shows a grid of grey holes. The gradient is hashed from the
name, so a given person always gets the same one.

**`Button`** has six variants and three sizes, and always renders its own
pressed and hovered states rather than relying on platform ink or highlight,
which differ.

---

## Charts — `design/charts.tsx`

`LineChart` `Sparkline` `Gauge` `BarChart` `ShareBar` `MilestoneTrack`
`HeatMap` `Waveform`.

All inline SVG. No charting dependency, no canvas fallbacks, identical output on
three platforms. Each chart takes plain numbers and does its own scaling, so
screens never pre-format data for display.

Two details that took a bug to get right:

- **Axis labels share one unit and one precision**, chosen from the largest
  tick. Formatting each tick independently produces axes like
  `0, 425K, 851K, 1M, 2M`, where the top two look rounder than the rest and the
  spacing reads as non-linear.
- **Line smoothing is Catmull-Rom→Bezier**, which stays inside the data. A
  naive spline overshoots, and an overshooting line on a reach chart draws
  values that were never measured.

---

## Map — `design/GeoMap.tsx`

The map draws its own basemap instead of embedding a native map SDK. Three
reasons: a native SDK behaves and looks different on each platform (defeating
the point), it needs per-platform API keys, and it has no web story that matches
the mobile styling. Everything the product needs from a map here — relative
position, a radius, tappable pins — is geometry.

The drawing surface matches the container's measured aspect ratio rather than a
fixed square, so a wide desktop map is not a cropped or stretched phone map. The
street grid is seeded from the map centre, so the same location always draws the
same streets; a basemap that reshuffles on every render reads as noise.

Pin tap targets are real `Pressable`s layered above the SVG, so hit areas behave
natively rather than relying on SVG event handling.

---

## Responsive behaviour — `features/shell/useResponsive.ts`

One hook, three breakpoints, and screens ask for intent rather than measuring
themselves:

| Width | `compact` | Navigation | Columns |
|---|---|---|---|
| < 900 | true | Bottom tab bar | 1 |
| 900–1279 | false | Icon rail (76px) | 2 |
| ≥ 1280 | false | Full rail (244px) | 2–3 |

Content is capped at 1180px so the web build does not sprawl on a large display.
Screens that need a second column check `compact` and reflow; everything else
inherits the behaviour.

---

## Layout grammar

Every screen uses the same structure, which is most of why they feel like one
product:

```
Header            hamburger · SLATE wordmark · search
Title strip       — SECTION  ACCENT
Content           cards on the page ground, 16/24px gutter
Action bar        sticky primary action (decks, wizards)
Navigation        tabs or rail
```

Inside content, `SectionTitle` gives the `— LABEL  ACCENT` treatment, `Card`
gives the container, and `Stat` gives the label-over-value block used in every
metric row. A new screen composes those three and lands on-style by default.

---

## Icons — `design/Icon.tsx`

Fifty-odd hand-drawn stroke paths on a 24-unit grid. Vectors rather than an icon
font because fonts need per-platform asset loading and render at different
optical weights on iOS, Android, and the web. Every icon inherits stroke colour
and width from the caller, so an icon inside a muted row is muted without a
second token lookup.

---

## Accessibility

- Every interactive element carries `accessibilityRole` and, where the label is
  not its text, `accessibilityLabel`.
- Toggles expose `accessibilityRole="switch"` with checked state; tabs expose
  `selected`; filter chips expose `checkbox`/`radio` as appropriate.
- Keyboard focus is visible on web (`:focus-visible` ring in `global.css`) while
  pointer focus is not.
- Nested pressables are avoided: on web, react-native-web renders a `Pressable`
  as a `<button>`, and a button inside a button is invalid HTML that breaks
  hydration and keyboard traversal. Where a card is tappable, actions inside it
  are presentational.
- Body text sits at 14.5px/21 with muted text at a 4.6:1 contrast ratio against
  `surface`.

---

## Adding a screen

1. Route file under `src/app/<workspace>/`.
2. Wrap in `<Screen title="..." accent="...">`.
3. Compose `Card`, `Row`, `Stack`, `SectionTitle`, `Stat`, `Text`.
4. Fetch with `useQuery`, mutate with `useMutation`; handle `loading`, `error`,
   and empty explicitly — `Loading`, `ErrorNote`, and `EmptyState` exist so
   those three states are never skipped.
5. Add it to `lib/nav.ts` — that one entry feeds the tab bar, the rail, the menu
   sheet, and search.

If a value is not available as a token, add it to `tokens.ts` rather than
inlining it. That is the whole discipline.
