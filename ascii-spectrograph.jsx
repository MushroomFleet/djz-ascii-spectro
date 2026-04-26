import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// ASCII-SPECTROGRAPH
// ----------------------------------------------------------------------------
// 10 rows of ASCII scrolling right-to-left. Each column = one moment in time.
// The audio waveform's amplitude at that moment maps to a vertical position;
// characters are chosen by distance from that position (dense near, sparse
// far) so the waveform emerges naturally from glyph density alone.
// ============================================================================

const ROWS = 10;
const COLS = 96;          // text panel width in characters
const FRAME_MS = 50;      // scroll tick — 20fps feels right for a CRT
const SAMPLE_WINDOW = 8;  // samples averaged per column (smooths jitter)

// Character ramp: dense → sparse. Index = distance from waveform line.
// Cell's distance from current amplitude row picks the character.
const RAMP = ['█', '▓', '▒', '░', '·', ' ', ' ', ' ', ' ', ' '];

// Map a normalized amplitude in [-1, 1] to a row index in [0, ROWS-1].
// Row 0 is the top of the panel, row ROWS-1 is the bottom.
const ampToRow = (amp) => {
  const clamped = Math.max(-1, Math.min(1, amp));
  // Invert so positive amplitude goes UP (row 0 = top)
  return Math.round(((1 - clamped) / 2) * (ROWS - 1));
};

// Given a column's waveform row, fill all ROWS cells using distance ramp.
const renderColumn = (waveRow) => {
  const out = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    const dist = Math.abs(r - waveRow);
    out[r] = RAMP[Math.min(dist, RAMP.length - 1)];
  }
  return out;
};

// Test tone definitions. Each generates a periodic waveform we can audibly
// verify and visually inspect. Frequency stays low so the trace doesn't
// degenerate into a vertical blur at 96 columns wide.
const TONES = [
  { id: 'sine',      label: 'SINE 2Hz',      type: 'sine',     freq: 2  },
  { id: 'sine-fast', label: 'SINE 6Hz',      type: 'sine',     freq: 6  },
  { id: 'square',    label: 'SQUARE 3Hz',    type: 'square',   freq: 3  },
  { id: 'saw',       label: 'SAWTOOTH 3Hz',  type: 'sawtooth', freq: 3  },
  { id: 'triangle',  label: 'TRIANGLE 4Hz',  type: 'triangle', freq: 4  },
  { id: 'beat',      label: 'BEATING 5+5.5', type: 'beat',     freq: 5  },
  { id: 'sweep',     label: 'CHIRP SWEEP',   type: 'sweep',    freq: 0  },
  { id: 'noise',     label: 'WHITE NOISE',   type: 'noise',    freq: 0  },
];

// Synthesize a sample for a given waveform type at time t (seconds).
// All return values in [-1, 1].
const sampleAt = (tone, t) => {
  const TAU = Math.PI * 2;
  switch (tone.type) {
    case 'sine':
      return Math.sin(TAU * tone.freq * t);
    case 'square':
      return Math.sin(TAU * tone.freq * t) >= 0 ? 0.85 : -0.85;
    case 'sawtooth': {
      const phase = (t * tone.freq) % 1;
      return phase * 2 - 1;
    }
    case 'triangle': {
      const phase = (t * tone.freq) % 1;
      return phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
    }
    case 'beat':
      // Two close sines summed → amplitude beating envelope
      return 0.5 * (Math.sin(TAU * 5 * t) + Math.sin(TAU * 5.5 * t));
    case 'sweep': {
      // Linear chirp 1Hz → 8Hz over 4s, looped
      const period = 4;
      const u = (t % period) / period;
      const f = 1 + u * 7;
      return Math.sin(TAU * f * t);
    }
    case 'noise':
      // Deterministic-ish noise from t so it doesn't shimmer chaotically
      return Math.sin(t * 12345.678) * Math.sin(t * 98765.43);
    default:
      return 0;
  }
};

export default function AsciiSpectrograph() {
  const [toneId, setToneId] = useState('sine');
  const [running, setRunning] = useState(true);
  const [audible, setAudible] = useState(false);

  // Grid of characters: ROWS arrays of COLS chars. Stored as ref so we don't
  // re-render React tree on every scroll tick — we update a state counter.
  const gridRef = useRef(
    Array.from({ length: ROWS }, () => new Array(COLS).fill(' '))
  );
  const [tick, setTick] = useState(0);

  // Audio refs
  const audioCtxRef = useRef(null);
  const oscRef = useRef(null);
  const gainRef = useRef(null);

  const tone = TONES.find((t) => t.id === toneId);

  // Update audible oscillator when tone or audible flag changes
  useEffect(() => {
    if (!audible) {
      // Tear down any active oscillator
      if (oscRef.current) {
        try { oscRef.current.stop(); } catch (e) {}
        oscRef.current.disconnect();
        oscRef.current = null;
      }
      return;
    }

    // Need an audio context (lazy, requires user gesture in most browsers)
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
      const g = audioCtxRef.current.createGain();
      g.gain.value = 0.08; // keep it polite
      g.connect(audioCtxRef.current.destination);
      gainRef.current = g;
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    // Most of our visual tones are sub-audible (2-6 Hz). For audible feedback
    // we shift up by an octave-friendly factor so you can actually hear it.
    // Beat / sweep / noise we approximate.
    const audibleFreq = (() => {
      if (tone.type === 'noise') return 220;
      if (tone.type === 'beat') return 220;
      if (tone.type === 'sweep') return 220;
      return Math.max(110, tone.freq * 55); // 2Hz → 110, 6Hz → 330
    })();

    const oscType = ['sine', 'square', 'sawtooth', 'triangle'].includes(tone.type)
      ? tone.type
      : 'sine';

    const osc = ctx.createOscillator();
    osc.type = oscType;
    osc.frequency.value = audibleFreq;
    osc.connect(gainRef.current);
    osc.start();
    oscRef.current = osc;

    return () => {
      try { osc.stop(); } catch (e) {}
      osc.disconnect();
      oscRef.current = null;
    };
  }, [audible, toneId, tone]);

  // The scroll loop. Every FRAME_MS we shift each row left by one cell and
  // append a new column on the right computed from sampleAt() averaged over
  // SAMPLE_WINDOW micro-samples (anti-aliasing for the trace).
  useEffect(() => {
    if (!running) return;
    let rafStart = performance.now();
    let lastTick = rafStart;
    let cancelled = false;

    const loop = (now) => {
      if (cancelled) return;
      if (now - lastTick >= FRAME_MS) {
        lastTick = now;
        const tSec = (now - rafStart) / 1000;

        // Average a few sub-samples across the column duration
        let sum = 0;
        const dt = FRAME_MS / 1000 / SAMPLE_WINDOW;
        for (let i = 0; i < SAMPLE_WINDOW; i++) {
          sum += sampleAt(tone, tSec + i * dt);
        }
        const amp = sum / SAMPLE_WINDOW;
        const waveRow = ampToRow(amp);
        const newCol = renderColumn(waveRow);

        // Shift left, append new column at right
        const grid = gridRef.current;
        for (let r = 0; r < ROWS; r++) {
          const row = grid[r];
          for (let c = 0; c < COLS - 1; c++) row[c] = row[c + 1];
          row[COLS - 1] = newCol[r];
        }
        setTick((x) => x + 1);
      }
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
    return () => { cancelled = true; };
  }, [running, tone]);

  // Reset grid whenever we switch tones, so transitions are crisp
  useEffect(() => {
    gridRef.current = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));
    setTick((x) => x + 1);
  }, [toneId]);

  const handleAudibleToggle = useCallback(() => {
    setAudible((a) => !a);
  }, []);

  // Build display string. Use \u00a0 (non-breaking space) so blank cells
  // don't collapse — critical for waveform shape integrity.
  const lines = gridRef.current.map((row) =>
    row.map((ch) => (ch === ' ' ? '\u00a0' : ch)).join('')
  );

  return (
    <div style={styles.shell}>
      <style>{cssAnimations}</style>

      <div style={styles.bezel}>
        <div style={styles.label}>
          <span style={styles.labelDot} />
          ASCII-SPECTROGRAPH&nbsp;&nbsp;MODEL&nbsp;ASR-10&nbsp;&nbsp;//&nbsp;&nbsp;
          <span style={styles.signal}>SIG·{tone.label}</span>
        </div>

        <div style={styles.screenWrap}>
          <pre style={styles.screen} aria-label="ASCII waveform display">
            {lines.join('\n')}
          </pre>
          <div style={styles.scanlines} />
          <div style={styles.vignette} />
          <div style={styles.gridOverlay} />
        </div>

        <div style={styles.controls}>
          <div style={styles.toneRow}>
            {TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setToneId(t.id)}
                style={{
                  ...styles.toneBtn,
                  ...(t.id === toneId ? styles.toneBtnActive : {}),
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={styles.actionRow}>
            <button
              onClick={() => setRunning((r) => !r)}
              style={{ ...styles.actionBtn, ...(running ? styles.actionOn : {}) }}
            >
              {running ? '■ HALT' : '▶ RUN'}
            </button>
            <button
              onClick={handleAudibleToggle}
              style={{ ...styles.actionBtn, ...(audible ? styles.actionOn : {}) }}
            >
              {audible ? '◉ AUDIO ON' : '○ AUDIO OFF'}
            </button>
            <div style={styles.meta}>
              ROWS {ROWS} · COLS {COLS} · {Math.round(1000 / FRAME_MS)}fps · TICK {tick}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.legend}>
        <span>DENSITY RAMP&nbsp;&nbsp;</span>
        {RAMP.slice(0, 5).map((c, i) => (
          <span key={i} style={styles.legendCell}>
            {c === ' ' ? '\u00a0' : c}
          </span>
        ))}
        <span style={styles.legendNote}>
          &nbsp;&nbsp;dense ← waveform → sparse
        </span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// STYLES — green-phosphor CRT. JetBrains Mono for the panel, IBM Plex Mono
// for chrome. Heavy glow, scanlines, slight flicker. No purple gradients.
// ----------------------------------------------------------------------------

const cssAnimations = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap');

@keyframes flicker {
  0%, 100% { opacity: 1; }
  47% { opacity: 1; }
  48% { opacity: 0.92; }
  49% { opacity: 1; }
  92% { opacity: 0.96; }
  93% { opacity: 1; }
}
@keyframes pulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}
`;

const PHOSPHOR = '#7dff8a';
const PHOSPHOR_DIM = '#3aa847';
const PHOSPHOR_DARK = '#0a1c0d';
const AMBER = '#ffb84a';

const styles = {
  shell: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 50% 30%, #0d1410 0%, #050807 70%, #000 100%)',
    padding: '40px 20px',
    fontFamily: "'IBM Plex Mono', monospace",
    color: PHOSPHOR,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  bezel: {
    background: 'linear-gradient(180deg, #1a1f1b 0%, #0c100d 100%)',
    border: '2px solid #2a322c',
    borderRadius: '6px',
    padding: '18px',
    boxShadow:
      'inset 0 1px 0 rgba(125,255,138,0.08), 0 20px 60px rgba(0,0,0,0.7), 0 0 80px rgba(125,255,138,0.05)',
    maxWidth: '1100px',
    width: '100%',
  },
  label: {
    fontSize: '11px',
    letterSpacing: '0.2em',
    color: PHOSPHOR_DIM,
    marginBottom: '12px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  labelDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: PHOSPHOR,
    boxShadow: `0 0 8px ${PHOSPHOR}`,
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  signal: { color: AMBER },
  screenWrap: {
    position: 'relative',
    background: PHOSPHOR_DARK,
    border: '1px solid #1a2a1d',
    borderRadius: '3px',
    padding: '18px 14px',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.9), inset 0 0 20px rgba(125,255,138,0.08)',
  },
  screen: {
    margin: 0,
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    fontWeight: 700,
    fontSize: 'clamp(8px, 1.1vw, 13px)',
    lineHeight: 1.05,
    letterSpacing: '0.05em',
    color: PHOSPHOR,
    textShadow: `0 0 4px ${PHOSPHOR}, 0 0 10px rgba(125,255,138,0.6), 0 0 18px rgba(125,255,138,0.3)`,
    whiteSpace: 'pre',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    animation: 'flicker 4s infinite',
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    background:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 1px, transparent 1px, transparent 3px)',
    pointerEvents: 'none',
    zIndex: 2,
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
    pointerEvents: 'none',
    zIndex: 3,
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    background:
      'linear-gradient(0deg, transparent 49.5%, rgba(125,255,138,0.05) 50%, transparent 50.5%)',
    pointerEvents: 'none',
    zIndex: 2,
  },
  controls: { marginTop: '14px' },
  toneRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '10px',
  },
  toneBtn: {
    background: 'transparent',
    border: `1px solid ${PHOSPHOR_DIM}`,
    color: PHOSPHOR_DIM,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.12em',
    padding: '6px 10px',
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'all 0.15s ease',
  },
  toneBtnActive: {
    background: `linear-gradient(180deg, rgba(125,255,138,0.18), rgba(125,255,138,0.05))`,
    color: PHOSPHOR,
    borderColor: PHOSPHOR,
    boxShadow: `0 0 12px rgba(125,255,138,0.3), inset 0 0 8px rgba(125,255,138,0.15)`,
  },
  actionRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actionBtn: {
    background: 'transparent',
    border: `1px solid ${PHOSPHOR_DIM}`,
    color: PHOSPHOR_DIM,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    padding: '8px 14px',
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'all 0.15s ease',
  },
  actionOn: {
    color: AMBER,
    borderColor: AMBER,
    boxShadow: `0 0 12px rgba(255,184,74,0.3)`,
    textShadow: `0 0 8px ${AMBER}`,
  },
  meta: {
    marginLeft: 'auto',
    fontSize: '10px',
    letterSpacing: '0.15em',
    color: PHOSPHOR_DIM,
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    letterSpacing: '0.15em',
    color: PHOSPHOR_DIM,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  legendCell: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    color: PHOSPHOR,
    width: '14px',
    textAlign: 'center',
    textShadow: `0 0 4px ${PHOSPHOR}`,
  },
  legendNote: { color: PHOSPHOR_DIM, fontStyle: 'italic' },
};
