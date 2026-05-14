---
name: Monolith Noir
colors:
  surface: '#141313'
  surface-dim: '#141313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353434'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c7c8'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c6c6c7'
  primary: '#ffffff'
  on-primary: '#2f3131'
  primary-container: '#e2e2e2'
  on-primary-container: '#636565'
  inverse-primary: '#5d5f5f'
  secondary: '#c7c6c6'
  on-secondary: '#2f3131'
  secondary-container: '#484949'
  on-secondary-container: '#b8b8b8'
  tertiary: '#ffffff'
  on-tertiary: '#2f3131'
  tertiary-container: '#e2e2e2'
  on-tertiary-container: '#636565'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c7'
  on-primary-fixed: '#1a1c1c'
  on-primary-fixed-variant: '#454747'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#141313'
  on-background: '#e5e2e1'
  surface-variant: '#353434'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  max-width: 1440px
---

## Brand & Style
The design system is engineered for high-performance enterprise environments and developer-centric tools. It prioritizes functional sophistication, clarity, and technical precision. By utilizing a monochromatic dark-mode aesthetic, it reduces cognitive load and eye strain for power users while evoking a sense of premium reliability.

The visual style blends **Minimalism** with a **High-Contrast** digital aesthetic. It leans heavily on the "Linear/Vercel" movement—utilizing deep obsidian backgrounds, crisp hairline borders, and stark white typography to create a workspace that feels fast, intentional, and authoritative.

## Colors
The palette is strictly monochromatic, relying on luminance and contrast rather than hue to establish hierarchy.

- **Primary Action:** Pure white (#FFFFFF) is reserved exclusively for primary calls to action, focus states, and high-priority information.
- **Secondary Content:** Light grey (#A3A3A3) provides a soft contrast for supporting text and icons, ensuring a clear distinction from the primary data.
- **Background Tiers:** The foundation is a deep black (#050505) for the base canvas, with secondary surfaces (cards, sidebars, navigation) using a slightly lighter charcoal (#171717).
- **Structure:** Hairline borders (#262626) define the architecture of the UI without introducing visual noise.

## Typography
The design system utilizes **Inter** across all levels to maintain a systematic and utilitarian feel. 

Headlines use semi-bold weights with tight letter-spacing to appear impactful and architectural. Body text prioritizes legibility with generous line heights. Small labels and metadata utilize medium weights and subtle tracking increases to maintain clarity at micro-scales. For mobile devices, headline sizes are aggressively scaled down to ensure content density remains high without compromising the minimalist structure.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy for desktop, centering the core application workspace within a max-width container to prevent information fragmentation on ultra-wide monitors. 

A strict 4px atomic spacing scale is used to define all gutters and paddings.
- **Desktop:** 12-column grid with 24px gutters and 32px outer margins.
- **Tablet:** 8-column grid with 20px gutters and 24px margins.
- **Mobile:** 4-column grid with 16px gutters and 16px margins.

Content should be grouped into logical "modules" or "sections" defined by subtle borders rather than heavy gaps, creating a cohesive, "dashboard-like" density typical of high-end developer tools.

## Elevation & Depth
Depth in the design system is achieved through **Tonal Layers** and **Low-contrast Outlines** rather than traditional shadows. 

- **Level 0 (Base):** Deep black (#050505) for the main application background.
- **Level 1 (Surface):** Dark grey (#171717) for cards, navigation panels, and input fields.
- **Level 2 (Overlays):** Modals and dropdown menus use the Level 1 background but are distinguished by a more pronounced border (#404040) to indicate they are floating above the interface.

Shadows are avoided entirely to maintain the "flat-but-layered" aesthetic. Visual hierarchy is instead reinforced by a 2px pure white focus ring on active elements, creating a "glow" effect against the dark backdrop.

## Shapes
The shape language is disciplined and geometric. A standard radius of **0.5rem (8px)** is applied to containers, buttons, and input fields to soften the industrial aesthetic just enough to feel modern and accessible without losing its professional edge. Larger components like cards or modals may scale up to 1rem (16px) for a more pronounced "frame" effect.

## Components

### Buttons
- **Primary:** Solid white background with black text (#050505). High impact.
- **Secondary:** Transparent background with #262626 border and white text.
- **Ghost:** No background or border, secondary text (#A3A3A3) that shifts to white on hover.

### Inputs & Form Fields
Fields use the #171717 background with a 1px border (#262626). On focus, the border remains, but a 2px solid white offset ring appears to clearly indicate the active state.

### Cards
Cards are defined by a #171717 background and a #262626 border. They do not use shadows. Headings within cards should be clearly separated by a horizontal hairline divider.

### Chips & Badges
Small, low-profile shapes with a #262626 background and #A3A3A3 text. Used for tags, status indicators (e.g., "Beta"), or counts.

### Lists
Interactive list items should have a subtle background hover state (#262626) with an instantaneous transition to feel snappy and responsive.

### Focus Rings
All interactive elements must exhibit a high-contrast white focus ring when navigated via keyboard, ensuring the system meets AAA accessibility standards within its dark-mode constraints.