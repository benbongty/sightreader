
import { KeyConfig } from './types.ts';

// Middle C is MIDI 60 (C4)
export const MIDDLE_C = 60;

// To achieve 35 white keys with 19th position as Middle C:
// 18 white keys below C4.
// White keys in an octave: 7.
// 18 / 7 = 2 octaves + 4 keys.
// C4 -> C3 -> C2.
// Below C2: B1, A1, G1, F1.
// So start at F1 (MIDI 29).
// Let's verify:
// F1, G1, A1, B1 (4)
// C2-B2 (7)
// C3-B3 (7)
// C4 (19th key!)
export const START_MIDI = 29; // F1
export const TOTAL_WHITE_KEYS = 35;

// Generate Keyboard Map
export const generateKeyboardMap = (): KeyConfig[] => {
  const keys: KeyConfig[] = [];
  let currentMidi = START_MIDI;
  let whiteKeyCount = 0;

  // We need to generate enough notes to cover 35 white keys.
  // A safe upper bound loop, we break when whiteKeyCount hits target
  while (whiteKeyCount < TOTAL_WHITE_KEYS) {
    const octave = Math.floor(currentMidi / 12) - 1;
    const noteInOctave = currentMidi % 12;
    
    // MIDI 0 is C-1. 
    // 0:C, 1:C#, 2:D, 3:D#, 4:E, 5:F, 6:F#, 7:G, 8:G#, 9:A, 10:A#, 11:B
    
    const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);
    let name = '';
    
    switch(noteInOctave) {
      case 0: name = 'C'; break;
      case 1: name = 'C#'; break;
      case 2: name = 'D'; break;
      case 3: name = 'D#'; break;
      case 4: name = 'E'; break;
      case 5: name = 'F'; break;
      case 6: name = 'F#'; break;
      case 7: name = 'G'; break;
      case 8: name = 'G#'; break;
      case 9: name = 'A'; break;
      case 10: name = 'A#'; break;
      case 11: name = 'B'; break;
    }

    if (!isBlack) {
      whiteKeyCount++;
    }

    keys.push({
      midi: currentMidi,
      type: isBlack ? 'black' : 'white',
      label: `${name}${octave}`
    });

    currentMidi++;
  }
  return keys;
};

export const KEYBOARD_MAP = generateKeyboardMap();
