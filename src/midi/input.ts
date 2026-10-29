type MidiInput = {
  onmidimessage: ((event: { data?: Uint8Array }) => void) | null;
};

type MidiAccess = {
  inputs: Map<string, MidiInput>;
};

type MidiNavigator = Navigator & {
  requestMIDIAccess?: () => Promise<MidiAccess>;
};

export async function connectMidiInput(onNote: (pitch: number, velocity: number) => void): Promise<boolean> {
  const requestMIDIAccess = (navigator as MidiNavigator).requestMIDIAccess;
  if (!requestMIDIAccess) return false;

  try {
    const access = await requestMIDIAccess.call(navigator);
    let connected = false;
    access.inputs.forEach((input) => {
      connected = true;
      input.onmidimessage = (event) => {
        const [status = 0, pitch = 0, velocity = 0] = event.data ?? new Uint8Array();
        const isNoteOn = (status & 0xf0) === 0x90 && velocity > 0;
        if (isNoteOn) onNote(pitch, velocity / 127);
      };
    });
    return connected;
  } catch {
    return false;
  }
}
