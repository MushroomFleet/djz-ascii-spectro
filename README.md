# djz-ascii-spectro

> Time-domain audio waveforms drawn entirely with ASCII glyph density.

A standalone React component that renders a live audio signal as 10 lines of horizontally-scrolling ASCII characters. Each column represents one moment in time; the character at each cell is chosen by its distance from the waveform's amplitude at that instant. The trace doesn't draw the waveform — the waveform *emerges* from the way dense glyphs cluster around it and sparse ones fall away.

Drop in an MP3, WAV, OGG, or FLAC and watch the music print itself across a typeset plate.

---

## Quick preview

The fastest way to see the component in action is the bundled standalone demo:

WEB DEMO: [https://scuffedepoch.com/ascii-spectro/](https://scuffedepoch.com/ascii-spectro/)

1. Clone or download this repo.
2. Open `demo.html` directly in any modern browser.
3. Drag an audio file onto the **INGEST** zone, hit **▶ PLAY**.

No build step. No npm install. No local server. The demo loads React and Babel from a CDN and JIT-compiles the JSX in the browser. ~37 KB of HTML, ~300 KB of cached CDN scripts on first load.

---

## What it is

`djz-ascii-spectro` is a single React component (`djz-ascii-spectro.jsx`) that does three things:

1. **Renders a 10-row × 110-column ASCII text panel** that scrolls right-to-left at 20 frames per second.
2. **Maps an audio amplitude in [-1, 1]** to a row index, then fills every cell in the new column by distance from that row using a density ramp (`█ ▓ ▒ ░ ·` then five spaces).
3. **Sources the amplitude** from either generated test tones (sine, square, saw, triangle, beat, chirp, white noise) or a user-uploaded audio file decoded via the Web Audio API and tapped from a live `AnalyserNode`.

The visual design is a deliberate inversion of the usual "retrofuturist CRT terminal" aesthetic for waveform displays. There is no green phosphor, no scanlines, no glow, no flicker. Instead the spectrograph is presented as a *printed plate* on bone-coloured paper — black ink, hairline rules, a Junghans-clock-face numeric amplitude readout, and a single vermilion accent that appears only when signal is live.

## Why glyph density

Most ASCII visualisations either pick one character per amplitude bucket (so the trace is a single line of `*` or `#`) or render a histogram of bars. Glyph density is different: at each column, all ten cells are filled, but with characters whose visual weight falls off as you move away from the waveform's position. The result reads as a soft, naturalistic trace with implied bloom, like ink seeping out from a hairline plot. The waveform is never explicitly drawn anywhere — it's the *negative shape* of where the dense glyphs aren't.

This means tweaking the look of the trace is a matter of changing the ramp:

```js
const RAMP = ['█', '▓', '▒', '░', '·', ' ', ' ', ' ', ' ', ' '];
```

Shorten the trailing spaces for a thicker, hazier trace. Replace the Unicode block characters with `# = - .` for pure 7-bit ASCII. Use `@ % * + : .` for a hand-printed feel. The mapping logic is unchanged.

## Features

- **Drag-and-drop file ingestion** — supports MP3, WAV, OGG, M4A, FLAC (anything `decodeAudioData` accepts in the host browser).
- **Test tone generators** — seven canonical signals to verify the rendering pipeline without touching audio: sine, square, sawtooth, triangle, beating two-tone, linear chirp, deterministic noise.
- **Transport controls** — play / pause, scrubbable timeline, live position readout in `mm:ss / mm:ss`.
- **Live amplitude readout** — three-digit peak value (000–999), turns vermilion when signal is non-trivial; backed by a thin meter bar.
- **Diagnostic panel** — rows, columns, frame interval, tick count, and current state (GENERATING / PLAYBACK / CUED / EMPTY / HALTED).
- **TRACE ON/OFF toggle** — pause the visual scroll without affecting audio playback.

## Project files

| File | Purpose |
|------|---------|
| `djz-ascii-spectro.jsx` | The component itself. Drop into any React 18 project. |
| `demo.html` | Standalone single-file demo. Open in a browser; no setup. |
| `ascii-spectrograph.jsx` | The earlier prototype with the green-phosphor CRT aesthetic, kept for reference and as a template for alternative skins. |

## Using the component in a React project

```jsx
import DjzAsciiSpectro from './djz-ascii-spectro.jsx';

export default function App() {
  return <DjzAsciiSpectro />;
}
```

The component is fully self-contained: it ships its own styles inline, injects its own scrubber CSS once on mount, and pulls three Google Fonts (Space Mono, IBM Plex Sans Condensed, JetBrains Mono) via an `@import` in its style block. No props, no config, no external CSS to wire up.

If you want to skin it differently or change the panel dimensions, the relevant constants are at the top of the file:

```js
const ROWS = 10;          // panel height in characters
const COLS = 110;         // panel width — wider = longer time window visible
const FRAME_MS = 50;      // scroll tick (50ms = 20fps)
const SAMPLE_WINDOW = 8;  // sub-samples averaged per column
const RAMP = ['█', '▓', '▒', '░', '·', ' ', ' ', ' ', ' ', ' '];
```

## How the audio path works

When a file is dropped, the component:

1. Reads the file as an `ArrayBuffer`.
2. Calls `audioCtx.decodeAudioData()` to get an `AudioBuffer`.
3. On play, creates an `AudioBufferSourceNode`, routes it through an `AnalyserNode` (fftSize 2048, smoothing 0), and out to `destination`.
4. On every frame, calls `analyser.getFloatTimeDomainData(buffer)` and reads a small tail window to derive a *signed* representative amplitude. This preserves waveform polarity — naively averaging the whole buffer collapses to zero on symmetric audio.
5. Separately computes the buffer peak for the meter and the digit readout.

Pause/seek is handled by stopping the buffer source and starting a fresh one at the desired offset, with playback position tracked from `audioCtx.currentTime` deltas.

## Browser support

Anything that supports the Web Audio API and React 18: current Chrome, Firefox, Safari, Edge. The demo uses Babel Standalone for in-browser JSX compilation, which works in all the above but adds ~280 KB of CDN download to first load. The component itself, used in a normal build pipeline, has no such overhead.

## Design notes

The interface was redesigned from the original CRT-terminal prototype using the Basel School foundation methodology — asymmetric 3:4 header grid, Fibonacci spacing scale, 1.333 typographic ratio, three typefaces in articulable formal opposition (geometric monospace for numerics, rational condensed sans for body, fixed-grid mono for the ASCII plate itself). Two contrast axes carry the design: scale (the oversized amplitude readout against 10px labels) and density (the dense glyph plate against open ledger columns). All other axes — colour, motion, material — stay deliberately quiet.

## License

MIT.

---

## 📚 Citation

### Academic Citation
If you use this codebase in your research or project, please cite:
```bibtex
@software{djz_ascii_spectro,
  title = {djz-ascii-spectro: Time-domain audio waveform visualisation through ASCII glyph density},
  author = {Drift Johnson},
  year = {2025},
  url = {https://github.com/MushroomFleet/djz-ascii-spectro},
  version = {1.0.0}
}
```

### Donate:
[![Ko-Fi](https://cdn.ko-fi.com/cdn/kofi3.png?v=3)](https://ko-fi.com/driftjohnson)
