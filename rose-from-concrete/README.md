# The Rose That Grew From Concrete — Interactive Poetry eLearning Module

A self-paced, 10-screen interactive lesson (ages 10–16) built from an existing
teacher-led poetry lesson on Tupac Shakur's *"The Rose That Grew From Concrete."*
Converts the original speaker → subject → literal meaning → symbol → deeper
meaning → central idea sequence into digital interactions: click/highlight
annotation, guided multiple choice with instructional feedback, and open
reflection/writing — no logins, no backend, no scoring system.

## Tech
Plain HTML, CSS, and vanilla JavaScript. No build step, no dependencies beyond
two Google Fonts loaded via `<link>`. Progress is saved to the learner's
browser (`localStorage`) so a refresh doesn't lose their place; there is no
server and no data ever leaves the device.

## File structure
```
index.html          all 10 screens
style.css            design system (warm off-white / concrete / rose / charcoal / green)
script.js            navigation, quiz logic, annotation interaction, gating
assets/images/       favicon + inline SVG illustrations (no external image calls)
assets/audio/        placeholder folder — drop an mp3 named rose-poem.mp3 here
                      to enable narration; the lesson works fully without it
netlify.toml         static hosting config
```

## Deploying to Netlify
**Fastest — drag and drop:**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the whole `rose-elearning` folder (or its zipped contents) onto the page.
3. Netlify gives you a live URL immediately — no account required for a first test deploy.

**Or via Git:**
1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Build command: leave blank. Publish directory: `.` (repo root).
4. Deploy.

## Adding real audio
Replace the placeholder path in `index.html`:
```html
<source src="assets/audio/rose-poem.mp3" type="audio/mpeg">
```
with a licensed or your own narration file at that path. The transcript
(full poem text) is always shown, so audio is enhancement-only.

## Accessibility notes
Keyboard-navigable throughout (Tab/Shift+Tab, arrow keys to move screens,
Enter/Space to activate), visible focus states, `aria-live` regions for
feedback, alt-free decorative SVGs marked `aria-hidden`, and a skip link.
Reduced-motion preference is respected.
