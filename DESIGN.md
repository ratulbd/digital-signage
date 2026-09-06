# Design System Strategy: Digital Dash

## 1. Overview & Creative North Star: "The Luminous Curator"
The design system for Digital Dash is built on the concept of **"The Luminous Curator."** In the world of digital signage, clarity and impact are everything. This system rejects the cluttered, "dense-grid" approach of traditional enterprise software. Instead, it treats the dashboard as a high-end gallery space.

By utilizing **intentional asymmetry**, **glassmorphism**, and **tonal depth**, we create an environment where data doesn’t just sit on a screen—it floats within a structured, atmospheric space. We break the "template" look by favoring wide-open white space over rigid borders, and by using dramatic typographic scales to establish an editorial hierarchy that feels both authoritative and effortless.

---

## 2. Colors & Surface Architecture
The palette is a sophisticated blend of deep Indigo and cool Slate-Grays, designed to feel premium and technologically advanced.

### The "No-Line" Rule
**Designers are strictly prohibited from using 1px solid borders to define sections.** 
Structure must be achieved through:
*   **Background Shifts:** Using `surface` vs. `surface_container_low`.
*   **Tonal Transitions:** Defining edges through subtle contrast.
*   **Negative Space:** Using generous padding to imply boundaries.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—stacked sheets of frosted glass.
*   **Base Layer:** `background` (#f8f9ff).
*   **Sectioning:** Use `surface_container` or `surface_container_low` to define large functional areas.
*   **Interactive Containers:** Use `surface_container_lowest` (Pure White) for cards to create a "lifted" appearance against the cool background.

### The "Glass & Gradient" Rule
For floating elements (modals, dropdowns, or hovering status cards), use **Glassmorphism**:
*   **Fill:** `surface_container_low` at 70% opacity.
*   **Effect:** 12px–20px Backdrop Blur.
*   **Signature Texture:** Apply a subtle linear gradient to Primary CTAs, transitioning from `primary` (#24389c) to `primary_container` (#3f51b5) at a 135-degree angle. This adds a "soul" to the action buttons that flat colors cannot replicate.

---

## 3. Typography: Editorial Authority
We utilize a dual-typeface system to balance high-end "Display" aesthetics with functional "Interface" clarity.

*   **Display & Headlines (Manrope):** These are your "Statement" layers. Use `display-lg` and `headline-lg` with generous tracking (-0.02em) to create an expensive, editorial feel. These should be used for high-level metrics and page titles.
*   **Interface & Labels (Inter):** Used for the "Work" layers. Inter provides exceptional legibility at small sizes. Use `label-md` for metadata and `body-md` for standard dashboard data.
*   **Tonal Contrast:** Use `on_surface` for headlines to command attention, while using `on_surface_variant` (#454652) for secondary labels to create a natural visual falloff.

---

## 4. Elevation & Depth
In this system, depth is a function of light and translucency, not just shadow.

### The Layering Principle
Achieve hierarchy by "stacking" container tiers. A `surface_container_lowest` card placed atop a `surface_container` section creates a soft, natural lift. This mimics how paper or glass behaves in the real world.

### Ambient Shadows
Avoid harsh, dark shadows. When an element must "float" (e.g., a critical alert or a navigation popover):
*   **Shadow Color:** Use a tinted version of `on_surface` (Indigo-tinted black).
*   **Blur:** Minimum 24px.
*   **Opacity:** 4% to 8%.
*   **Result:** A soft "glow" of shadow that feels integrated into the atmosphere.

### The "Ghost Border" Fallback
If a boundary is required for accessibility (e.g., in high-contrast modes or input fields), use a **Ghost Border**:
*   **Token:** `outline_variant` (#c5c5d4).
*   **Opacity:** 20% max. 
*   **Constraint:** Never use 100% opaque borders for decorative containment.

---

## 5. Components

### Primary Buttons
*   **Style:** Gradient fill (`primary` to `primary_container`).
*   **Corner Radius:** `xl` (0.75rem) for a modern, friendly feel.
*   **Typography:** `label-md` (Inter), Uppercase with 0.05em tracking for a "luxury brand" touch.

### Glass Cards (Digital Signage Previews)
*   **Background:** `surface_container_lowest` at 80% opacity + backdrop blur.
*   **Interaction:** On hover, transition the `outline_variant` ghost border from 0% to 20% opacity and increase the ambient shadow spread.
*   **Constraint:** No dividers. Use 24px vertical padding between card items.

### Content Lists
*   **Rule:** Forbid 1px horizontal dividers.
*   **Separation:** Use alternating `surface` and `surface_container_low` backgrounds, or simply 16px of vertical white space.

### Status Chips
*   **Execution:** Small, pill-shaped (`full` roundedness).
*   **Colors:** Use `tertiary_container` for alerts and `primary_container` for active states. Keep the background desaturated and the text (`on_tertiary_container`) high contrast for readability.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use "Optical Alignment." Sometimes a glass card needs 2px more padding on the left to *look* centered due to the blur.
*   **Do** embrace asymmetry. In a signage preview, let the image take 60% of the card width while metadata takes 40%.
*   **Do** use `surface_bright` to highlight the most important "Live" signage feed.

### Don’t
*   **Don’t** use pure black (#000000) for text. Always use `on_surface` (#0d1c2e) to maintain the Indigo-Slate tonal harmony.
*   **Don’t** use standard "Drop Shadows." If it looks like a default Photoshop shadow, it’s wrong. It should look like an ambient occlusion.
*   **Don’t** crowd the interface. If you can’t fit it with 32px of breathing room, it belongs in a sub-menu or a "Drawer" (using glassmorphism).

---

## 7. Context-Specific Elements: The "Live Stream" Preview
Since this is for Digital Signage Management, the "Live Feed" component is critical. 
*   **Frame:** Use a `surface_dim` outer frame to mimic the physical bezel of a screen.
*   **Overlay:** Use `surface_container_highest` at 40% opacity for on-screen controls (Play/Pause/Edit) to ensure they are visible over any video content while maintaining the glass aesthetic.