
import { Note, ExerciseItem, GameSettings, KeyRoot, KeyType } from '../types.ts';
import { v4 as uuidv4 } from 'uuid';

// Keyboard constraint: F1 (29) to E6 (88)
const TREBLE_MIN = 53; // F3
const TREBLE_MAX = 88; // E6
const BASS_MIN = 29;   // F1
const BASS_MAX = 67;   // G4

const getRandomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// --- Key Signature Logic ---

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCH_CLASSES: Record<string, number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
};

// Standard MIDI numbers for roots (C=0, C#=1, etc.)
const ROOT_MIDI_VALUES: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11
};

// Scale Intervals
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10]; // Natural Minor

const getDiatonicScale = (root: KeyRoot, type: KeyType) => {
  const rootLetter = root[0];
  const startIndex = LETTERS.indexOf(rootLetter);
  
  const rootMidi = ROOT_MIDI_VALUES[root];
  const intervals = type === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  
  const scale = [];
  for (let i = 0; i < 7; i++) {
    const letter = LETTERS[(startIndex + i) % 7];
    const targetPc = (rootMidi + intervals[i]) % 12;
    const naturalPc = LETTER_PITCH_CLASSES[letter];
    
    let diff = targetPc - naturalPc;
    // Normalize diff
    while (diff > 5) diff -= 12;
    while (diff < -6) diff += 12;
    
    let accidental: '#' | '##' | 'b' | 'bb' | null = null;
    if (diff === 1) accidental = '#';
    else if (diff === 2) accidental = '##';
    else if (diff === -1) accidental = 'b';
    else if (diff === -2) accidental = 'bb';
    
    scale.push({
      letter,
      accidental,
      pitchClass: targetPc,
      diff
    });
  }
  return scale;
};

const getScalePitchClasses = (root: KeyRoot, type: KeyType): number[] => {
  return getDiatonicScale(root, type).map(n => n.pitchClass);
};

// Determining if we should spell with Sharps or Flats
const shouldUseFlats = (root: KeyRoot, type: KeyType): boolean => {
  if (['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'].includes(root)) return true;
  if (type === 'minor' && ['D', 'G', 'C', 'F', 'Bb', 'Eb'].includes(root)) return true;
  return false;
};

const applyDiff = (note: any, extraDiff: number) => {
  let newDiff = note.diff + extraDiff;
  let newAccidental: '#' | '##' | 'b' | 'bb' | null = null;
  if (newDiff === 1) newAccidental = '#';
  else if (newDiff === 2) newAccidental = '##';
  else if (newDiff === -1) newAccidental = 'b';
  else if (newDiff === -2) newAccidental = 'bb';
  
  return { letter: note.letter, accidental: newAccidental, diff: newDiff };
};

const spellChromatic = (pc: number, scale: any[], useFlats: boolean) => {
  let raised = scale.find(n => (n.pitchClass + 1) % 12 === pc);
  let lowered = scale.find(n => (n.pitchClass - 1 + 12) % 12 === pc);
  
  if (useFlats && lowered) {
    return applyDiff(lowered, -1);
  } else if (!useFlats && raised) {
    return applyDiff(raised, 1);
  } else if (lowered) {
    return applyDiff(lowered, -1);
  } else if (raised) {
    return applyDiff(raised, 1);
  }
  
  // Fallback
  return { letter: 'C', accidental: null, diff: 0 };
};

/**
 * Converts MIDI to a Note object properly spelled for the current Key.
 */
const midiToNote = (midi: number, root: KeyRoot, type: KeyType): Note => {
  const pitchClass = midi % 12;
  const scale = getDiatonicScale(root, type);
  
  let diatonicNote = scale.find(n => n.pitchClass === pitchClass);
  let letter: string;
  let accidental: '#' | '##' | 'b' | 'bb' | 'n' | null = null;
  let diff: number = 0;

  if (diatonicNote) {
    letter = diatonicNote.letter;
    accidental = diatonicNote.accidental;
    diff = diatonicNote.diff;
  } else {
    // Randomize to practice both sharps and flats (and double accidentals)
    const useFlats = Math.random() < 0.5;
    const chromaticNote = spellChromatic(pitchClass, scale, useFlats);
    letter = chromaticNote.letter;
    accidental = chromaticNote.accidental;
    diff = chromaticNote.diff;
  }

  // Check against Key Signature for Naturals
  // If the note is diatonic to the key, we don't strictly *need* an accidental for VexFlow if it matches the key sig,
  // BUT EasyScore prefers explicit pitch (e.g. f#4).
  // However, if we have a note that is normally sharp in the key (e.g. F# in D Major),
  // but the MIDI is F Natural (65), we MUST return accidental: 'n'.
  
  if (!diatonicNote && accidental === null) {
      // It's a natural note, but it's chromatic. This means the key signature has a sharp or flat for this letter,
      // and we are playing the natural version.
      accidental = 'n';
  }

  const naturalPc = LETTER_PITCH_CLASSES[letter];
  const octave = Math.round((midi - naturalPc - diff) / 12) - 1;

  return {
    midi,
    name: letter,
    octave,
    accidental
  };
};

export const generateExercise = (settings: GameSettings): ExerciseItem[] => {
  const items: ExerciseItem[] = [];
  
  let min = settings.clef === 'treble' ? TREBLE_MIN : BASS_MIN;
  let max = settings.clef === 'treble' ? TREBLE_MAX : BASS_MAX;

  if (settings.clef === 'treble') {
    if (settings.maxLedgerLinesDown !== undefined) {
      switch(settings.maxLedgerLinesDown) {
        case 0: min = 62; break; // D4
        case 1: min = 59; break; // B3
        case 2: min = 55; break; // G3
        case 3: min = 52; break; // E3
        default: min = 53; break;
      }
    }
    if (settings.maxLedgerLinesUp !== undefined) {
      switch(settings.maxLedgerLinesUp) {
        case 0: max = 79; break; // G5
        case 1: max = 83; break; // B5
        case 2: max = 86; break; // D6
        case 3: max = 89; break; // F6
        default: max = 88; break;
      }
    }
  } else {
    if (settings.maxLedgerLinesDown !== undefined) {
      switch(settings.maxLedgerLinesDown) {
        case 0: min = 41; break; // F2
        case 1: min = 38; break; // D2
        case 2: min = 35; break; // B1
        case 3: min = 31; break; // G1
        case 4: min = 28; break; // E1
        default: min = 29; break;
      }
    }
    if (settings.maxLedgerLinesUp !== undefined) {
      switch(settings.maxLedgerLinesUp) {
        case 0: max = 59; break; // B3
        case 1: max = 62; break; // D4
        case 2: max = 65; break; // F4
        case 3: max = 69; break; // A4
        default: max = 67; break;
      }
    }
  }
  
  // 1. Determine allowed pitch classes based on Key Signature
  const diatonicPitchClasses = getScalePitchClasses(settings.keyRoot, settings.keyType);
  const sortedPcs = [...diatonicPitchClasses].sort((a,b) => a-b);

  // Helper to check validity
  const isValidNote = (midi: number): boolean => {
    if (settings.restrictedNotes && settings.restrictedNotes.length > 0) {
      return settings.restrictedNotes.includes(midi);
    }
    // BUG FIX: If useAccidentals is FALSE, the note MUST be in the diatonic scale.
    // E.g., Key D Major (F#). Midi 66 (F#) -> VALID. Midi 65 (F) -> INVALID.
    if (!settings.useAccidentals) {
      return diatonicPitchClasses.includes(midi % 12);
    }
    // If useAccidentals is TRUE, any note is valid (chromatic)
    return true; 
  };

  const getValidRandomMidi = (min: number, max: number): number => {
    // We use a property on the function to store the bag across calls in the same session
    // To ensure equal distribution, we generate all valid notes, shuffle them, and draw.
    const bagKey = `${settings.clef}-${settings.keyRoot}-${settings.keyType}-${settings.useAccidentals}-${settings.restrictedNotes?.join(',')}`;
    
    if (!(getValidRandomMidi as any).bag || (getValidRandomMidi as any).bagKey !== bagKey || (getValidRandomMidi as any).bag.length === 0) {
      let newBag: number[] = [];
      if (settings.restrictedNotes && settings.restrictedNotes.length > 0) {
        newBag = [...settings.restrictedNotes];
      } else {
        for (let i = min; i <= max; i++) {
          if (isValidNote(i)) newBag.push(i);
        }
      }
      
      // Shuffle
      for (let i = newBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newBag[i], newBag[j]] = [newBag[j], newBag[i]];
      }
      
      (getValidRandomMidi as any).bag = newBag;
      (getValidRandomMidi as any).bagKey = bagKey;
    }
    
    return (getValidRandomMidi as any).bag.pop();
  };

  if (settings.mode === 'single') {
    const totalNotes = settings.noteCount || 12;
    let i = 0;
    let beamGroupCounter = 0;
    
    while (i < totalNotes) {
      // Randomly decide if the next notes should be a beam group (e.g., 2 or 4 eighth notes)
      const makeBeam = Math.random() > 0.4;
      
      if (makeBeam && i <= totalNotes - 2) {
        // Create a beam group of 2 or 4 notes
        const notesInGroup = (Math.random() > 0.5 && i <= totalNotes - 4) ? 4 : 2;
        for (let n = 0; n < notesInGroup; n++) {
          const midi = getValidRandomMidi(min, max);
          const noteObj = midiToNote(midi, settings.keyRoot, settings.keyType);
          noteObj.duration = '8';
          items.push({
            id: uuidv4(),
            notes: [noteObj],
            status: 'pending',
            isBeamGroup: true,
            beamGroupIndex: beamGroupCounter
          });
          i++;
        }
        beamGroupCounter++;
      } else {
        // Single quarter note
        const midi = getValidRandomMidi(min, max);
        const noteObj = midiToNote(midi, settings.keyRoot, settings.keyType);
        noteObj.duration = 'q';
        items.push({
          id: uuidv4(),
          notes: [noteObj],
          status: 'pending'
        });
        i++;
      }
    }
  } 
  else if (settings.mode === 'chords') {
    const itemCount = settings.noteCount || 6;
    for (let i = 0; i < itemCount; i++) {
      const safeMax = max - 11;
      let root = getValidRandomMidi(min, safeMax);
      
      const isSeventh = Math.random() > 0.7;
      const chordMidis = [root];
      
      if (!settings.useAccidentals) {
         // DIATONIC CHORDS ONLY
         // We construct the chord by stacking thirds within the scale.
         // We use scale indices to find the correct diatonic third and fifth.
         
         const rootPc = root % 12;
         const rootIndex = sortedPcs.indexOf(rootPc);
         
         if (rootIndex === -1) {
            // Should not happen as getValidRandomMidi ensures root is valid for diatonic
            i--; continue;
         }

         // Third: index + 2 (wrapping around scale length 7)
         const thirdPc = sortedPcs[(rootIndex + 2) % sortedPcs.length];
         let thirdMidi = root + 1;
         // Find next note above root that matches thirdPc
         while (thirdMidi % 12 !== thirdPc) thirdMidi++;
         chordMidis.push(thirdMidi);

         // Fifth: index + 4
         const fifthPc = sortedPcs[(rootIndex + 4) % sortedPcs.length];
         let fifthMidi = thirdMidi + 1;
         while (fifthMidi % 12 !== fifthPc) fifthMidi++;
         chordMidis.push(fifthMidi);

         // Seventh: index + 6
         if (isSeventh) {
            const seventhPc = sortedPcs[(rootIndex + 6) % sortedPcs.length];
            let seventhMidi = fifthMidi + 1;
            while (seventhMidi % 12 !== seventhPc) seventhMidi++;
            chordMidis.push(seventhMidi);
         }

      } else {
        // CHROMATIC CHORDS
        // Randomly pick Major, Minor, Diminished, Augmented
        const type = Math.random();
        if (type < 0.4) {
            // Major: 0-4-7
            chordMidis.push(root + 4);
            chordMidis.push(root + 7);
        } else if (type < 0.7) {
            // Minor: 0-3-7
            chordMidis.push(root + 3);
            chordMidis.push(root + 7);
        } else if (type < 0.9) {
            // Diminished: 0-3-6
            chordMidis.push(root + 3);
            chordMidis.push(root + 6);
        } else {
            // Augmented: 0-4-8
            chordMidis.push(root + 4);
            chordMidis.push(root + 8);
        }

        // Add 7ths to chromatic chords?
        if (isSeventh) {
             // Add minor 7th (10) or Major 7th (11) relative to root
             chordMidis.push(root + (Math.random() > 0.5 ? 10 : 11));
        }
      }
      
      items.push({
          id: uuidv4(),
          notes: chordMidis.map(m => midiToNote(m, settings.keyRoot, settings.keyType)),
          status: 'pending'
      });
    }
  }
  else if (settings.mode === 'beams') {
      const totalNotes = settings.noteCount || 12;
      const groupCount = Math.max(1, Math.floor(totalNotes / 4)); 
      const notesPerGroup = 4;
      
      for (let g = 0; g < groupCount; g++) {
          for (let n = 0; n < notesPerGroup; n++) {
              const midi = getValidRandomMidi(min, max);
              const noteObj = midiToNote(midi, settings.keyRoot, settings.keyType);
              noteObj.duration = '8';
              
              items.push({
                  id: uuidv4(),
                  notes: [noteObj],
                  status: 'pending',
                  isBeamGroup: true,
                  beamGroupIndex: g
              });
          }
      }
  }

  return items;
};
