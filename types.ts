
export type ClefType = 'treble' | 'bass';
export type GameMode = 'single' | 'chords' | 'beams';
// Extended KeyRoots to include flats and sharps
export type KeyRoot = 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#' | 'C#' | 'F' | 'Bb' | 'Eb' | 'Ab' | 'Db' | 'Gb' | 'Cb';
export type KeyType = 'major' | 'minor';

export interface Note {
  midi: number;
  name: string; // e.g., "C"
  octave: number; // e.g., 4
  accidental?: '#' | '##' | 'b' | 'bb' | 'n' | null; // 'n' for natural if needed explicitly
  duration?: 'w' | 'h' | 'q' | '8' | '16';
}

export interface Chord {
  notes: Note[];
  duration?: string;
}

export interface ExerciseItem {
  id: string;
  notes: Note[]; // Array of notes. If length > 1 and mode is chord, it's a chord.
  status: 'pending' | 'correct' | 'incorrect';
  userInput?: number[]; // MIDI numbers inputs
  isBeamGroup?: boolean; // For visual grouping
  beamGroupIndex?: number; // Defines which beam group this note belongs to
}

export interface GameSettings {
  clef: ClefType;
  useAccidentals: boolean;
  mode: GameMode;
  keyRoot: KeyRoot;
  keyType: KeyType;
  noteCount: number;
  inputMode?: 'keyboard' | 'mic';
  restrictedNotes?: number[]; // Array of MIDI numbers to restrict generation to
  maxLedgerLinesUp?: number;
  maxLedgerLinesDown?: number;
}

export interface KeyConfig {
  midi: number;
  type: 'white' | 'black';
  label: string;
  leftOffset?: number; // For CSS positioning of black keys
}
