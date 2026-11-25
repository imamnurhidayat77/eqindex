---
name: microinteractions
description: Implement and review small UI interactions using studied examples with exact timing, easing, accessibility notes, copyable HTML, CSS, JavaScript, and Tailwind source, and React components installable with shadcn.
---

# Microinteractions

Studies of small UI interactions from https://microinteractions.dev/. Each study explains why its timing and easing were chosen and ships complete source.

## When to use

Use this skill when building or reviewing one of the interactions below, or when you need a reference for duration, easing, keyboard support, or reduced-motion handling in a similar interaction.

## Studies

- **Text swap button** (Actions): Swap labels without changing the button width. 220ms, ease-out-quint. https://microinteractions.dev/markdown/text-swap.md
- **Hold to confirm button** (Actions): Hold the button for 1,200ms to confirm. Release early to cancel. 1200ms, linear. https://microinteractions.dev/markdown/hold-confirm.md
- **Chevron morph buttons** (Navigation): Extend a chevron into an arrow on hover. 190ms, ease-out-expo. https://microinteractions.dev/markdown/chevron-morph.md
- **Plucked underline** (Navigation): Pluck a link underline like a string tuned by its length. 400–1200ms, linear() · damped. https://microinteractions.dev/markdown/plucked-underline.md
- **Gooey radio group** (Toggles & choices): Pour the selection from one option to the next. 340ms, ease-in-out-cubic. https://microinteractions.dev/markdown/gooey-radio-group.md
- **Edge-aware tooltip** (Values): Keep a slider's value label inside its container. linear · 1:1. https://microinteractions.dev/markdown/edge-aware-tooltip.md
- **Drag to select** (Direct manipulation): Check a run of table rows in one drag down the boxes. 90–160ms, ease-out-quint. https://microinteractions.dev/markdown/drag-select.md
- **Resize handle** (Direct manipulation): Show the grip where the pointer meets the divider. 100–240ms, custom ease-out. https://microinteractions.dev/markdown/resize-handle.md
- **Tab indicator** (Navigation): Slide the underline to the chosen tab without moving the labels. 250ms, ease-out-quint. https://microinteractions.dev/markdown/tab-indicator.md
- **Worm dots** (Navigation): Drag along the dots to scrub the slides, with a worm that follows the scroll. 80–360ms, ease-out-quint. https://microinteractions.dev/markdown/worm-dots.md
- **Drag to reorder** (Actions): Open a gap in a list that follows the item you drag. 250ms, ease-out-quint. https://microinteractions.dev/markdown/drag-reorder.md
- **FAQ panel** (Navigation): Slide one panel to the question you open and fit it to the answer. 140–300ms, custom ease-in-out. https://microinteractions.dev/markdown/faq-panel.md
- **Tick rail** (Navigation): Grow the ticks around the pointer and preview the section under it. 120–200ms, ease-out-quint. https://microinteractions.dev/markdown/tick-rail.md

The full list with summaries is at https://microinteractions.dev/markdown/index.md. Any page also returns Markdown when requested with `Accept: text/markdown`.

## How to apply a study

1. Fetch the study's Markdown. It contains the reasoning, the CSS implementation, a Tailwind version when one exists, and a shadcn install command for studies with a React port.
2. For a React project with shadcn, run that install command. It installs the React component and any required custom-element script, using the project's shadcn theme tokens. The registry index at https://microinteractions.dev/r/registry.json lists the available components. For other stacks, copy the HTML, CSS, and JavaScript implementation and adapt names and colors. Keep the duration and easing unless the project has a documented reason to differ; the article explains what changes if you do.
3. Keep the keyboard, focus, and `prefers-reduced-motion` handling from the source. The interactions are designed to work without hover, animation, or color alone.
4. Link the study in a code comment so the timing decisions stay traceable.
