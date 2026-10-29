import "./styles.css";
import { TrakkAudioEngine, type ArrangementClip, type AudioPattern, type MidiNote } from "./audio/engine.ts";
import { renderArrangementWav } from "./audio/export.ts";
import { connectMidiInput } from "./midi/input.ts";
import { createDefaultProject, parseProject, type ProjectAsset, type TrakkProject } from "./project/schema.ts";
import { loadAssetData, loadProject, saveAssetData, saveProject } from "./project/storage.ts";

type ViewName = "channel" | "piano" | "playlist";

const channelRows = [
  { name: "Kick", type: "DRUM", color: "#ff7a66", pattern: [0, 4, 8, 12] },
  { name: "Snare", type: "DRUM", color: "#f7c66a", pattern: [4, 12] },
  { name: "Closed Hat", type: "DRUM", color: "#61d7b3", pattern: [2, 6, 10, 14] },
  { name: "Open Hat", type: "DRUM", color: "#73a7ff", pattern: [6, 14] },
  { name: "Sub Bass", type: "SYNTH", color: "#bf8cff", pattern: [0, 3, 8, 11] },
];

const noteRows = [
  { note: "C5", notes: [1, 5, 9, 13] },
  { note: "B4", notes: [3, 11] },
  { note: "A4", notes: [7, 15] },
  { note: "G4", notes: [2, 6, 10, 14] },
  { note: "F4", notes: [4, 12] },
  { note: "E4", notes: [0, 8] },
];

const notePitches = [72, 71, 69, 67, 65, 64];

type PlaylistClip = {
  id: string;
  track: string;
  label: string;
  color: string;
  startBar: number;
  lengthBars: number;
  channels: Array<ArrangementClip["channel"]>;
};

const playlistTracks = [
  { name: "Drums", color: "#ff7a66" },
  { name: "Bass", color: "#bf8cff" },
  { name: "Keys", color: "#61d7b3" },
  { name: "FX", color: "#73a7ff" },
];

let playlistClips: PlaylistClip[] = [
  { id: "clip-drums-a", track: "Drums", color: "#ff7a66", startBar: 0, lengthBars: 4, label: "Main Groove", channels: ["kick", "snare", "hat", "openHat"] },
  { id: "clip-drums-b", track: "Drums", color: "#ff7a66", startBar: 4, lengthBars: 4, label: "Main Groove", channels: ["kick", "snare", "hat", "openHat"] },
  { id: "clip-bass-a", track: "Bass", color: "#bf8cff", startBar: 0, lengthBars: 8, label: "Sub Bass", channels: ["bass"] },
  { id: "clip-keys-a", track: "Keys", color: "#61d7b3", startBar: 2, lengthBars: 4, label: "Dream Chords", channels: [] },
];
let selectedClipId: string | null = null;
let projectName = "Untitled Session";
let saveTimer: number | null = null;
let undoStack: TrakkProject[] = [];
let redoStack: TrakkProject[] = [];
let selectedChannelIndex = 0;
let importedAssets: ProjectAsset[] = [];
const channelKinds: Array<"kick" | "snare" | "hat" | "openHat" | "bass"> = ["kick", "snare", "hat", "openHat", "bass"];
const channelMixValues = channelKinds.map(() => ({ volume: 0.78, pan: 0, muted: false, soloed: false }));
let snapResolution = "1/16";
let selectedScale = "C Minor";
let metronomeEnabled = false;
let loopEnabled = true;
let recordArmed = false;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("TRAKK root element is missing");
}

const defaultProject = createDefaultProject();
const audioEngine = new TrakkAudioEngine({
  onStep: (step, bar) => {
    document.querySelectorAll<HTMLButtonElement>(".step").forEach((stepButton, index) => {
      stepButton.classList.toggle("playhead", index % 16 === step);
    });
    document.querySelectorAll<HTMLButtonElement>(".note").forEach((noteButton) => {
      noteButton.classList.toggle("playhead", Number(noteButton.dataset.stepIndex) === step);
    });
    const position = document.querySelector<HTMLElement>(".position-display strong");
    if (position) position.textContent = `${bar + 1}:${String(Math.floor(step / 4) + 1).padStart(2, "0")}:${String((step % 4) * 250).padStart(3, "0")}`;
    const arrangementPlayhead = document.querySelector<HTMLElement>(".arrangement-playhead");
    if (arrangementPlayhead) arrangementPlayhead.style.left = `calc(115px + ${(bar / 8) * 100}% )`;
  },
});

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark"><span></span><span></span><span></span></div>
        <span class="brand-name">TRAKK</span>
        <span class="project-divider"></span>
        <button class="project-name" data-project-action="rename" type="button">Untitled Session <span class="chevron">⌄</span></button>
      </div>
      <div class="topbar-actions">
        <div class="save-state"><span class="status-dot"></span><span id="save-label">Saved locally</span></div>
        <button class="topbar-tool" data-project-action="undo" type="button" aria-label="Undo">↶ Undo</button>
        <button class="topbar-tool" data-project-action="redo" type="button" aria-label="Redo">Redo ↷</button>
        <button class="topbar-tool" data-project-action="save" type="button">Save</button>
        <button class="topbar-tool" data-project-action="open" type="button">Open</button>
        <button class="topbar-tool" data-project-action="download" type="button">Save File</button>
        <button class="topbar-tool export-tool" data-project-action="export" type="button">Export WAV</button>
        <button class="icon-button" data-ui-action="settings" type="button" aria-label="Settings">⚙</button>
        <button class="avatar" data-ui-action="account" type="button" aria-label="Account">DJ</button>
      </div>
    </header>

    <input id="project-file-input" type="file" accept="application/json,.trakk.json" hidden />
    <input id="audio-file-input" type="file" accept="audio/*,.wav,.mp3,.ogg" hidden />

    <section class="transport-bar">
      <div class="transport-controls">
        <button class="transport-button stop-button" type="button" aria-label="Stop">■</button>
        <button class="transport-button play-button" type="button" aria-label="Play">▶</button>
        <button class="transport-button record-button" data-ui-action="record" type="button" aria-label="Record">●</button>
        <span class="control-divider"></span>
        <button class="transport-button metronome-button" data-ui-action="metronome" type="button" aria-label="Metronome">♩</button>
        <button class="transport-button loop-button active" data-ui-action="loop" type="button" aria-label="Loop">↻</button>
      </div>
      <div class="position-display"><strong>1:01:000</strong><span>/</span><span>0:18:400</span></div>
      <div class="tempo-controls">
        <label class="value-control"><span>BPM</span><input id="tempo-input" type="number" value="120" min="40" max="240" /></label>
        <button class="time-signature" data-ui-action="time-signature" type="button">4 / 4</button>
        <label class="swing-control"><span>SWING</span><input id="swing-input" type="range" min="0" max="100" value="18" /></label>
      </div>
    </section>

    <main class="workspace">
      <aside class="asset-browser panel">
        <div class="panel-heading"><div><span class="eyebrow">LIBRARY</span><h2>Browser</h2></div><button class="ghost-icon" data-ui-action="toggle-browser" type="button" aria-label="Collapse browser">‹</button></div>
        <div class="search-field"><span>⌕</span><input id="asset-search" type="search" placeholder="Search sounds" /><kbd>/</kbd></div>
        <div class="browser-section"><button class="folder-row expanded" type="button"><span class="folder-icon">⌄</span><span class="folder-color orange"></span>Starter Kit</button>
          <div class="asset-list">
            <button class="asset-row selected" type="button"><span class="wave-icon">∿</span><span>Neon Drums</span><span class="asset-action">⋮</span></button>
            <button class="asset-row" type="button"><span class="wave-icon">∿</span><span>Dusty Machines</span><span class="asset-action">⋮</span></button>
            <button class="asset-row" type="button"><span class="wave-icon">∿</span><span>Analog Nights</span><span class="asset-action">⋮</span></button>
          </div>
          <div id="imported-assets" class="asset-list imported-assets"></div>
        </div>
        <div class="browser-section"><button class="folder-row" type="button"><span class="folder-icon">›</span><span class="folder-color violet"></span>My Sounds <span class="folder-count">12</span></button></div>
        <div class="browser-section"><button class="folder-row" type="button"><span class="folder-icon">›</span><span class="folder-color blue"></span>Instruments <span class="folder-count">8</span></button></div>
        <div class="browser-footer"><button type="button" class="add-library" data-project-action="import-audio"><span>＋</span> Import audio</button></div>
      </aside>

      <section class="editor-area">
        <div class="editor-toolbar">
          <div class="view-tabs" role="tablist" aria-label="Editor views">
            <button class="view-tab active" data-view="channel" role="tab" aria-selected="true" type="button"><span>▦</span> Channel Rack</button>
            <button class="view-tab" data-view="piano" role="tab" aria-selected="false" type="button"><span>⌁</span> Piano Roll</button>
            <button class="view-tab" data-view="playlist" role="tab" aria-selected="false" type="button"><span>☷</span> Playlist</button>
          </div>
          <div class="editor-actions"><button class="small-button" data-ui-action="snap" type="button">Snap <strong id="snap-label">1/16</strong>⌄</button><button class="small-button primary-button" data-add-channel type="button">＋ Add Channel</button></div>
        </div>
        <div id="editor-content" class="editor-content"></div>
      </section>

      <aside class="inspector panel">
        <div class="panel-heading"><div><span class="eyebrow">CHANNEL</span><h2 id="inspector-channel-name">Kick</h2></div><button class="ghost-icon" data-ui-action="channel-menu" type="button" aria-label="More channel options">⋮</button></div>
        <div class="channel-color-line"><span class="color-swatch coral"></span><span id="selected-channel-label">Neon Drums / Kick</span><button class="mini-button" data-mix-action="mute" type="button">M</button><button class="mini-button" data-mix-action="solo" type="button">S</button></div>
        <div class="inspector-card"><div class="card-heading"><span>Sampler</span><span class="card-state">ACTIVE</span></div><div class="sample-display"><div class="sample-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span>kick_deep_04.wav</span></div><div class="knob-row"><div class="knob-control"><span class="knob" style="--angle: 0deg"></span><label>Pitch</label><strong>0 st</strong></div><div class="knob-control"><span class="knob" style="--angle: 38deg"></span><label>Decay</label><strong>420 ms</strong></div><div class="knob-control"><span class="knob" style="--angle: -24deg"></span><label>Drive</label><strong>12%</strong></div></div></div>
        <div class="inspector-card"><div class="card-heading"><span>Channel Mix</span><span class="card-state">INSERT 01</span></div><div class="fader-row"><div class="meter"><span style="height: 72%"></span></div><input id="channel-volume" class="vertical-fader" type="range" min="0" max="100" value="78" /><div class="fader-value" id="channel-volume-label">-2.4 dB</div><div class="pan-control"><span>Pan</span><input id="channel-pan" type="range" min="-100" max="100" value="0" /><strong id="channel-pan-label">C</strong></div></div></div>
        <div class="inspector-footer"><div class="cpu-label"><span>CPU</span><span>4%</span></div><div class="cpu-track"><span></span></div><div class="master-label"><span>MASTER</span><strong>-0.8 dB</strong></div><div class="master-meter"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div>
      </aside>
    </main>

    <footer class="statusbar"><div class="pattern-selector"><span class="eyebrow">PATTERN</span><button class="pattern-button" data-ui-action="pattern-menu" type="button">01 — Main Groove <span>⌄</span></button><button class="circle-button" data-ui-action="new-pattern" type="button">＋</button></div><div class="status-message"><span class="green-dot"></span> Ready to make something</div><div class="footer-meta"><span>44.1 kHz</span><span>Web Audio</span><button class="help-button" data-ui-action="help" type="button">?</button></div></footer>
  </div>
`;

function channelView(): string {
  return `
    <div class="view-header"><div><span class="eyebrow">PATTERN 01</span><h1>Main Groove</h1></div><div class="view-header-meta"><span class="length-label">16 STEPS</span><button class="small-button" data-ui-action="duplicate-pattern" type="button">▣ Duplicate</button></div></div>
    <div class="step-editor"><div class="step-ruler"><span class="ruler-spacer"></span>${Array.from({ length: 16 }, (_, index) => `<span class="step-number ${index % 4 === 0 ? "bar-mark" : ""}">${index + 1}</span>`).join("")}</div>${channelRows.map((channel, rowIndex) => `<div class="channel-row" data-channel-index="${rowIndex}"><div class="channel-label"><span class="row-color" style="background:${channel.color}"></span><div><strong>${channel.name}</strong><small>${channel.type}</small></div><button class="row-menu" data-channel-menu="${rowIndex}" type="button">⋮</button></div><div class="step-grid">${Array.from({ length: 16 }, (_, step) => `<button class="step ${channel.pattern.includes(step) ? "filled" : ""} ${step % 4 === 0 ? "bar-mark" : ""}" data-channel-index="${rowIndex}" data-step-index="${step}" style="--step-color:${channel.color}" type="button" aria-label="${channel.name} step ${step + 1}"></button>`).join("")}</div><div class="row-actions"><button data-row-mix="mute" data-channel-index="${rowIndex}" type="button">M</button><button data-row-mix="solo" data-channel-index="${rowIndex}" type="button">S</button></div></div>`).join("")}</div>
    <div class="sequencer-footer"><button class="add-track" data-add-channel type="button">＋ Add channel</button><div class="sequencer-hint"><kbd>Space</kbd> Play <span>•</span> <kbd>⌘ Z</kbd> Undo <span>•</span> Click and drag to paint steps</div></div>
  `;
}

function pianoView(): string {
  return `
    <div class="view-header"><div><span class="eyebrow">PATTERN 01 / MIDI</span><h1>Sub Bass</h1></div><div class="view-header-meta"><button class="small-button" data-ui-action="scale" type="button">Scale: <strong id="scale-label">C Minor</strong>⌄</button><button class="small-button" data-ui-action="quantize" type="button">▣ Quantize</button></div></div>
    <div class="piano-editor"><div class="piano-ruler"><span></span>${Array.from({ length: 16 }, (_, index) => `<span class="${index % 4 === 0 ? "bar-mark" : ""}">${index + 1}</span>`).join("")}</div>${noteRows.map((row, rowIndex) => `<div class="piano-row ${rowIndex % 2 ? "black-key" : ""}"><span class="piano-key">${row.note}</span><div class="note-grid">${Array.from({ length: 16 }, (_, step) => `<button class="note ${row.notes.includes(step) ? "note-filled" : ""}" data-row-index="${rowIndex}" data-step-index="${step}" type="button" style="--note-index:${step}" aria-label="${row.note} step ${step + 1}"></button>`).join("")}</div></div>`).join("")}<div class="velocity-row"><span class="piano-key">VEL</span><div class="velocity-grid">${Array.from({ length: 16 }, (_, index) => `<span style="height:${20 + ((index * 17) % 65)}%"></span>`).join("")}</div></div></div>
  `;
}

function playlistView(): string {
  return `
    <div class="view-header"><div><span class="eyebrow">SONG ARRANGEMENT</span><h1>Playlist</h1></div><div class="view-header-meta"><button class="small-button" data-playlist-action="duplicate" type="button">▣ Duplicate</button><button class="small-button" data-playlist-action="delete" type="button">⌫ Delete</button><button class="small-button primary-button" data-playlist-action="add-track" type="button">＋ Add Track</button></div></div>
    <div class="playlist-editor"><div class="playlist-ruler"><span class="playlist-spacer"></span>${Array.from({ length: 8 }, (_, index) => `<span>${index + 1}</span>`).join("")}</div><div class="arrangement-playhead"></div>${playlistTracks.map((track) => `<div class="playlist-row"><div class="playlist-label"><span class="row-color" style="background:${track.color}"></span><strong>${track.name}</strong><span class="track-actions">M&nbsp; S</span></div><div class="clip-grid" data-track="${track.name}">${playlistClips.filter((clip) => clip.track === track.name).map((clip) => `<button class="clip ${clip.id === selectedClipId ? "selected" : ""}" draggable="true" data-clip-id="${clip.id}" style="left:${(clip.startBar / 8) * 100}%; width:${(clip.lengthBars / 8) * 100}%; --clip-color:${clip.color}" type="button"><strong>${clip.label}</strong><small>Pattern 01</small></button>`).join("")}</div></div>`).join("")}</div>
  `;
}

function renderView(view: ViewName): void {
  const editor = document.querySelector<HTMLDivElement>("#editor-content");
  if (!editor) return;
  editor.innerHTML = view === "channel" ? channelView() : view === "piano" ? pianoView() : playlistView();
  document.querySelectorAll<HTMLButtonElement>(".view-tab").forEach((tab) => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  bindEditorButtons();
  bindPlaylistButtons();
  bindDynamicControls();
}

function bindEditorButtons(): void {
  document.querySelectorAll<HTMLDivElement>(".channel-row").forEach((row) => row.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".step, .row-actions, .row-menu")) return;
    selectedChannelIndex = Number(row.dataset.channelIndex);
    updateInspector();
  }));
  document.querySelectorAll<HTMLButtonElement>(".step").forEach((step) => step.addEventListener("click", () => {
    const channelIndex = Number(step.dataset.channelIndex);
    const stepIndex = Number(step.dataset.stepIndex);
    const channel = channelRows[channelIndex];
    if (!channel) return;
    recordHistory();
    channel.pattern = channel.pattern.includes(stepIndex)
      ? channel.pattern.filter((value) => value !== stepIndex)
      : [...channel.pattern, stepIndex].sort((left, right) => left - right);
    step.classList.toggle("filled");
    audioEngine.setPatterns(getAudioPatterns());
    queueSave();
  }));
  document.querySelectorAll<HTMLButtonElement>(".note").forEach((note) => note.addEventListener("click", () => {
    const rowIndex = Number(note.dataset.rowIndex);
    const stepIndex = Number(note.dataset.stepIndex);
    const row = noteRows[rowIndex];
    if (!row) return;
    recordHistory();
    row.notes = row.notes.includes(stepIndex)
      ? row.notes.filter((value) => value !== stepIndex)
      : [...row.notes, stepIndex].sort((left, right) => left - right);
    note.classList.toggle("note-filled");
    audioEngine.setNotes(getMidiNotes());
    queueSave();
  }));
}

document.querySelector<HTMLInputElement>("#channel-volume")?.addEventListener("input", (event) => {
  const volume = Number((event.target as HTMLInputElement).value) / 100;
  channelMixValues[selectedChannelIndex].volume = volume;
  audioEngine.setChannelMix(channelKinds[selectedChannelIndex], { volume });
  updateInspector();
  queueSave();
});
document.querySelector<HTMLInputElement>("#channel-pan")?.addEventListener("input", (event) => {
  const pan = Number((event.target as HTMLInputElement).value) / 100;
  channelMixValues[selectedChannelIndex].pan = pan;
  audioEngine.setChannelMix(channelKinds[selectedChannelIndex], { pan });
  updateInspector();
  queueSave();
});
document.querySelectorAll<HTMLButtonElement>("[data-mix-action]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.mixAction === "mute" ? "muted" : "soloed";
  channelMixValues[selectedChannelIndex][key] = !channelMixValues[selectedChannelIndex][key];
  audioEngine.setChannelMix(channelKinds[selectedChannelIndex], { [key]: channelMixValues[selectedChannelIndex][key] });
  button.classList.toggle("active", channelMixValues[selectedChannelIndex][key]);
  queueSave();
}));

function getAudioPatterns(): AudioPattern[] {
  return channelRows.map((row, index) => ({ channel: channelKinds[index], steps: row.pattern }));
}

function updateInspector(): void {
  const channel = channelRows[selectedChannelIndex];
  const mix = channelMixValues[selectedChannelIndex];
  if (!channel || !mix) return;
  const label = document.querySelector<HTMLElement>("#selected-channel-label");
  const heading = document.querySelector<HTMLElement>("#inspector-channel-name");
  if (label) label.textContent = `Neon Drums / ${channel.name}`;
  if (heading) heading.textContent = channel.name;
  const volume = document.querySelector<HTMLInputElement>("#channel-volume");
  const pan = document.querySelector<HTMLInputElement>("#channel-pan");
  const volumeLabel = document.querySelector<HTMLElement>("#channel-volume-label");
  const panLabel = document.querySelector<HTMLElement>("#channel-pan-label");
  if (volume) volume.value = String(Math.round(mix.volume * 100));
  if (pan) pan.value = String(Math.round(mix.pan * 100));
  if (volumeLabel) volumeLabel.textContent = `${Math.round((mix.volume - 1) * 12 * 10) / 10} dB`;
  if (panLabel) panLabel.textContent = mix.pan === 0 ? "C" : mix.pan < 0 ? `L${Math.round(Math.abs(mix.pan) * 100)}` : `R${Math.round(mix.pan * 100)}`;
  document.querySelectorAll<HTMLButtonElement>("[data-mix-action]").forEach((button) => button.classList.toggle("active", button.dataset.mixAction === "mute" ? mix.muted : mix.soloed));
}

function renderImportedAssets(): void {
  const list = document.querySelector<HTMLDivElement>("#imported-assets");
  if (!list) return;
  list.innerHTML = importedAssets.map((asset) => `<button class="asset-row imported-asset" data-asset-id="${asset.id}" type="button"><span class="wave-icon">∿</span><span>${asset.name}</span><small>${channelRows[channelKinds.indexOf(asset.channel)].name}</small></button>`).join("");
  list.querySelectorAll<HTMLButtonElement>(".imported-asset").forEach((assetButton) => assetButton.addEventListener("click", () => {
    const asset = importedAssets.find((item) => item.id === assetButton.dataset.assetId);
    if (!asset) return;
    selectedChannelIndex = channelKinds.indexOf(asset.channel);
    updateInspector();
    document.querySelectorAll(".imported-asset").forEach((item) => item.classList.toggle("selected", item === assetButton));
  }));
}

async function restoreImportedAudio(): Promise<void> {
  await Promise.all(importedAssets.map(async (asset) => {
    const data = await loadAssetData(asset.id);
    if (data) await audioEngine.loadSample(asset.channel, data);
  }));
}

function getArrangement(): ArrangementClip[] {
  return playlistClips.flatMap((clip) => clip.channels.map((channel) => ({
    channel,
    startBar: clip.startBar,
    lengthBars: clip.lengthBars,
  })));
}

function bindPlaylistButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".clip").forEach((clip) => {
    clip.addEventListener("click", () => {
      selectedClipId = clip.dataset.clipId ?? null;
      document.querySelectorAll(".clip").forEach((item) => item.classList.toggle("selected", item === clip));
    });
    clip.addEventListener("dragstart", (event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.dataTransfer) dragEvent.dataTransfer.setData("text/plain", clip.dataset.clipId ?? "");
    });
  });

  document.querySelectorAll<HTMLDivElement>(".clip-grid").forEach((grid) => {
    grid.addEventListener("dragover", (event) => event.preventDefault());
    grid.addEventListener("drop", (event) => {
      event.preventDefault();
      const clipId = (event as DragEvent).dataTransfer?.getData("text/plain");
      const clip = playlistClips.find((item) => item.id === clipId);
      if (!clip) return;
      recordHistory();
      const rect = grid.getBoundingClientRect();
      clip.startBar = Math.max(0, Math.min(7, Math.floor((((event as DragEvent).clientX - rect.left) / rect.width) * 8)));
      clip.track = grid.dataset.track ?? clip.track;
      selectedClipId = clip.id;
      audioEngine.setArrangement(getArrangement());
      queueSave();
      renderView("playlist");
    });
    grid.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest(".clip")) return;
      const rect = grid.getBoundingClientRect();
      const startBar = Math.max(0, Math.min(7, Math.floor(((event as MouseEvent).clientX - rect.left) / rect.width * 8)));
      const track = playlistTracks.find((item) => item.name === grid.dataset.track);
      if (!track) return;
      recordHistory();
      const channels: Array<ArrangementClip["channel"]> = track.name === "Drums" ? ["kick", "snare", "hat", "openHat"] : track.name === "Bass" ? ["bass"] : [];
      const newClip: PlaylistClip = { id: `clip-${Date.now()}`, track: track.name, color: track.color, startBar, lengthBars: 1, label: track.name === "Drums" ? "Main Groove" : track.name, channels };
      playlistClips.push(newClip);
      selectedClipId = newClip.id;
      audioEngine.setArrangement(getArrangement());
      queueSave();
      renderView("playlist");
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-playlist-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.playlistAction;
    if (action === "add-track") {
      recordHistory();
      const nextTrackNumber = playlistTracks.length + 1;
      playlistTracks.push({ name: `Track ${nextTrackNumber}`, color: "#f7c66a" });
      queueSave();
      renderView("playlist");
      return;
    }
    const selected = playlistClips.find((clip) => clip.id === selectedClipId);
    if (!selected) return;
    recordHistory();
    if (action === "delete") playlistClips = playlistClips.filter((clip) => clip.id !== selected.id);
    if (action === "duplicate") {
      const duplicate = { ...selected, id: `clip-${Date.now()}`, startBar: Math.min(7, selected.startBar + selected.lengthBars) };
      playlistClips.push(duplicate);
      selectedClipId = duplicate.id;
    }
    audioEngine.setArrangement(getArrangement());
    queueSave();
    renderView("playlist");
  }));
}

function getMidiNotes(): MidiNote[] {
  return noteRows.flatMap((row, rowIndex) => row.notes.map((step) => ({
    start: step,
    duration: 1,
    pitch: notePitches[rowIndex],
    velocity: 0.78,
  })));
}

function createProjectSnapshot(): TrakkProject {
  const project = createDefaultProject();
  project.name = projectName;
  project.tempo = Number(document.querySelector<HTMLInputElement>("#tempo-input")?.value ?? 120);
  project.patterns[0].swing = Number(document.querySelector<HTMLInputElement>("#swing-input")?.value ?? 18) / 100;
  project.patterns[0].events = [
    ...channelRows.flatMap((channel, channelIndex) => channel.pattern.map((step) => ({
      kind: "step" as const,
      channelId: `channel-${channelIndex + 1}`,
      step,
      velocity: 0.85,
    }))),
    ...getMidiNotes().map((note) => ({
      kind: "note" as const,
      channelId: "channel-5",
      start: note.start,
      duration: note.duration,
      pitch: note.pitch,
      velocity: note.velocity,
    })),
  ];
  project.channels = channelRows.map((channel, index) => ({
    id: `channel-${index + 1}`,
    name: channel.name,
    kind: channel.type === "SYNTH" ? "instrument" as const : "drum" as const,
    color: channel.color,
    muted: false,
    soloed: false,
  }));
  project.clips = playlistClips.map((clip) => ({ ...clip }));
  project.assets = importedAssets.map((asset) => ({ ...asset }));
  project.mixer.channels = Object.fromEntries(channelRows.map((_, index) => [`channel-${index + 1}`, { ...channelMixValues[index] }]));
  return project;
}

function setSaveLabel(label: string): void {
  const saveLabel = document.querySelector<HTMLElement>("#save-label");
  if (saveLabel) saveLabel.textContent = label;
}

function setStatus(message: string): void {
  const status = document.querySelector<HTMLElement>(".status-message");
  if (status) status.innerHTML = `<span class="green-dot"></span> ${message}`;
}

function showPopover(title: string, body: string): void {
  document.querySelector(".ui-popover")?.remove();
  const popover = document.createElement("div");
  popover.className = "ui-popover";
  popover.innerHTML = `<div class="popover-heading"><strong>${title}</strong><button data-close-popover type="button">×</button></div><div class="popover-body">${body}</div>`;
  document.body.appendChild(popover);
  popover.querySelector<HTMLButtonElement>("[data-close-popover]")?.addEventListener("click", () => popover.remove());
  window.setTimeout(() => document.addEventListener("click", (event) => {
    if (!popover.contains(event.target as Node)) popover.remove();
  }, { once: true }), 0);
}

function addChannel(): void {
  recordHistory();
  const colors = ["#f7c66a", "#73a7ff", "#bf8cff", "#61d7b3"];
  const channelNumber = channelRows.length - 4;
  channelRows.push({ name: `Percussion ${channelNumber}`, type: "DRUM", color: colors[channelNumber % colors.length], pattern: [3, 7, 11, 15] });
  channelKinds.push("hat");
  channelMixValues.push({ volume: 0.78, pan: 0, muted: false, soloed: false });
  audioEngine.setPatterns(getAudioPatterns());
  renderView("channel");
  selectedChannelIndex = channelRows.length - 1;
  updateInspector();
  queueSave();
  setStatus(`${channelRows[channelRows.length - 1].name} added`);
}

function removeChannel(index: number): void {
  if (channelRows.length <= 1) return;
  recordHistory();
  const [removed] = channelRows.splice(index, 1);
  channelKinds.splice(index, 1);
  channelMixValues.splice(index, 1);
  selectedChannelIndex = Math.min(selectedChannelIndex, channelRows.length - 1);
  audioEngine.setPatterns(getAudioPatterns());
  renderView("channel");
  updateInspector();
  queueSave();
  setStatus(`${removed.name} removed`);
}

function bindDynamicControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-add-channel]").forEach((button) => button.addEventListener("click", addChannel));
  document.querySelectorAll<HTMLButtonElement>("[data-row-mix]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.channelIndex);
    const key = button.dataset.rowMix === "mute" ? "muted" : "soloed";
    channelMixValues[index][key] = !channelMixValues[index][key];
    audioEngine.setChannelMix(channelKinds[index], { [key]: channelMixValues[index][key] });
    button.classList.toggle("active", channelMixValues[index][key]);
    queueSave();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-channel-menu]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.channelMenu);
    selectedChannelIndex = index;
    showPopover(channelRows[index].name, `<button class="popover-action" data-remove-channel type="button">Remove channel</button>`);
    document.querySelector<HTMLButtonElement>("[data-remove-channel]")?.addEventListener("click", () => {
      removeChannel(index);
      document.querySelector(".ui-popover")?.remove();
    });
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-ui-action='duplicate-pattern']").forEach((button) => button.addEventListener("click", () => {
    recordHistory();
    channelRows.forEach((channel) => { channel.pattern = [...channel.pattern]; });
    queueSave();
    setStatus("Pattern duplicated as the active working copy");
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-ui-action='scale']").forEach((button) => button.addEventListener("click", () => {
    const scales = ["C Minor", "A Minor", "D Dorian", "E Phrygian"];
    selectedScale = scales[(scales.indexOf(selectedScale) + 1) % scales.length];
    const label = button.querySelector("strong");
    if (label) label.textContent = selectedScale;
    setStatus(`Scale set to ${selectedScale}`);
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-ui-action='quantize']").forEach((button) => button.addEventListener("click", () => {
    recordHistory();
    noteRows.forEach((row) => { row.notes = [...new Set(row.notes.map((step) => Math.round(step)))] .sort((left, right) => left - right); });
    audioEngine.setNotes(getMidiNotes());
    queueSave();
    setStatus(`Notes quantized to ${snapResolution}`);
  }));
}

function queueSave(): void {
  setSaveLabel("Saving…");
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    try {
      await saveProject(createProjectSnapshot());
      setSaveLabel("Saved locally");
    } catch {
      setSaveLabel("Local save unavailable");
    }
  }, 350);
}

function applyProject(project: TrakkProject): void {
  projectName = project.name;
  const pattern = project.patterns[0];
  if (project.channels.length > 0) {
    while (channelRows.length < project.channels.length) {
      const source = project.channels[channelRows.length];
      channelRows.push({ name: source.name, type: source.kind === "instrument" ? "SYNTH" : "DRUM", color: source.color, pattern: [] });
      channelKinds.push(source.kind === "instrument" ? "bass" : "hat");
      channelMixValues.push({ volume: 0.78, pan: 0, muted: false, soloed: false });
    }
    while (channelRows.length > project.channels.length && channelRows.length > 1) {
      channelRows.pop();
      channelKinds.pop();
      channelMixValues.pop();
    }
  }
  channelRows.forEach((channel, channelIndex) => {
    channel.pattern = pattern.events.filter((event) => event.kind === "step" && event.channelId === `channel-${channelIndex + 1}` && typeof event.step === "number").map((event) => event.step as number);
  });
  noteRows.forEach((row) => { row.notes = []; });
  pattern.events.filter((event) => event.kind === "note" && typeof event.pitch === "number" && typeof event.start === "number").forEach((event) => {
    const rowIndex = notePitches.reduce((closestIndex, pitch, index) => Math.abs(pitch - (event.pitch as number)) < Math.abs(notePitches[closestIndex] - (event.pitch as number)) ? index : closestIndex, 0);
    noteRows[rowIndex].notes.push(event.start as number);
  });
  playlistClips = project.clips.map((clip) => ({ ...clip }));
  importedAssets = project.assets.map((asset) => ({ ...asset }));
  Object.entries(project.mixer.channels).forEach(([channelId, mix]) => {
    const index = Number(channelId.replace("channel-", "")) - 1;
    if (channelMixValues[index]) {
      channelMixValues[index].volume = mix.volume;
      channelMixValues[index].pan = mix.pan;
      channelMixValues[index].muted = mix.muted ?? false;
      channelMixValues[index].soloed = mix.soloed ?? false;
      audioEngine.setChannelMix(channelKinds[index], mix);
    }
  });
  document.querySelector<HTMLInputElement>("#tempo-input")!.value = String(project.tempo);
  document.querySelector<HTMLInputElement>("#swing-input")!.value = String(Math.round(pattern.swing * 100));
  const projectButton = document.querySelector<HTMLButtonElement>(".project-name");
  if (projectButton) projectButton.innerHTML = `${projectName} <span class="chevron">⌄</span>`;
  audioEngine.setTempo(project.tempo);
  audioEngine.setSwing(pattern.swing);
  audioEngine.setPatterns(getAudioPatterns());
  audioEngine.setNotes(getMidiNotes());
  audioEngine.setArrangement(getArrangement());
  const activeView = (document.querySelector<HTMLButtonElement>(".view-tab.active")?.dataset.view ?? "channel") as ViewName;
  renderView(activeView);
  renderImportedAssets();
  updateInspector();
  void restoreImportedAudio();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function recordHistory(): void {
  undoStack.push(createProjectSnapshot());
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function undo(): void {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(createProjectSnapshot());
  applyProject(previous);
  queueSave();
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(createProjectSnapshot());
  applyProject(next);
  queueSave();
}

function addMidiNote(pitch: number, velocity: number): void {
  const closestRow = notePitches.reduce((closestIndex, rowPitch, rowIndex) =>
    Math.abs(rowPitch - pitch) < Math.abs(notePitches[closestIndex] - pitch) ? rowIndex : closestIndex, 0);
  const step = 0;
  if (!noteRows[closestRow].notes.includes(step)) noteRows[closestRow].notes.push(step);
  audioEngine.setNotes(getMidiNotes().map((note) => note.pitch === notePitches[closestRow] && note.start === step ? { ...note, velocity } : note));
  if (document.querySelector(".view-tab.active")?.getAttribute("data-view") === "piano") renderView("piano");
}

document.querySelectorAll<HTMLButtonElement>(".view-tab").forEach((tab) => tab.addEventListener("click", () => renderView(tab.dataset.view as ViewName)));

const playButton = document.querySelector<HTMLButtonElement>(".play-button");
playButton?.addEventListener("click", async () => {
  const tempoInput = document.querySelector<HTMLInputElement>("#tempo-input");
  const swingInput = document.querySelector<HTMLInputElement>("#swing-input");
  audioEngine.setTempo(Number(tempoInput?.value ?? 120));
  audioEngine.setSwing(Number(swingInput?.value ?? 18) / 100);
  audioEngine.setPatterns(getAudioPatterns());
  audioEngine.setNotes(getMidiNotes());
  audioEngine.setArrangement(getArrangement());
  await audioEngine.start();
  const midiConnected = await connectMidiInput(addMidiNote);
  playButton.classList.add("playing");
  playButton.textContent = "Ⅱ";
  document.body.classList.add("is-playing");
  const status = document.querySelector<HTMLElement>(".status-message");
  if (status) status.innerHTML = `<span class="green-dot"></span> Audio engine running${midiConnected ? " · MIDI connected" : ""}`;
});

document.querySelector<HTMLButtonElement>(".stop-button")?.addEventListener("click", () => {
  audioEngine.stop();
  playButton?.classList.remove("playing");
  if (playButton) playButton.textContent = "▶";
  document.body.classList.remove("is-playing");
  const status = document.querySelector<HTMLElement>(".status-message");
  if (status) status.innerHTML = '<span class="green-dot"></span> Ready to make something';
});

document.querySelector<HTMLInputElement>("#tempo-input")?.addEventListener("change", (event) => {
  recordHistory();
  audioEngine.setTempo(Number((event.target as HTMLInputElement).value));
  queueSave();
});
document.querySelector<HTMLInputElement>("#swing-input")?.addEventListener("input", (event) => {
  audioEngine.setSwing(Number((event.target as HTMLInputElement).value) / 100);
  queueSave();
});

document.querySelectorAll<HTMLButtonElement>(".folder-row").forEach((folder) => folder.addEventListener("click", () => folder.classList.toggle("expanded")));
document.querySelectorAll<HTMLButtonElement>(".asset-row").forEach((asset) => asset.addEventListener("click", () => {
  document.querySelectorAll(".asset-row").forEach((row) => row.classList.remove("selected"));
  asset.classList.add("selected");
}));

document.querySelector<HTMLInputElement>("#asset-search")?.addEventListener("input", (event) => {
  const query = (event.target as HTMLInputElement).value.toLowerCase().trim();
  document.querySelectorAll<HTMLButtonElement>(".asset-row").forEach((asset) => {
    asset.hidden = query.length > 0 && !asset.textContent?.toLowerCase().includes(query);
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-ui-action]").forEach((button) => button.addEventListener("click", () => {
  const action = button.dataset.uiAction;
  if (action === "settings") {
    showPopover("Settings", `<div class="popover-setting"><span>Audio</span><strong>Web Audio · 44.1 kHz</strong></div><div class="popover-setting"><span>Storage</span><strong>Local browser workspace</strong></div>`);
  }
  if (action === "account") {
    showPopover("Local workspace", `<p class="popover-copy">TRAKK is running locally. No account or cloud sync is connected.</p>`);
  }
  if (action === "metronome") {
    metronomeEnabled = !metronomeEnabled;
    audioEngine.setMetronome(metronomeEnabled);
    button.classList.toggle("active", metronomeEnabled);
    setStatus(metronomeEnabled ? "Metronome on" : "Metronome off");
  }
  if (action === "loop") {
    loopEnabled = !loopEnabled;
    audioEngine.setLoop(loopEnabled);
    button.classList.toggle("active", loopEnabled);
    setStatus(loopEnabled ? "Arrangement loop on" : "Arrangement loop off");
  }
  if (action === "record") {
    recordArmed = !recordArmed;
    button.classList.toggle("active", recordArmed);
    setStatus(recordArmed ? "Record armed — audio recording is not connected yet" : "Record disarmed");
  }
  if (action === "time-signature") {
    showPopover("Time signature", `<button class="popover-action active" type="button">4 / 4 <small>Supported</small></button><button class="popover-action" disabled type="button">3 / 4 <small>Coming soon</small></button><button class="popover-action" disabled type="button">6 / 8 <small>Coming soon</small></button>`);
  }
  if (action === "toggle-browser") {
    document.querySelector(".workspace")?.classList.toggle("browser-collapsed");
    const collapsed = document.querySelector(".workspace")?.classList.contains("browser-collapsed") ?? false;
    button.textContent = collapsed ? "›" : "‹";
    button.setAttribute("aria-label", collapsed ? "Expand browser" : "Collapse browser");
  }
  if (action === "snap") {
    const options = ["1/4", "1/8", "1/16", "1/32", "Off"];
    snapResolution = options[(options.indexOf(snapResolution) + 1) % options.length];
    const label = document.querySelector<HTMLElement>("#snap-label");
    if (label) label.textContent = snapResolution;
    setStatus(`Snap set to ${snapResolution}`);
  }
  if (action === "pattern-menu") {
    showPopover("Pattern 01", `<p class="popover-copy">Main Groove · 16 steps · ${channelRows.length} channels</p><button class="popover-action" data-ui-pattern-action="rename" type="button">Rename pattern</button>`);
    document.querySelector<HTMLButtonElement>("[data-ui-pattern-action='rename']")?.addEventListener("click", () => {
      const name = window.prompt("Pattern name", "Main Groove")?.trim();
      if (name) setStatus(`Pattern renamed to ${name}`);
      document.querySelector(".ui-popover")?.remove();
    });
  }
  if (action === "new-pattern") {
    recordHistory();
    channelRows.forEach((channel) => { channel.pattern = []; });
    noteRows.forEach((row) => { row.notes = []; });
    audioEngine.setPatterns(getAudioPatterns());
    audioEngine.setNotes(getMidiNotes());
    renderView("channel");
    queueSave();
    setStatus("New empty pattern created");
  }
  if (action === "help") {
    showPopover("TRAKK shortcuts", `<div class="shortcut-row"><kbd>Space</kbd><span>Play / pause</span></div><div class="shortcut-row"><kbd>⌘ Z</kbd><span>Undo</span></div><div class="shortcut-row"><kbd>⌘ ⇧ Z</kbd><span>Redo</span></div><div class="shortcut-row"><kbd>/</kbd><span>Focus sound search</span></div>`);
  }
  if (action === "channel-menu") {
    showPopover(channelRows[selectedChannelIndex].name, `<button class="popover-action" data-remove-selected type="button">Remove channel</button>`);
    document.querySelector<HTMLButtonElement>("[data-remove-selected]")?.addEventListener("click", () => {
      removeChannel(selectedChannelIndex);
      document.querySelector(".ui-popover")?.remove();
    });
  }
}));

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !(event.target as HTMLElement).matches("input, textarea, select")) {
    event.preventDefault();
    document.querySelector<HTMLInputElement>("#asset-search")?.focus();
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-project-action]").forEach((button) => button.addEventListener("click", async () => {
  const action = button.dataset.projectAction;
  if (action === "undo") {
    undo();
    return;
  }
  if (action === "redo") {
    redo();
    return;
  }
  if (action === "import-audio") {
    document.querySelector<HTMLInputElement>("#audio-file-input")?.click();
    return;
  }
  if (action === "rename") {
    const nextName = window.prompt("Name this session", projectName)?.trim();
    if (!nextName) return;
    recordHistory();
    projectName = nextName;
    button.innerHTML = `${projectName} <span class="chevron">⌄</span>`;
    queueSave();
    return;
  }
  if (action === "save") {
    await saveProject(createProjectSnapshot());
    setSaveLabel("Saved locally");
    return;
  }
  if (action === "open") {
    document.querySelector<HTMLInputElement>("#project-file-input")?.click();
    return;
  }
  if (action === "download") {
    const projectFile = new Blob([JSON.stringify(createProjectSnapshot(), null, 2)], { type: "application/json" });
    downloadBlob(projectFile, `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "trakk-session"}.trakk.json`);
    setSaveLabel("Project file downloaded");
    return;
  }
  if (action === "export") {
    const status = document.querySelector<HTMLElement>(".status-message");
    if (status) status.innerHTML = '<span class="green-dot"></span> Rendering WAV…';
    const bars = Math.max(1, ...playlistClips.map((clip) => clip.startBar + clip.lengthBars));
    const wav = await renderArrangementWav({ tempo: Number(document.querySelector<HTMLInputElement>("#tempo-input")?.value ?? 120), bars, patterns: getAudioPatterns(), notes: getMidiNotes(), arrangement: getArrangement() });
    downloadBlob(wav, `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "trakk-session"}.wav`);
    if (status) status.innerHTML = '<span class="green-dot"></span> WAV exported';
  }
}));

document.querySelector<HTMLInputElement>("#project-file-input")?.addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    applyProject(parseProject(await file.text()));
    await saveProject(createProjectSnapshot());
    setSaveLabel("Loaded and saved");
  } catch {
    setSaveLabel("Could not open project");
  }
});

document.querySelector<HTMLInputElement>("#audio-file-input")?.addEventListener("change", async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const assetId = `asset-${Date.now()}`;
    const data = await file.arrayBuffer();
    await audioEngine.loadSample(channelKinds[selectedChannelIndex], data);
    await saveAssetData(assetId, data);
    importedAssets.push({ id: assetId, name: file.name, size: file.size, channel: channelKinds[selectedChannelIndex] });
    renderImportedAssets();
    queueSave();
    setSaveLabel(`${file.name} imported`);
  } catch {
    setSaveLabel("Could not decode audio");
  } finally {
    input.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (target.matches("input, textarea, select")) return;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
    return;
  }
  if (modifier && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    playButton?.click();
  }
});

defaultProject.patterns[0].events = [
  ...channelRows.flatMap((channel, channelIndex) => channel.pattern.map((step) => ({
    kind: "step" as const,
    channelId: `channel-${channelIndex + 1}`,
    step,
    velocity: 0.85,
  }))),
  ...getMidiNotes().map((note) => ({
    kind: "note" as const,
    channelId: "channel-5",
    start: note.start,
    duration: note.duration,
    pitch: note.pitch,
    velocity: note.velocity,
  })),
];
audioEngine.setPatterns(getAudioPatterns());
audioEngine.setNotes(getMidiNotes());
audioEngine.setArrangement(getArrangement());
channelKinds.forEach((channel, index) => audioEngine.setChannelMix(channel, channelMixValues[index]));
renderView("channel");
renderImportedAssets();
updateInspector();

void loadProject().then((savedProject) => {
  if (savedProject) applyProject(savedProject);
}).catch(() => setSaveLabel("New session"));
