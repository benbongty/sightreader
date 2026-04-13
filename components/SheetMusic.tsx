
import React, { useEffect, useRef, useMemo } from 'react';
import { Factory, Beam, Accidental } from 'vexflow';
import { ExerciseItem, ClefType, KeyRoot, KeyType } from '../types.ts';

interface SheetMusicProps {
  items: ExerciseItem[];
  clef: ClefType;
  activeIndex: number;
  keyRoot?: KeyRoot;
  keyType?: KeyType;
}

const SheetMusic: React.FC<SheetMusicProps> = ({ 
  items, 
  clef, 
  activeIndex, 
  keyRoot = 'C', 
  keyType = 'major' 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pre-calculate stem directions for beam groups to ensure consistency within a group.
  // We use useMemo with items[0]?.id so it only recalculates when a new exercise is generated,
  // not when the status of individual notes changes.
  const beamGroups = useMemo(() => {
    const groups = new Map<number, string>();
    items.forEach(item => {
        if (item.isBeamGroup && item.beamGroupIndex !== undefined) {
            if (!groups.has(item.beamGroupIndex)) {
                groups.set(item.beamGroupIndex, Math.random() > 0.5 ? 'up' : 'down');
            }
        }
    });
    return groups;
  }, [items[0]?.id]);

  useEffect(() => {
    if (!containerRef.current || items.length === 0) return;

    // Clear previous render
    containerRef.current.innerHTML = '';

    // Scaling factor to make the music bigger
    const scale = 1.3;
    const baseHeight = 220; 
    
    // Key spec for VexFlow (e.g., 'C', 'Dm', 'F#')
    let keySpec = keyRoot;
    if (keyType === 'minor') {
        keySpec += 'm';
    }

    // Calculate required width based on content dynamically
    let calculatedMinWidth = 80; // Base padding for Key/Clef/TimeSig
    
    items.forEach((item, index) => {
        const isBeamed = item.isBeamGroup;
        const prevItem = items[index - 1];
        
        // Add extra space if starting a new beam group
        const isNewGroup = isBeamed && prevItem && prevItem.beamGroupIndex !== item.beamGroupIndex;
        if (isNewGroup) {
            calculatedMinWidth += 30; // Larger gap between beam groups
        }
        
        // Dynamic width calculation
        let itemWidth = 70; // Default

        if (isBeamed) {
            itemWidth = 25; // Tight spacing
            // Heuristic: Add padding if accidental is present.
            // Ideally we check if it's redundant with key sig, but checking existence is safe buffer.
            if (item.notes.some(n => n.accidental)) {
                itemWidth += 15; 
            }
        }
        calculatedMinWidth += itemWidth; 
    });

    const minSystemWidth = Math.max(calculatedMinWidth, 400); 
    const systemWidth = minSystemWidth;
    const factoryWidth = systemWidth + 60; 

    const vf = new Factory({
      renderer: { elementId: containerRef.current as any, width: factoryWidth * scale, height: baseHeight * scale }
    });

    const context = vf.getContext();
    // Use SVG viewBox for crisp, accurate scaling without coordinate rounding errors
    context.setViewBox(0, 0, factoryWidth, baseHeight);

    const score = vf.EasyScore();
    const system = vf.System({
        x: 0,
        y: 50,
        width: systemWidth, 
        noJustification: false 
    });

    const staveNotes = items.flatMap((item, index) => {
      const keys = item.notes.map(n => {
          let acc = n.accidental || '';
          return `${n.name}${acc}${n.octave}`;
      });
      
      const duration = item.notes[0].duration || 'q';
      
      let noteString = '';
      if (keys.length > 1) {
        noteString = `(${keys.join(' ')})/${duration}`;
      } else {
        noteString = `${keys[0]}/${duration}`;
      }

      const isActive = index === activeIndex;
      const color = item.status === 'correct' ? '#22c55e' : 
                    item.status === 'incorrect' ? '#ef4444' : 
                    isActive ? '#3b82f6' : 'black';

      let options: any = { clef };
      if (item.isBeamGroup && item.beamGroupIndex !== undefined) {
          options.stem = beamGroups.get(item.beamGroupIndex);
      }

      // Pass clef to constructor or via EasyScore context if needed, but 'clef' prop in notes() handles mapping
      const notes = score.notes(noteString, options);
      
      notes.forEach(note => {
         note.setStyle({ fillStyle: color, strokeStyle: color });
      });

      return notes;
    });

    const durationValues: Record<string, number> = {
      'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25
    };

    const totalBeats = items.reduce((acc, item) => {
      const dur = item.notes[0].duration || 'q';
      return acc + (durationValues[dur] || 1); 
    }, 0);

    let numBeats = totalBeats;
    let beatValue = 4;

    if (totalBeats % 1 !== 0) {
      if (totalBeats % 0.5 === 0) {
        numBeats = totalBeats * 2;
        beatValue = 8;
      } else {
        numBeats = totalBeats * 4;
        beatValue = 16;
      }
    }
    
    if (numBeats === 0) numBeats = 4;

    const timeSig = `${numBeats}/${beatValue}`;
    const voice = score.voice(staveNotes, { time: timeSig });
    
    // CRITICAL FIX: Apply accidentals logic based on Key Signature
    // This hides accidentals that are already in the key signature (e.g. F# in D Major)
    // and adds Naturals if needed (e.g. F Natural in D Major).
    Accidental.applyAccidentals([voice], keySpec);

    // Manual Beaming
    const beams: Beam[] = [];
    let currentBeamGroup: any[] = [];
    let lastBeamIndex: number | undefined = undefined;

    staveNotes.forEach((note, index) => {
        const item = items[index];
        if (item.beamGroupIndex !== undefined) {
             if (lastBeamIndex !== undefined && item.beamGroupIndex !== lastBeamIndex) {
                 if (currentBeamGroup.length > 0) {
                     beams.push(new Beam(currentBeamGroup));
                 }
                 currentBeamGroup = [];
             }
             currentBeamGroup.push(note);
             lastBeamIndex = item.beamGroupIndex;
        } else {
             if (currentBeamGroup.length > 0) {
                 beams.push(new Beam(currentBeamGroup));
                 currentBeamGroup = [];
             }
             lastBeamIndex = undefined;
        }
    });
    if (currentBeamGroup.length > 0) {
        beams.push(new Beam(currentBeamGroup));
    }

    const stave = system.addStave({
      voices: [voice]
    });
    
    stave.addClef(clef);
    stave.addKeySignature(keySpec);
    stave.addTimeSignature(timeSig);

    vf.draw();
    
    beams.forEach(b => b.setContext(vf.getContext()).draw());

  }, [items, clef, activeIndex, keyRoot, keyType, beamGroups]);

  return (
    <div className="w-full flex justify-center bg-white dark:bg-slate-800 rounded-xl shadow-inner p-4 overflow-x-auto mb-6 custom-scrollbar transition-colors duration-300">
       <div ref={containerRef} className="flex-shrink-0" /> 
    </div>
  );
};

export default SheetMusic;
