export const CURRENT_PROJECT_VERSION = 1;

export type ProjectChannel = {
  id: string;
  name: string;
  kind: "drum" | "instrument";
  color: string;
  muted: boolean;
  soloed: boolean;
};

export type ProjectPattern = {
  id: string;
  name: string;
  lengthSteps: number;
  resolution: number;
  swing: number;
  events: Array<{
    kind: "step" | "note";
    channelId: string;
    step?: number;
    start?: number;
    duration?: number;
    pitch?: number;
    velocity: number;
  }>;
};

export type ProjectClip = {
  id: string;
  track: string;
  label: string;
  color: string;
  startBar: number;
  lengthBars: number;
  channels: Array<"kick" | "snare" | "hat" | "openHat" | "bass">;
};

export type ProjectAsset = {
  id: string;
  name: string;
  size: number;
  channel: "kick" | "snare" | "hat" | "openHat" | "bass";
};

export type TrakkProject = {
  version: number;
  name: string;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  patterns: ProjectPattern[];
  channels: ProjectChannel[];
  clips: ProjectClip[];
  assets: ProjectAsset[];
  mixer: { masterVolume: number; channels: Record<string, { volume: number; pan: number; muted?: boolean; soloed?: boolean }> };
};

export function createDefaultProject(): TrakkProject {
  return {
    version: CURRENT_PROJECT_VERSION,
    name: "Untitled Session",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    patterns: [{ id: "pattern-01", name: "Main Groove", lengthSteps: 16, resolution: 16, swing: 0.18, events: [] }],
    channels: [],
    clips: [],
    assets: [],
    mixer: { masterVolume: 0.8, channels: {} },
  };
}

export function serializeProject(project: TrakkProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(rawProject: string): TrakkProject {
  const parsed = JSON.parse(rawProject) as Partial<TrakkProject>;
  if (!parsed || typeof parsed !== "object" || typeof parsed.name !== "string" || typeof parsed.tempo !== "number") {
    throw new Error("Invalid TRAKK project file");
  }
  return { ...createDefaultProject(), ...parsed, version: typeof parsed.version === "number" ? parsed.version : CURRENT_PROJECT_VERSION };
}
