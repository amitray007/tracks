# Motion and interaction

## Motion personality

Tracks is an inspection tool used repeatedly. Its motion should feel crisp, calm, and spatially coherent. Frequent actions prioritize immediacy; occasional overlays may use restrained transitions; celebratory animation is outside the core product personality.

## Decision framework

Before adding an animation, answer:

1. How often will the user trigger it?
2. What state change or spatial relationship does it explain?
3. Can it be interrupted safely?
4. Will it remain smooth while a large track is parsing or rendering?
5. What happens with reduced motion?

Frequency guidance:

| Frequency | Default decision |
| --- | --- |
| Hundreds of times per day | No animation |
| Tens of times per day | Instant or extremely short feedback |
| Occasional overlay or panel | Standard restrained transition |
| Rare onboarding | May contain limited explanatory motion |

Keyboard-initiated command palette, entry navigation, filter toggles, and view switching should be immediate. Animation must never delay input readiness.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| duration-instant | 100ms | Icon feedback and press response |
| duration-fast | 150ms | Disclosure, hover, compact rows |
| duration-normal | 200ms | Popovers and state changes |
| duration-panel | 250ms | Pointer-opened side panels |
| duration-dialog | 280ms | Dialog entry; exit should be faster |
| ease-out | cubic-bezier(0.23, 1, 0.32, 1) | Entering and user-triggered response |
| ease-in-out | cubic-bezier(0.77, 0, 0.175, 1) | On-screen movement or morphing |
| ease-drawer | cubic-bezier(0.32, 0.72, 0, 1) | Gesture-driven sheets if introduced |

Do not use ease-in for interface entry. Do not use transition: all. Declare only transform, opacity, color, background-color, border-color, box-shadow, or filter as needed.

## Component motion specifications

### Buttons and pressables

- Pointer press may scale to 0.97–0.98 over 100–160ms.
- Gate hover transforms behind hover: hover and pointer: fine.
- Keyboard activation does not scale or wait.
- Disabled controls do not animate as if accepted.

### Disclosure rows

- Chevron rotates 90 degrees over 150ms with ease-out.
- Chevron opacity may increase as the row opens.
- Content appears immediately or with a short opacity transition.
- Do not animate the full measured height of large tool output or diffs.
- Preserve scroll anchoring when opening above the viewport midpoint.

### Copy confirmation

- Copy glyph changes to a check in the same fixed-size slot.
- Use a 100–150ms opacity/scale crossfade starting around scale 0.95, never scale 0.
- Restore after an accessible delay without moving the pointer target.
- Announce confirmation in a polite live region.

### Popovers and menus

- Pointer-opened overlays may enter over 125–180ms using opacity and scale 0.97–1.
- Transform origin follows the trigger using the primitive's positioning variable.
- Exit is shorter than entry.
- Keyboard-opened command surfaces should skip or drastically reduce entry animation.

### Tooltips

- Delay the first pointer tooltip to avoid accidental activation.
- Once one toolbar tooltip is open, adjacent tooltips appear without delay or animation.
- Focus-triggered tooltips appear immediately.

### Dialogs

- Modal origin remains centered.
- Scrim and content may fade together, with content scaling from approximately 0.97.
- Dialog content is interactive immediately; animation cannot postpone focus placement.
- Closing by Escape returns focus even if the exit transition is interrupted.

### Side panels and mobile sheets

- Pointer-opened panels may translate over 200–250ms.
- Keyboard toggles prioritize immediacy and may skip translation.
- Gesture-driven sheets require pointer capture, boundary damping, velocity-aware dismissal, and multi-touch protection.
- Springs are acceptable only for direct manipulation; ordinary panels use CSS transitions.

### Toasts

- Enter and exit from a consistent edge.
- Rapidly added toasts use interruptible transitions, not restart-prone keyframes.
- Pause timeouts when the document is hidden.
- Do not toast every background indexing update.

### Live entries

- New streaming content does not repeatedly animate line by line.
- A newly created entry may receive a brief opacity transition only when the user is already following the live tail.
- Do not auto-scroll if the user has moved away from the live tail.
- Show a “new entries” affordance instead.
- Completion may update status/icon with a small in-place transition.

### Lists and search

- Do not stagger session or search results; it makes repeated searching feel slow.
- Filtering and sorting update immediately.
- Preserve selection and scroll position when results change.
- Skeletons may use a subtle opacity pulse, but static placeholders are preferred for short operations.

### Diffs and code

- Syntax tokens do not animate.
- Switching unified/split view may crossfade the renderer only if layout is ready; otherwise switch immediately with a stable loading placeholder.
- Never animate thousands of line positions.
- Hunk expansion is immediate with optional 100ms opacity feedback.

## Performance rules

- Prefer CSS transitions for predetermined motion.
- Animate transform and opacity whenever possible.
- Avoid animating height, width, padding, margin, or top in transcript content.
- Avoid inherited CSS variables that update every frame across large subtrees.
- Do not add continuous animation to each running entry; aggregate activity in one status region.
- Test while indexing and syntax highlighting are active, not only on an idle page.
- Use the Web Animations API only when programmatic interruption is needed and CSS transitions are insufficient.

## Reduced motion

With prefers-reduced-motion: reduce:

- Remove translations, scaling, drawer motion, and decorative pulses.
- Retain short opacity, color, and icon changes that clarify state.
- Keep focus and live-update behavior identical.
- Never replace motion with flashing.

Reduced motion is a first-class state in component stories and visual QA.

## Review checklist

| Before | After | Why |
| --- | --- | --- |
| transition: all 300ms | Transition only the required properties for 100–250ms | Prevents accidental layout animation and improves responsiveness |
| Entry starts at scale 0 | Start around scale 0.95 with opacity 0 | Preserves a believable visual shape |
| ease-in on an entering menu | Strong custom ease-out | Responds immediately to user input |
| Center-origin popover | Origin follows the trigger | Maintains spatial continuity |
| Animation on command-palette keyboard toggle | Open and focus immediately | High-frequency keyboard actions must stay fast |
| Animated height for a large diff | Immediate hunk expansion with optional opacity | Avoids layout work and scroll instability |
| Hover transform on every pointer type | Gate behind hover and fine-pointer media queries | Prevents sticky hover behavior on touch devices |
| Looping spinner on every running tool | One restrained aggregate activity indicator | Reduces visual noise and rendering cost |

Review nontrivial motion at 2–5× duration and frame by frame. Re-test the next day and under CPU load before considering it finished.
