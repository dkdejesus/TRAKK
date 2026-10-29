# TRAKK — Browser DAW Product Specification

**Status:** Draft 0.1  
**Target:** Lightweight desktop-first web application  
**Product type:** Pattern-based digital audio workstation

## 1. Product Summary

TRAKK is a lightweight browser-based DAW for quickly sketching beats, melodies, and arrangements. Its core workflow combines a step sequencer, piano roll, pattern-based playlist, and compact mixer in one fast interface.

The product should feel immediate and musical: users can create a loop within seconds, switch between patterns and song arrangement, and hear every edit without waiting for a project build or export process.

TRAKK may take inspiration from established groovebox and pattern-based DAW workflows, including the familiar channel-rack → pattern → playlist model. The visual design, terminology, icons, and implementation must be original rather than a pixel-level reproduction of another product.

## 2. Goals

- Create a usable beat or melodic loop in under two minutes.
- Make pattern creation approachable for users with little DAW experience.
- Provide enough MIDI editing and arrangement control for complete short demos.
- Run entirely in the browser for the MVP, with no required account or backend.
- Keep startup, interaction, and audio latency low on ordinary laptops.
- Make projects portable through local save, JSON project files, and audio export.

## 3. Non-goals for MVP

- Full professional mixing, mastering, or surround audio.
- A large built-in sample library or online marketplace.
- Cloud collaboration, accounts, comments, or social publishing.
- Third-party plugin hosting such as VST, AU, or AAX.
- Complex comping, notation, video sync, or advanced automation lanes.
- Mobile-first production. Tablet touch support is desirable, but desktop mouse and keyboard are the primary target.

## 4. Target Users

### Beat maker

Wants to sequence drums quickly, audition sounds, and build an eight- or sixteen-bar idea without learning a complex DAW.

### Music learner

Needs visible timing, notes, scales, and straightforward controls to understand how rhythm and melody are constructed.

### Fast sketcher

Wants a zero-install scratchpad for capturing an idea, exporting it, and continuing later in another tool.

## 5. Product Principles

1. **Sound first:** Every meaningful edit should produce immediate audible feedback.
2. **Pattern before complexity:** Start with a small loop; expose advanced controls progressively.
3. **One screen for the common case:** The main workspace should support sequencing without opening many dialogs.
4. **Safe experimentation:** Undo/redo, duplicate, mute/solo, and non-destructive edits are always available.
5. **Readable density:** Information-rich panels are welcome, but controls must remain visually grouped and legible.

## 6. MVP Feature Scope

### 6.1 Project and transport

- New project, open project, save project, save project as.
- Local persistence using IndexedDB or equivalent browser storage.
- Import/export a portable `.trakk.json` project file.
- Transport controls: play, stop, pause, record-ready, loop, metronome.
- BPM range: 40–240; default 120 BPM.
- Time signatures: 4/4 required; 3/4 and 6/8 optional for MVP.
- Position display in bars/beats and elapsed time.
- Global undo and redo with a visible history boundary.
- Keyboard shortcuts for transport and common editing actions.

### 6.2 Channel rack / step sequencer

The channel rack is the fastest creation surface for drum and one-shot patterns.

- Add, remove, rename, reorder, duplicate, mute, and solo channels.
- Each channel has a sound source, volume, pan, and pattern lane.
- 16-step default grid with 8, 16, 32, and 64-step lengths.
- Click to toggle steps; drag across cells to paint or erase.
- Per-step velocity and optional probability controls.
- Per-step micro-timing/nudge control, hidden until expanded.
- Pattern length and swing controls.
- Accent indication for beat and bar boundaries.
- Support keyboard navigation and accessible labels for every step.

### 6.3 Instruments and sound sources

MVP sound sources:

- Built-in drum sampler with bundled kick, snare, clap, hat, percussion, and FX samples.
- Single-sample instrument with pitch, envelope, filter, and playback mode.
- Simple subtractive synth with oscillator, filter, amplitude envelope, and optional LFO.
- Web MIDI input for supported browsers.
- User sample import for common browser-decodable formats, at minimum WAV and MP3.

Each channel should expose a compact summary control and a larger editor view when selected.

### 6.4 Piano roll

- Place, move, resize, duplicate, and delete MIDI notes.
- Piano keyboard and labeled octave range.
- Snap grid: 1/4, 1/8, 1/16, 1/32, triplets, and off.
- Note velocity editing through a lower controller lane.
- Note preview on click or drag.
- Quantize selected notes and quantize strength from 0–100%.
- Scale highlighting with root-note and scale selection.
- Zoom and horizontal scrolling without changing note values.
- Basic tools: select, draw, erase, split, and stretch.

### 6.5 Playlist / arrangement

The playlist turns reusable patterns into a song timeline.

- Timeline measured in bars with beat and section markers.
- Place, move, resize, duplicate, and delete pattern clips.
- Snap clips to bar or beat divisions.
- Reuse one pattern in multiple locations; edits update all linked instances unless duplicated.
- Per-track mute and solo.
- Song sections such as Intro, Verse, Chorus, and Outro as optional labels.
- Basic automation clips for volume and filter cutoff are post-MVP unless implementation cost is low.

### 6.6 Mixer

- One mixer strip per channel plus master.
- Volume fader, pan, mute, solo, and peak meter.
- Master limiter or soft clipper to prevent accidental clipping during playback.
- Two lightweight insert effects per channel for MVP: filter and delay/reverb.
- Master output level and clipping indicator.
- Mixer state saved in the project file.

### 6.7 Browser and project assets

- Local browser panel for built-in samples and imported samples.
- Search and filter by type.
- Click to preview; drag or assign to a channel.
- Show missing assets clearly when loading a project.
- Support an explicit “collect assets” export option that embeds or packages user samples where feasible.

### 6.8 Export

- Render the current pattern or full playlist to WAV.
- Optional MP3 export only if a reliable browser-compatible encoder is included.
- Export stems by channel is a post-MVP enhancement.
- Show render progress and allow cancellation.

## 7. Workspace Layout

The default workspace is a resizable three-zone layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Project title | Undo/Redo | Transport | BPM | Time | Export  │
├───────────────┬───────────────────────────┬──────────────────┤
│ Asset Browser │ Main Editor               │ Inspector/Mixer  │
│ samples       │ Channel Rack / Piano Roll │ selected channel │
│ instruments   │ Playlist                  │ controls/effects │
├───────────────┴───────────────────────────┴──────────────────┤
│ Pattern selector | timeline / status / CPU and output meter  │
└──────────────────────────────────────────────────────────────┘
```

- The center editor is the primary focus and changes between Channel Rack, Piano Roll, and Playlist.
- The left browser can collapse to preserve horizontal space.
- The right inspector can switch between channel settings and mixer views.
- Panels remember their last size and visibility per project.
- The UI must remain usable at a minimum desktop viewport of 1280 × 720.

## 8. Core User Flows

### Create a beat

1. Open TRAKK and accept the default blank project.
2. Select a drum kit or add a kick, snare, and hat channel.
3. Toggle steps in the channel rack.
4. Press Play and adjust BPM, swing, velocity, or sample selection.
5. Duplicate the pattern and add a variation.

### Write a melody

1. Add a synth or sample instrument channel.
2. Open the piano roll for the active pattern.
3. Select a root note and scale.
4. Draw notes, adjust length and velocity, and audition changes.
5. Return to the playlist and place the pattern in the arrangement.

### Arrange and export

1. Open Playlist view.
2. Place patterns on tracks and duplicate sections into a song form.
3. Balance channel levels in Mixer view.
4. Enable loop playback and correct any clipping.
5. Export the full arrangement as WAV.

## 9. Interaction and Keyboard Shortcuts

- `Space`: play/pause.
- `Enter`: stop and return to the last start position.
- `R`: record-ready toggle.
- `L`: loop toggle.
- `Ctrl/Cmd + Z`: undo.
- `Ctrl/Cmd + Shift + Z`: redo.
- `Ctrl/Cmd + S`: save project.
- `Ctrl/Cmd + O`: open project.
- `Ctrl/Cmd + D`: duplicate selected item.
- `Delete/Backspace`: delete selected item.
- `M`: mute selected channel or clip.
- `S`: solo selected channel or clip.
- Arrow keys: move selection; `Shift` modifies by a larger increment.

Shortcuts must not trigger while the user is typing in a text field.

## 10. Audio and MIDI Requirements

- Use the Web Audio API for playback, synthesis, effects, metering, and offline rendering.
- Schedule audio against `AudioContext.currentTime`; do not use UI timer callbacks as the audio clock.
- Use an `AudioWorklet` where required for stable custom processing or metering.
- Use a single transport clock shared by step sequencer, MIDI events, playlist clips, metronome, and UI playhead.
- Support note-on/note-off, velocity, channel, duration, and pitch bend data in the internal MIDI model.
- Detect browser audio restrictions and provide a clear “Enable Audio” action after user gesture.
- Preserve musical timing when the UI thread is busy.
- Gracefully handle sample decode failures and unsupported MIDI devices.

## 11. Technical Architecture

### Suggested stack

- TypeScript.
- React or another component framework already selected by the implementation team.
- Web Audio API and AudioWorklet.
- Web MIDI API with feature detection and a browser fallback.
- IndexedDB for projects, settings, and imported asset metadata.
- Web Workers for waveform analysis and non-blocking render preparation.
- Canvas or WebGL for high-density piano roll, waveform, and meter rendering where DOM performance is insufficient.

### Suggested modules

```text
src/
  audio/       audio graph, scheduler, instruments, effects, renderer
  midi/        MIDI devices, event model, quantization, scale helpers
  transport/   BPM, clock, looping, playhead, metronome
  project/     schema, serialization, migrations, persistence
  sequencer/   patterns, steps, clips, playlist operations
  ui/          layout, panels, controls, shortcuts, notifications
  assets/      sample catalog, decoding, previews, missing-asset handling
```

### State boundaries

- **Project state:** patterns, clips, notes, channels, mixer settings, assets, and metadata.
- **Playback state:** current position, playing/stopped state, loop range, active notes, and meters.
- **UI state:** selected item, open panels, zoom, scroll positions, and transient dialogs.

Playback state should be derived from the project and transport rather than duplicated in individual UI components.

## 12. Initial Data Model

```ts
type TrakkProject = {
  version: number;
  name: string;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  patterns: Pattern[];
  channels: Channel[];
  clips: PlaylistClip[];
  mixer: MixerState;
  assets: AssetReference[];
};

type Pattern = {
  id: string;
  name: string;
  lengthSteps: number;
  resolution: number;
  swing: number;
  events: SequenceEvent[];
};

type SequenceEvent =
  | { kind: "step"; channelId: string; step: number; velocity: number; probability?: number }
  | { kind: "note"; channelId: string; start: number; duration: number; pitch: number; velocity: number };
```

The schema must be versioned from the first implementation. Loading an older version should run explicit migrations instead of silently reshaping data.

## 13. Accessibility and Usability

- Full keyboard access for transport, navigation, selection, and editing.
- Visible focus states and minimum WCAG AA contrast for text and controls.
- Do not rely on color alone for active, muted, selected, or accented states.
- Provide screen-reader labels for buttons, sliders, channels, steps, and piano-roll notes.
- Offer a reduced-motion preference for playhead animation and panel transitions.
- Tooltips should explain unfamiliar controls without blocking the main editor.

## 14. Performance Targets

- First usable UI in under 2 seconds on a modern laptop after assets are available.
- Start playback within 100 ms of a transport gesture after audio is enabled.
- No audible timing drift in a 16-channel, 8-bar project during normal interaction.
- Maintain approximately 60 FPS while editing a typical 16-bar piano-roll pattern.
- Keep the default bundled asset package small enough for fast initial loading; lazy-load nonessential samples.
- Avoid decoding or waveform-rendering large imported files on the main UI thread.

## 15. Error Handling

- Show a recoverable warning when browser audio is unavailable or suspended.
- Autosave a recovery snapshot locally after meaningful edits.
- Warn before leaving with unsaved changes when browser support allows it.
- If a project references missing assets, load the arrangement and mark only affected channels unavailable.
- Never lose the current project because one sample or MIDI device fails.
- Provide actionable messages for export failures, unsupported formats, and storage quota issues.

## 16. MVP Acceptance Criteria

- A user can create, save, reload, and export a project without a backend account.
- A user can build a 16-step drum loop with at least four channels and hear it in time.
- A user can edit pitched MIDI notes in the piano roll and hear changes during playback.
- A user can reuse patterns in a playlist to create a multi-section arrangement.
- Mute, solo, volume, pan, and master clipping protection work during playback and export.
- Undo/redo covers step edits, note edits, clip edits, and mixer changes.
- Imported samples are persisted or clearly reported as missing when reopening a project.
- The main workflow is usable with keyboard and mouse at 1280 × 720.
- A fresh browser session can recover a project after a reload or unexpected close.

## 17. Delivery Phases

### Phase 1 — Audio foundation

Transport, project schema, Web Audio graph, sample playback, one synth voice, and a minimal test project.

### Phase 2 — Pattern creation

Channel rack, step sequencing, pattern management, basic keyboard shortcuts, and undo/redo.

### Phase 3 — MIDI editing

Piano roll, note model, quantization, scales, MIDI input, and instrument editing.

### Phase 4 — Arrangement and mixing

Playlist, clip operations, mixer strips, meters, basic effects, and song playback.

### Phase 5 — Persistence and export

IndexedDB, project import/export, asset handling, WAV rendering, recovery snapshots, and QA.

### Phase 6 — Polish

Accessibility pass, performance profiling, responsive panel behavior, onboarding, and visual refinement.

## 18. Future Enhancements

- Audio recording and waveform clips.
- Automation lanes and modulation recording.
- Sidechain routing and sends.
- Stem export and MIDI file import/export.
- Collaborative projects and cloud sync.
- Preset browser and user-created kits.
- Touch gestures and installable PWA behavior.
- Offline-first asset caching and background rendering.

## 19. Implementation Status / Resume Notes

The current prototype implements the browser DAW shell through the first MVP hardening pass:

- Vite + TypeScript project scaffold with Channel Rack, Piano Roll, Playlist, Browser, Inspector, and Mixer views.
- Web Audio transport with synthesized drums, bass, MIDI note playback, swing, arrangement playback, loop, and metronome.
- Editable steps, MIDI notes, playlist clips, clip dragging, clip duplication/deletion, channel creation/removal, mute/solo, volume, and pan.
- IndexedDB autosave, local project recovery, `.trakk.json` import/export, imported audio persistence, and WAV arrangement export.
- UI audit completed for navigation, popovers, browser search, panel collapse, shortcuts, undo/redo, and control feedback.

To resume development, run `npm run dev` from the project root and open the local Vite URL. The next recommended work is to replace the remaining placeholders with real audio recording, a true multi-pattern bank, and non-4/4 timing support, followed by accessibility and performance testing. Downloaded `.trakk.json` files currently preserve project metadata; imported audio data remains stored in the local browser workspace.
