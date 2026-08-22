# Asset generation pack — The Trivia Bank

Paste-ready prompts for every piece of generated media the game can use.

**Nothing here is required.** The game is fully playable with procedural audio
and CSS-drawn artwork. Every slot is additive: drop the file at the stated path
and it takes over automatically. Delete it and the fallback returns.

> **Status: all ten assets are generated and shipped** (Aug 2026), including
> the category sigils. Sources live
> in `~/Desktop/trivia`; processed outputs are in `assets/`. Re-run
> `bash scripts/process-audio.sh` and `bash scripts/process-images.sh` after
> generating new takes. The prompts below are kept for regeneration and for
> the two optional assets not yet used (category sigils).
>
> Raw generations totalled 23 MB. Processed payload is **964 KB of art and
> 2.1 MB of audio**, because a no-build static site fetches every byte on
> first paint and nothing here streams.

**Palette — use these hex values verbatim in every prompt:**

| Token | Hex | Role |
|---|---|---|
| Vault ink | `#0A0C10` | Background, the dark |
| Steel | `#252A33` | Panel bodies |
| Brass | `#C9A24D` | The brand accent |
| Bright brass | `#E6C883` | Highlights, lit metal |
| Bone | `#ECE6DA` | Display text |
| Jade | `#43A882` | Safe / correct |
| Alarm | `#E0483C` | Danger / wrong |

---

# Part A — Suno (music & stings)

Four tracks. In Suno, put the **Style** block in the style/description field,
switch **Instrumental** on, and leave lyrics empty. Titles are just for your
library.

## A1. Title theme — `assets/audio/theme-title.mp3`

Loops on the title screen. Should feel like standing in front of a closed vault
at 2am: patient, expensive, slightly criminal.

**Style:**
```
Cinematic heist score, slow-burn tension. 68 BPM, D minor. Muted upright
bass walking in half notes, brushed jazz drums with rimshot accents, low
Rhodes electric piano playing sparse minor-9 chords, distant vibraphone
hits with long reverb tails, subtle analog tape hiss. Restrained and
patient — no build, no drop, no climax. Ocean's Eleven lounge, not Mission
Impossible action. Seamless loop, consistent dynamics throughout.
Instrumental.
```
**Length:** aim 60–90s · **Notes:** ask Suno for a version with no ending
(fades are hard to loop). Trim to a bar boundary before exporting.

---

## A2. Tension bed — `assets/audio/bed-tension.mp3`

Plays quietly under a run at low volume (0.18). It must not compete with the
SFX or the player's own thinking.

**Style:**
```
Minimal dark ambient underscore for a puzzle game. 60 BPM, D minor drone.
Sustained low synth pad, faint metallic room tone, occasional distant clock
tick, soft granular texture. Almost no melody — atmosphere only. Very low
dynamic range, nothing that pulls focus. Designed to sit under dialogue.
Seamless loop. Instrumental.
```
**Length:** 60s+ · **Notes:** if it has *any* memorable melodic hook, regenerate.
This one is furniture on purpose.

---

## A3. Vault-open sting — `assets/audio/sting-vault-open.mp3`

Fires when a run is cleared or banked. Replaces the synthesised fanfare.

**Style:**
```
Short triumphant orchestral sting, 4 seconds. Rising brass swell into a
bright major resolution, timpani hit, shimmer of celesta and harp gliss on
the tail, deep sub-bass impact underneath. Warm, golden, expensive.
Heist-movie payoff moment. Clean silence at the end, no reverb tail cut
off. Instrumental.
```
**Length:** 3–5s · **Notes:** generate several, keep the one with the cleanest
attack — a soft onset lands late against the visual.

---

## A4. Lockdown sting — `assets/audio/sting-lockdown.mp3`

Fires on a bust. Should feel like a mistake with consequences.

**Style:**
```
Short dark orchestral failure sting, 3 seconds. Descending brass cluster,
heavy metal slam impact, low string tremolo, single dissonant piano cluster,
sub-bass drop. Cold, final, mechanical. The sound of bolts throwing home.
No musical resolution. Clean silence at the end. Instrumental.
```
**Length:** 2–4s

---

# Part B — ChatGPT Image 2.0 (art)

Paste each block into ChatGPT and ask for the stated aspect ratio.

## B1. Vault door — `assets/art/vault-door.png` ⭐ highest impact

Sits behind everything and brightens as the player's streak climbs. This is the
single asset that most changes how the game feels.

**Prompt:**
```
A hyper-detailed studio product render of a colossal circular bank vault
door, photographed straight-on and perfectly centred, filling the frame.

Composition — the door is dead centre, face-on, symmetrical. Exactly 3
concentric machined rings step back toward a central hub. Exactly 8 radial
locking spokes run from the hub to the outer ring. A knurled turn-wheel
handle sits at the centre. Exactly 24 hex bolts are set evenly around the
outermost ring. Deep milled channels separate each ring.

Material: aged gunmetal steel with a fine circular brushed grain, worn
polished brass inlays along the ring edges and on the turn wheel, faint
scratches and honest wear at the contact points. No rust, no grime.

Lighting: a single hard key light from directly above, raking across the
metal to catch the circular brush grain, warm brass specular highlights on
the ring edges, deep shadow pooling in the milled channels, cool ambient
fill. Dramatic and clean.

Color palette: vault ink #0A0C10 background, gunmetal steel #252A33, brass
#C9A24D, bright brass highlights #E6C883.

Camera: 85mm lens, f/8, straight-on elevation, everything in sharp focus.

The background behind the door is pure flat #0A0C10 with no gradient, no
floor, no wall, no room — the door floats in black so it can be composited.
No text. No watermark. No logo.

Style: precision industrial product photography, photorealistic, high
micro-contrast, crisp machined edges, visible metal grain and tool marks.
Aspect ratio 1:1.
```
**Save as:** `assets/art/vault-door.png` — export with a **transparent or pure
black background**, 2048×2048 or larger. The game blends it with `screen`, so
pure black areas disappear automatically.

**Follow-up to ask ChatGPT:** *"Remove any floor, wall or background gradient —
the door must sit on pure black."*

---

## B2. Open-graph card — `assets/og.png`

Already referenced by `index.html`; currently a dead link. This one **needs
rendered text**, which is Image 2.0's strongest capability.

**Prompt:**
```
A premium typographic key art card for a trivia video game, landscape.

Composition — a colossal circular brass-and-gunmetal bank vault door
occupies the right third of the frame, cropped by the right edge, lit from
above, partially open with warm golden light spilling out of the gap. The
left two thirds is deep matte near-black negative space.

Typography: large refined italic serif reading "The Trivia Bank" in polished
brass #E6C883, positioned in the upper-left, stacked on three lines with the
word "Bank" largest and italic. Below it, a single line of thin letter-spaced
uppercase sans-serif in bone #ECE6DA reading "CRACK THE VAULT". Bottom-left
corner, small mono uppercase in muted grey reading "735 LOCKS ON FILE".
Lettering crisp and complete, generously spaced, nothing crowded.

Lighting: hard warm key from the upper right behind the door, volumetric
golden light spill through the door gap, cool near-black fill on the left,
strong specular highlights on the brass ring edges.

Color palette: #0A0C10, #252A33, #C9A24D, #E6C883, #ECE6DA.

Camera: 50mm, f/4, slight low angle, shallow depth of field falling off
toward the door.

Style: cinematic key art, photorealistic metal, editorial typography,
high contrast, film grain. Aspect ratio 16:9.
```
**Save as:** `assets/og.png`, then resize to exactly **1200×630**.

---

## B3. Favicon / app mark — `assets/icon-512.png`

**Prompt:**
```
A minimal app icon of a bank vault door viewed straight on, centred and
symmetrical, on a solid #0A0C10 rounded-square background.

Exactly 2 concentric rings, exactly 8 short radial spokes, and one solid
circular hub at the centre. Rendered as clean flat geometric line work in
brass #C9A24D at a consistent 3px-equivalent stroke weight — not
photorealistic, not shaded, not 3D.

Generous padding: the artwork occupies the centre 70% of the canvas.
No text. No watermark. No gradient.

Style: modern flat iconography, geometric precision, Apple-level
minimalism. Aspect ratio 1:1.
```
**Save as:** `assets/icon-512.png` at 512×512. Also export 180×180 as
`assets/apple-touch-icon.png`, then add to `<head>`:
```html
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
```

---

## B4. Brushed steel panel texture — `assets/art/panel-texture.png` (optional)

The console currently uses CSS gradients. A real texture adds grain the
gradients cannot.

**Prompt:**
```
A seamless tileable texture of finely brushed gunmetal steel, photographed
flat-on under even diffuse lighting.

Horizontal brush grain running left to right, extremely fine and
consistent. Subtle variation in the grain density. A few faint hairline
scratches. No dents, no rust, no rivets, no bolts, no logos, no text, no
vignette, no lighting hotspot — completely even edge to edge so it tiles
without a visible seam.

Color: dark neutral gunmetal, base value around #252A33, low contrast.

Style: photorealistic macro material scan, flat lighting, seamless tile.
Aspect ratio 1:1.
```
**Save as:** `assets/art/panel-texture.png`, 1024×1024. Then in
`css/material.css` swap the `--grain-fine` token for:
```css
--grain-fine: url("../assets/art/panel-texture.png") repeat;
```

---

## B5. Category sigils — `assets/art/sigils.png` (optional)

The 12 categories currently use mono glyphs (`✦ ◆ ▲ ⌘ ¶ ⁂`), which is
deliberate — the house rule is no emoji in polished UI. Only do this if you
want illustrated icons.

**Prompt:**
```
A 4-column by 3-row grid of exactly 12 minimal line-art icons on a solid
#0A0C10 background, evenly spaced with generous equal padding around each.

Reading left to right, top to bottom, the 12 icons are: a globe with
latitude lines, an hourglass, a laurel leaf, a Doric column, an open book,
a tuning fork, a film aperture, a wine glass, a laurel wreath around a
star, a microchip, a paragraph mark, a compass rose.

All 12 drawn in a single consistent style: geometric line work in brass
#C9A24D, uniform stroke weight throughout, no fills, no shading, no
gradients, no 3D, no perspective. Each icon fits inside an invisible square
of identical size.

No text. No labels. No watermark.

Style: minimal geometric iconography, precise line work, consistent stroke
weight. Aspect ratio 4:3.
```
**Save as:** `assets/art/sigils.png`.

`scripts/process-images.sh` converts the sheet into a **white-on-transparent
alpha mask** rather than keeping it as coloured artwork. Two reasons: the
anti-aliased brass compresses badly (124 KB coloured vs 20 KB as a mask), and
a mask takes its colour from CSS, so the sigils inherit `currentColor` and
track the palette for free — brass on a category stamp, muted on a disabled
chip. Baked-in colour would need a separate sheet per state.

The grid order in the prompt maps 1:1 onto `CATEGORY_SIGIL_INDEX` in
`js/config.js`, so keep the twelve subjects in that order if you regenerate.

**Four categories added since have no sprite slot** — Signs & Symbols, Landmarks &
Wonders, Horror & Hauntings and Numbers & Puzzles fall back to mono glyphs, which is
the documented behaviour rather than a gap. To give them icons, regenerate at **4 by 4**
with these four appended in order: a crescent moon and star, a classical arch, a
skull, and an abacus. Then extend `CATEGORY_SIGIL_INDEX` to 15 and change
`mask-size` in `css/material.css` from `400% 300%` to `400% 400%`.
The mono glyphs stay in `CATEGORY_SIGILS` as the accessible text and as the
fallback wherever `mask-image` is unsupported.

---

# Workflow

1. Generate → download → save at the stated path.
2. Run the game locally: `python3 -m http.server 8791`
3. Hard-reload. Audio files are picked up on first click (the browser gesture
   that unlocks the AudioContext); image files on load.
4. Commit the assets. They are served with a one-year immutable cache, so
   **change the filename** if you replace one later, or browsers keep the old.

## What locked vs. what's flexible

- **Locked:** the palette hex values, "no text" on B1/B4/B5, pure-black
  background on B1 (the game blends it with `screen` — any background colour
  will show as a rectangle), 1200×630 on the OG card.
- **Flexible:** BPM and key on the music, the specific instruments, the icon
  subjects in B5, and whether the vault door is open or closed in B2.

## If a generation misses

- Vault door with a visible floor or wall → *"the door must float on pure
  black, remove all environment"*
- OG text crowded or misspelt → *"increase letter spacing, make the text
  larger, and render every character clearly"*
- Texture with a visible seam → *"make it perfectly tileable with no vignette
  and no lighting falloff at the edges"*
- Music that builds to a climax → regenerate; loops need flat dynamics
