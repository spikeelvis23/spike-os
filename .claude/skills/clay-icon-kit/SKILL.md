---
name: clay-icon-kit
description: Build soft 3D "clay" (claymorphism) icon buttons and tiles in plain HTML, CSS and JavaScript, with brand palettes and a dashboard theme version. Use whenever someone wants puffy, pastel, 3D-looking, app-style, or claymorphism icons or buttons, a launcher grid, category buttons for a menu or store, or brand-colored icon tiles, even if they never say "clay".
---

# Clay Icon Kit

Clay icons are rounded tiles that look like soft modeling clay: a puffy surface, a light top edge, a shaded bottom edge, and a shadow on the "floor." Everything is CSS, so no image files are needed, the icons scale perfectly, and any color can be swapped in one line.

Use this kit to build them, teach how they work, and adapt them to a brand.

## Files in this skill
- `assets/clay-pastel-template.html`: a complete working demo with 6 pastel tiles. Copy it as the starting point.
- `assets/clay-bsc-template.html`: the same demo in the Bland Sheep Crew palette, including the dark-tile shadow fix.
- `assets/sidebar-clay-tiles.css`: small clay tiles behind sidebar icons, scoped to one theme (`:root[data-theme="bsc"]`). Use it when adding clay icons to an existing dashboard that switches themes with CSS variables.

Read the template that fits the request, and build from it instead of starting from scratch. The templates are tested and have no console errors.

## The core recipe

```css
.clay {
    --tile: #f7dc78;   /* clay color */
    --ink: #e8685a;    /* icon color */
    width: 96px;
    height: 96px;
    border: none;
    border-radius: 28px;           /* about 30% of the size = puffy */
    background: var(--tile);
    display: grid;
    place-items: center;
    box-shadow:
        inset 0 5px 8px rgba(255, 255, 255, 0.6),   /* light on the top edge */
        inset 0 -7px 12px rgba(0, 0, 0, 0.12),      /* shade on the bottom edge */
        0 16px 26px -10px rgba(0, 0, 0, 0.3);       /* floor shadow */
    transition: transform 0.2s, box-shadow 0.2s;
}
.clay:hover  { transform: translateY(-5px); /* plus a floor shadow in var(--tile) = colored underglow */ }
.clay:active { transform: translateY(1px) scale(0.96); /* squish, like pressing clay */ }
.clay .icon  {
    color: var(--ink);
    fill: color-mix(in srgb, var(--ink) 30%, transparent); /* soft filled inside */
    stroke: currentColor;
    filter: drop-shadow(0 2px 1px rgba(0, 0, 0, 0.18));     /* icon sits on the clay */
}
```

Why it works. Explain this when teaching:
| Shadow | Effect | Why it reads as clay |
|---|---|---|
| `inset` white, pushed down | lights the inside of the top edge | light from above hitting a curved surface |
| `inset` dark, pushed up | darkens the inside of the bottom edge | the underside curves away from the light |
| outside shadow, pushed down, negative spread | soft shadow under the tile | the tile floats above the table |

## Colors
Each color is one class that sets two variables:
```css
.clay-butter { --tile: #f7dc78; --ink: #e8685a; }
```
- **Light or pastel tiles** use the recipe as-is, with a bold, contrasting ink color.
- **Dark tiles** (black, deep red, charcoal) need their own shadows. Use a weaker highlight (about 0.18 instead of 0.6) and a stronger shade (about 0.35), or the white edge looks chalky. The BSC template shows how.
- Place clay tiles on a light, warm background (bone, light grey). On very dark backgrounds the floor shadow disappears and the effect goes flat.

### Palettes included
| Palette | Tiles (tile / ink) |
|---|---|
| Pastel | pink `#f3c1c4`/`#b2424f`, sage `#9fc39a`/`#e5675d`, sky `#a9cdf2`/`#fff`, butter `#f7dc78`/`#e8685a`, mint `#94e0c4`/`#2f8f73`, coral `#f49883`/`#3f9a6e` |
| Bland Sheep Crew | black sheep `#1f1d1b`/`#f1e9da`, wool `#efe6d6`/`#1f1d1b`, concrete `#a9a49c`/`#1f1d1b`, gold chain `#d6a73a`/`#1f1d1b`, brick `#b4462f`/`#f1e9da`, smoke `#4a4743`/`#d6a73a`; background bone `#e6dfd2` |

For a new brand, pick 4 to 6 tile colors from the brand, give each one a high-contrast ink, and mark which tiles are dark so they get the dark shadows.

## Icons
The templates use line icons drawn as SVG paths in a `ICONS` object, created with `document.createElementNS('http://www.w3.org/2000/svg', 'svg')`. Because they use `stroke="currentColor"`, setting `color` on the icon recolors it. Emoji also work inside a tile (set `font-size` to about 44px), but SVG looks sharper and takes the ink color.

## Code style
Write modern, beginner-readable JavaScript: `const`, arrow functions, `forEach`, `createElement`, `textContent`, `addEventListener`. Build tiles from a data array (`{ name, label, color }`), never with inline `onclick`. Use `<button>` elements with `aria-label` so tiles work with the keyboard and screen readers.

## Adding clay icons to a themed dashboard
If the site switches themes with `<html data-theme="...">` and CSS variables:
1. Add a theme block with a light background: `:root[data-theme="brand"] { --bg: ...; }`.
2. Scope the clay rules to that theme, as in `assets/sidebar-clay-tiles.css`, so other themes stay flat.
3. Give each nav button its colors with an attribute selector: `.nav-btn[data-tab="projects"] { --tile: ...; --ink: ...; }`.
4. Wrap each icon spot (`[data-icon]`) in a small tile (32px, `border-radius: 10px`) with scaled-down shadows.
5. Test by switching between themes and confirming the other themes look unchanged.

## Testing and delivery
Before handing over code, open the page in a headless browser (Playwright or similar), hover one tile, take a screenshot, and confirm there are no console errors. Show the screenshot. Deliver the HTML file, and explain the three shadows in plain words.

## Teaching mode
If the person is learning to code, end with one small hands-on change and what they should see. For example: change `--tile` in one color class to `#c9b6f2` and the tile turns lavender, or set `border-radius` to `48px` and it becomes a circle.
