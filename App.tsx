
import React, { useState, useEffect, useCallback } from 'react';
import { Music, Settings as SettingsIcon, Volume2, RotateCcw, Check, Play, Loader2, Moon, Sun, Trophy } from 'lucide-react';
import Piano from './components/Piano.tsx';
import SheetMusic from './components/SheetMusic.tsx';
import { GameSettings, ExerciseItem, KeyRoot, KeyType } from './types.ts';
import { generateExercise } from './services/logic.ts';
import { audioService } from './services/audioService.ts';
import { usePitchDetector } from './hooks/usePitchDetector.ts';

const App: React.FC = () => {
  // --- State ---
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<GameSettings>({
    clef: 'treble',
    useAccidentals: false, // Default false to prevent confusion
    mode: 'single',
    keyRoot: 'C',
    keyType: 'major',
    noteCount: 12
  });
  
  const [exerciseItems, setExerciseItems] = useState<ExerciseItem[]>([]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedChordNotes, setSelectedChordNotes] = useState<number[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  
  const [noteStats, setNoteStats] = useState<Record<string, { clef: string, midi: number, name: string, correct: number, incorrect: number }>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [questTab, setQuestTab] = useState<'treble' | 'bass'>('treble');
  const [hasMadeMistakeOnCurrent, setHasMadeMistakeOnCurrent] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const [questProgress, setQuestProgress] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('virtuoso-quest-progress');
    return saved ? JSON.parse(saved) : {};
  });

  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const { pitch, error: micError } = usePitchDetector(isPlaying && settings.inputMode === 'mic' && isMicEnabled);
  const [detectedMidi, setDetectedMidi] = useState<number | null>(null);
  const [lastProcessedMidi, setLastProcessedMidi] = useState<number | null>(null);
  const waitingForMicReleaseRef = React.useRef(false);

  useEffect(() => {
    if (pitch) {
      const midi = Math.round(69 + 12 * Math.log2(pitch / 440));
      setDetectedMidi(midi);
    } else {
      setDetectedMidi(null);
    }
  }, [pitch]);

  useEffect(() => {
    localStorage.setItem('virtuoso-quest-progress', JSON.stringify(questProgress));
  }, [questProgress]);

  const incrementProgress = useCallback((count: number = 1) => {
    setQuestProgress(prev => {
      const key = `${settings.clef}-${settings.keyRoot}-${settings.keyType}`;
      const current = prev[key] || 0;
      return { ...prev, [key]: current + count };
    });
  }, [settings.clef, settings.keyRoot, settings.keyType]);

  // --- Actions ---

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const startGame = async (overrideSettings?: GameSettings) => {
    setIsLoading(true);
    const activeSettings = overrideSettings || settings;
    try {
      await audioService.init();
      const newItems = generateExercise(activeSettings);
      setExerciseItems(newItems);
      setCursorIndex(0);
      setSelectedChordNotes([]);
      setFeedbackMessage(null);
      setHasMadeMistakeOnCurrent(false);
      setIsPlaying(true);
      waitingForMicReleaseRef.current = false;
      if (activeSettings.inputMode === 'mic') {
        setIsMicEnabled(true);
      }
    } catch (error) {
      console.error("Failed to initialize audio:", error);
      setFeedbackMessage("Error loading sounds. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const nextTurn = () => {
    // Generate new set without stopping
    const newItems = generateExercise(settings);
    setExerciseItems(newItems);
    setCursorIndex(0);
    setSelectedChordNotes([]);
    setFeedbackMessage(null);
    setHasMadeMistakeOnCurrent(false);
  };

  const stopGame = () => {
    setIsPlaying(false);
    setExerciseItems([]);
    
    // Check if there are any stats to show
    const hasStats = Object.values(noteStats).some(stat => stat.incorrect > 0 || stat.correct > 0);
    if (hasStats) {
      setShowSummary(true);
    } else {
      setSettings(prev => ({ ...prev, restrictedNotes: undefined }));
    }
  };

  // --- Core Game Logic ---

  const handlePianoInput = (midi: number) => {
    if (!isPlaying) return;
    if (cursorIndex >= exerciseItems.length) return;

    const currentItem = exerciseItems[cursorIndex];

    if (settings.mode === 'single' || settings.mode === 'beams') {
      // Immediate evaluation
      const targetMidi = currentItem.notes[0].midi;
      const statKey = `${settings.clef}-${targetMidi}`;
      const noteName = `${currentItem.notes[0].name}${currentItem.notes[0].octave}`;
      
      if (midi === targetMidi) {
        // Correct
        if (!hasMadeMistakeOnCurrent && !settings.restrictedNotes) {
          incrementProgress(1);
        }
        
        setNoteStats(prev => {
           const existing = prev[statKey] || { clef: settings.clef, midi: targetMidi, name: noteName, correct: 0, incorrect: 0 };
           return { ...prev, [statKey]: { ...existing, correct: existing.correct + 1 } };
        });

        const updatedItems = [...exerciseItems];
        updatedItems[cursorIndex].status = 'correct';
        setExerciseItems(updatedItems);
        
        // Advance
        if (settings.inputMode === 'mic') {
          waitingForMicReleaseRef.current = true;
        } else {
          if (cursorIndex + 1 < exerciseItems.length) {
            setCursorIndex(prev => prev + 1);
            setHasMadeMistakeOnCurrent(false);
          } else {
            // End of turn, slight delay then next
            setTimeout(() => nextTurn(), 500);
          }
        }
      } else {
        // Incorrect
        setHasMadeMistakeOnCurrent(true);
        setNoteStats(prev => {
           const existing = prev[statKey] || { clef: settings.clef, midi: targetMidi, name: noteName, correct: 0, incorrect: 0 };
           return { ...prev, [statKey]: { ...existing, incorrect: existing.incorrect + 1 } };
        });

        // Visual feedback?
        setFeedbackMessage('Try again!');
        setTimeout(() => setFeedbackMessage(null), 1000);
      }
    } else if (settings.mode === 'chords') {
      // Toggle selection
      setSelectedChordNotes(prev => {
        if (prev.includes(midi)) return prev.filter(n => n !== midi);
        return [...prev, midi];
      });
    }
  };

  useEffect(() => {
    if (isPlaying && settings.inputMode === 'mic') {
      if (detectedMidi !== null && detectedMidi !== lastProcessedMidi) {
        if (!waitingForMicReleaseRef.current) {
          handlePianoInput(detectedMidi);
        }
        setLastProcessedMidi(detectedMidi);
      } else if (detectedMidi === null && lastProcessedMidi !== null) {
        setLastProcessedMidi(null);
        if (waitingForMicReleaseRef.current) {
          waitingForMicReleaseRef.current = false;
          if (cursorIndex + 1 < exerciseItems.length) {
            setCursorIndex(prev => prev + 1);
            setHasMadeMistakeOnCurrent(false);
          } else {
            setTimeout(() => nextTurn(), 500);
          }
        }
      }
    }
  }, [detectedMidi, isPlaying, settings.inputMode, lastProcessedMidi]);

  const submitChord = () => {
    if (cursorIndex >= exerciseItems.length) return;
    const currentItem = exerciseItems[cursorIndex];
    const targetMidis = currentItem.notes.map(n => n.midi).sort();
    const selectedSorted = [...selectedChordNotes].sort();
    
    // Compare arrays
    const isCorrect = JSON.stringify(targetMidis) === JSON.stringify(selectedSorted);
    
    if (isCorrect) {
       if (!hasMadeMistakeOnCurrent && !settings.restrictedNotes) {
         incrementProgress(currentItem.notes.length);
       }
       // Play the full chord sound on success
       audioService.playChord(targetMidis, '2n');

       // Track correct for all notes in the chord
       setNoteStats(prev => {
         const next = { ...prev };
         currentItem.notes.forEach(note => {
           const statKey = `${settings.clef}-${note.midi}`;
           const noteName = `${note.name}${note.octave}`;
           const existing = next[statKey] || { clef: settings.clef, midi: note.midi, name: noteName, correct: 0, incorrect: 0 };
           next[statKey] = { ...existing, correct: existing.correct + 1 };
         });
         return next;
       });

       const updatedItems = [...exerciseItems];
       updatedItems[cursorIndex].status = 'correct';
       setExerciseItems(updatedItems);
       setSelectedChordNotes([]);
       
       if (cursorIndex + 1 < exerciseItems.length) {
         setCursorIndex(prev => prev + 1);
         setHasMadeMistakeOnCurrent(false);
       } else {
         setTimeout(() => nextTurn(), 500);
       }
    } else {
      setHasMadeMistakeOnCurrent(true);
      // Track incorrect for all notes in the chord
      setNoteStats(prev => {
         const next = { ...prev };
         currentItem.notes.forEach(note => {
           const statKey = `${settings.clef}-${note.midi}`;
           const noteName = `${note.name}${note.octave}`;
           const existing = next[statKey] || { clef: settings.clef, midi: note.midi, name: noteName, correct: 0, incorrect: 0 };
           next[statKey] = { ...existing, incorrect: existing.incorrect + 1 };
         });
         return next;
      });

      setFeedbackMessage('Incorrect chord notes.');
      setTimeout(() => setFeedbackMessage(null), 1000);
    }
  };

  // --- Render ---
  
  // Grouped keys for better UI
  const naturalKeys: KeyRoot[] = ['C', 'F', 'G', 'D', 'A', 'E', 'B'];
  const sharpKeys: KeyRoot[] = ['F#', 'C#']; // Common sharp keys
  const flatKeys: KeyRoot[] = ['Bb', 'Eb', 'Ab', 'Db', 'Gb'];

  const getTopInaccurateNotes = () => {
    return Object.values(noteStats)
      .map(stat => {
        const total = stat.correct + stat.incorrect;
        const inaccuracy = total > 0 ? stat.incorrect / total : 0;
        return { ...stat, inaccuracy, total };
      })
      .filter(stat => stat.inaccuracy > 0)
      .sort((a, b) => b.inaccuracy - a.inaccuracy || b.total - a.total)
      .slice(0, 5);
  };

  const quitToMenu = () => {
    setShowSummary(false);
    setNoteStats({});
    setSettings(prev => ({ ...prev, restrictedNotes: undefined }));
  };

  const practiceExtra = () => {
    const topInaccurate = getTopInaccurateNotes();
    const restrictedMidis = topInaccurate.map(stat => stat.midi);
    const newSettings: GameSettings = { 
      ...settings, 
      mode: 'single', // Force single mode for extra practice to ensure we only generate these specific notes
      restrictedNotes: restrictedMidis 
    };
    setSettings(newSettings);
    setShowSummary(false);
    setNoteStats({});
    startGame(newSettings);
  };

  return (
    <div className={isDarkMode ? 'dark h-full w-full' : 'h-full w-full'}>
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
        
        {/* Absolute Controls */}
        {isPlaying && !showSummary && (
          <div className="fixed top-4 left-4 z-50">
            <button 
              onClick={stopGame}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-full transition-colors shadow-sm"
            >
              <RotateCcw className="w-4 h-4" /> Quit
            </button>
          </div>
        )}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center relative p-4 overflow-y-auto">
          
          {showSummary ? (
            <div className="w-full max-w-xl bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors mt-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2 text-slate-800 dark:text-slate-200">Practice Summary</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Here are the notes you struggled with the most.</p>
              </div>
              
              <div className="space-y-4 mb-8">
                {getTopInaccurateNotes().length > 0 ? (
                  getTopInaccurateNotes().map((stat, idx) => (
                    <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-semibold w-8 text-center">{stat.name}</span>
                        <span className="text-xs uppercase tracking-wider text-slate-400">{stat.clef}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-medium text-red-500 dark:text-red-400">
                          {Math.round(stat.inaccuracy * 100)}% Inaccurate
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {stat.incorrect} missed / {stat.total} total
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-6 text-slate-500 dark:text-slate-400">
                    Perfect! You didn't miss any notes.
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={quitToMenu}
                  className="flex-1 py-3 px-4 rounded-xl font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                >
                  Quit to Menu
                </button>
                {getTopInaccurateNotes().length > 0 && (
                  <button
                    onClick={practiceExtra}
                    className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all"
                  >
                    Practice Extra
                  </button>
                )}
              </div>
            </div>
          ) : showQuests ? (
            // Quest Menu
            <div className="w-full max-w-3xl bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors mt-8">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <Trophy className="w-8 h-8 text-indigo-500" />
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Quests</h2>
                </div>
                <div className="flex gap-2">
                  {confirmReset ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-red-500 font-medium">Are you sure?</span>
                      <button 
                        onClick={() => {
                          setQuestProgress({});
                          localStorage.removeItem('virtuoso-quest-progress');
                          setConfirmReset(false);
                        }}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                      >
                        Yes, Reset
                      </button>
                      <button 
                        onClick={() => setConfirmReset(false)}
                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmReset(true)}
                      className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    >
                      Reset Progress
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setShowQuests(false);
                      setConfirmReset(false);
                    }} 
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    Back to Menu
                  </button>
                </div>
              </div>
              
              <div className="flex gap-2 mb-6">
                <button 
                  onClick={() => setQuestTab('treble')} 
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${questTab === 'treble' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                >
                  Treble Clef
                </button>
                <button 
                  onClick={() => setQuestTab('bass')} 
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${questTab === 'bass' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                >
                  Bass Clef
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                {[...naturalKeys, ...flatKeys, ...sharpKeys].map(k => {
                  const majorKey = `${questTab}-${k}-major`;
                  const minorKey = `${questTab}-${k}-minor`;
                  const majorProgress = questProgress[majorKey] || 0;
                  const minorProgress = questProgress[minorKey] || 0;
                  const target = 400;
                  
                  return (
                    <div key={k} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="font-bold text-lg mb-3 text-slate-800 dark:text-slate-200">{k}</div>
                      
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Major</span>
                            <span className={`font-bold ${majorProgress >= target ? 'text-green-500 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'}`}>
                              {Math.min(majorProgress, target)} / {target}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${majorProgress >= target ? 'bg-green-500' : 'bg-indigo-500'}`} 
                              style={{ width: `${Math.min((majorProgress / target) * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Minor</span>
                            <span className={`font-bold ${minorProgress >= target ? 'text-green-500 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'}`}>
                              {Math.min(minorProgress, target)} / {target}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${minorProgress >= target ? 'bg-green-500' : 'bg-indigo-500'}`} 
                              style={{ width: `${Math.min((minorProgress / target) * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !isPlaying ? (
            // Menu Screen
            <div className="w-full max-w-4xl bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors mt-8">
               <div className="flex items-center justify-center gap-3 mb-6">
                 <div className="p-2 bg-indigo-500 rounded-lg">
                   <Music className="w-8 h-8 text-white" />
                 </div>
                 <h1 className="text-3xl font-bold tracking-wide text-slate-900 dark:text-white">Virtuoso <span className="text-indigo-500 dark:text-indigo-400 font-light">Sight Reader</span></h1>
               </div>
               <div className="mb-8 text-center relative">
                 <h2 className="text-xl font-semibold mb-2 text-slate-800 dark:text-slate-200">Configuration</h2>
                 <p className="text-slate-500 dark:text-slate-400 text-sm">Customize your practice session</p>
                 <button
                   onClick={() => setShowQuests(true)}
                   className="absolute right-0 top-0 p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors flex items-center gap-2"
                 >
                   <Trophy className="w-5 h-5" />
                   <span className="text-sm font-medium hidden sm:inline">Quests</span>
                 </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-6">
                    {/* Input Mode Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Input Mode</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, inputMode: 'keyboard' }))}
                          className={`py-2 px-4 rounded-lg text-sm font-medium transition-all border ${
                            (!settings.inputMode || settings.inputMode === 'keyboard')
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                              : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          Virtual Keyboard
                        </button>
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, inputMode: 'mic', mode: prev.mode === 'chords' ? 'single' : prev.mode }))}
                          className={`py-2 px-4 rounded-lg text-sm font-medium transition-all border ${
                            settings.inputMode === 'mic' 
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                              : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          Instrument (Mic)
                        </button>
                      </div>
                    </div>

                    {/* Mode Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mode</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['single', 'chords', 'beams'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => setSettings(prev => ({ ...prev, mode: m }))}
                            disabled={settings.inputMode === 'mic' && m === 'chords'}
                            className={`py-2 px-4 rounded-lg text-sm font-medium transition-all capitalize border ${
                              settings.mode === m 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                                : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes per Round */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Notes per Round</label>
                      <div className="grid grid-cols-4 gap-2">
                        {([4, 8, 12, 16]).map(count => (
                          <button
                            key={count}
                            onClick={() => setSettings(prev => ({ ...prev, noteCount: count }))}
                            className={`py-2 px-4 rounded-lg text-sm font-medium transition-all border ${
                              settings.noteCount === count 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                                : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Clef Selection */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clef</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSettings(prev => ({ ...prev, clef: 'treble' }))}
                            className={`py-2 px-2 rounded-lg text-sm font-medium transition-all border flex justify-center items-center ${
                              settings.clef === 'treble' 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                                : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            Treble 🎼
                          </button>
                          <button
                            onClick={() => setSettings(prev => ({ ...prev, clef: 'bass' }))}
                            className={`py-2 px-2 rounded-lg text-sm font-medium transition-all border flex justify-center items-center ${
                              settings.clef === 'bass' 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                                : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            Bass 𝄢
                          </button>
                        </div>
                      </div>

                      {/* Accidentals */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Options</label>
                         <div 
                           onClick={() => setSettings(prev => ({ ...prev, useAccidentals: !prev.useAccidentals }))}
                           className="cursor-pointer flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-650 transition-colors h-[42px]"
                         >
                          <span className="text-xs font-medium pl-1 text-slate-700 dark:text-slate-200">Chromatics</span>
                          <div className={`w-8 h-4 rounded-full relative transition-colors ${settings.useAccidentals ? 'bg-indigo-500' : 'bg-slate-400 dark:bg-slate-500'}`}>
                             <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${settings.useAccidentals ? 'left-4.5' : 'left-0.5'}`} style={{ left: settings.useAccidentals ? '18px' : '2px' }}/>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 leading-tight px-1">
                            {settings.useAccidentals ? "Allows notes outside the key signature." : "Strictly notes within key signature."}
                        </div>
                      </div>
                    </div>

                    {/* Ledger Lines */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Max Ledger Lines</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>Up</span>
                            <span className="font-mono">{settings.maxLedgerLinesUp === undefined ? 'Auto' : settings.maxLedgerLinesUp}</span>
                          </div>
                          <input 
                            type="range" 
                            min="-1" 
                            max="4" 
                            value={settings.maxLedgerLinesUp === undefined ? -1 : settings.maxLedgerLinesUp}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setSettings(prev => ({ ...prev, maxLedgerLinesUp: val === -1 ? undefined : val }));
                            }}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>Down</span>
                            <span className="font-mono">{settings.maxLedgerLinesDown === undefined ? 'Auto' : settings.maxLedgerLinesDown}</span>
                          </div>
                          <input 
                            type="range" 
                            min="-1" 
                            max="4" 
                            value={settings.maxLedgerLinesDown === undefined ? -1 : settings.maxLedgerLinesDown}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setSettings(prev => ({ ...prev, maxLedgerLinesDown: val === -1 ? undefined : val }));
                            }}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                 </div>

                 <div className="space-y-6 flex flex-col">
                    {/* Key Signature Selection */}
                    <div className="space-y-2 flex-grow">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Key Signature</label>
                      <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3 h-full">
                        
                        {/* Key Types */}
                        <div className="flex gap-2 mb-2">
                          {(['major', 'minor'] as const).map(type => (
                             <button
                               key={type}
                               onClick={() => setSettings(prev => ({ ...prev, keyType: type }))}
                               className={`flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all border ${
                                 settings.keyType === type
                                   ? 'bg-indigo-500/80 border-indigo-400 text-white'
                                   : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                               }`}
                             >
                               {type}
                             </button>
                          ))}
                        </div>

                        {/* Key Grid */}
                        <div className="flex flex-wrap gap-1.5 justify-center">
                            {naturalKeys.map(k => (
                               <KeyButton key={k} k={k} selected={settings.keyRoot === k} onClick={() => setSettings(prev => ({...prev, keyRoot: k}))} />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                            {flatKeys.map(k => (
                               <KeyButton key={k} k={k} selected={settings.keyRoot === k} onClick={() => setSettings(prev => ({...prev, keyRoot: k}))} />
                            ))}
                        </div>
                         <div className="flex flex-wrap gap-1.5 justify-center">
                            {sharpKeys.map(k => (
                               <KeyButton key={k} k={k} selected={settings.keyRoot === k} onClick={() => setSettings(prev => ({...prev, keyRoot: k}))} />
                            ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => startGame()}
                      disabled={isLoading}
                      className={`w-full py-4 mt-auto bg-green-600 hover:bg-green-500 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-wait text-white font-bold rounded-xl shadow-lg shadow-green-900/20 transition-all transform active:scale-95 flex items-center justify-center gap-2`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Loading Sounds...
                        </>
                      ) : (
                        <>
                          <Play className="w-5 h-5 fill-current" /> Start Practice
                        </>
                      )}
                    </button>
                    {feedbackMessage && <p className="text-red-500 dark:text-red-400 text-center text-sm">{feedbackMessage}</p>}
                 </div>
               </div>
            </div>
          ) : (
            // Game Screen
            <div className="w-full max-w-[95vw] flex flex-col gap-2 sm:gap-6 animate-in fade-in zoom-in duration-300">
              
              {/* Sheet Music Area */}
              <div className="relative">
                 <div className="absolute top-2 right-4 flex flex-col items-end gap-2 z-10">
                   <div className="bg-slate-100 dark:bg-slate-800/80 px-3 py-1 rounded-full text-xs font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm">
                      {settings.keyRoot} {settings.keyType} | {settings.mode}
                   </div>
                   <div className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm border ${
                     (questProgress[`${settings.clef}-${settings.keyRoot}-${settings.keyType}`] || 0) >= 400
                       ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/50'
                       : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50'
                   }`}>
                      Progress: {questProgress[`${settings.clef}-${settings.keyRoot}-${settings.keyType}`] || 0} / 400
                   </div>
                 </div>
                 
                 <SheetMusic 
                   items={exerciseItems} 
                   clef={settings.clef} 
                   activeIndex={cursorIndex}
                   keyRoot={settings.keyRoot}
                   keyType={settings.keyType}
                 />
                 
                 {feedbackMessage && (
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 dark:bg-slate-900/90 text-white px-6 py-3 rounded-full font-bold backdrop-blur-sm border border-slate-700 animate-bounce z-20">
                     {feedbackMessage}
                   </div>
                 )}
              </div>

              {/* Controls for Chord Mode */}
              {settings.mode === 'chords' && (!settings.inputMode || settings.inputMode === 'keyboard') && (
                <div className="flex justify-center">
                   <button 
                     onClick={submitChord}
                     className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                   >
                     <Check className="w-5 h-5" /> Submit Chord
                   </button>
                </div>
              )}

              {/* Piano */}
              {(!settings.inputMode || settings.inputMode === 'keyboard') && (
                <div className="px-4">
                   <Piano 
                     onNotePlay={handlePianoInput}
                     selectedNotes={selectedChordNotes}
                     activeNotes={[]} 
                     isDarkMode={isDarkMode}
                   />
                </div>
              )}

              {/* Mic Status */}
              {settings.inputMode === 'mic' && (
                <div className="flex flex-col items-center gap-4 mt-4">
                  <button 
                    onClick={() => setIsMicEnabled(!isMicEnabled)}
                    className={`px-6 py-2 rounded-full font-bold text-sm transition-all shadow-sm ${
                      isMicEnabled 
                        ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/50' 
                        : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50'
                    }`}
                  >
                    {isMicEnabled ? 'Disable Microphone' : 'Enable Microphone'}
                  </button>
                  
                  {isMicEnabled && (
                    micError ? (
                      <div className="text-red-500 text-sm font-medium bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800/50">{micError}</div>
                    ) : (
                      <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800/50">
                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-sm font-medium">Listening to microphone...</span>
                        {detectedMidi && (
                          <span className="text-xs ml-2 text-slate-500 dark:text-slate-400 font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">MIDI: {detectedMidi}</span>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
              
              <div className="text-center text-slate-500 dark:text-slate-500 text-xs mt-2">
                {settings.inputMode === 'mic' 
                  ? "Sing or play the highlighted note into your microphone."
                  : settings.mode === 'chords' 
                    ? "Select all notes in the chord and press Submit." 
                    : "Play the highlighted note on the keyboard."}
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const KeyButton: React.FC<{k: KeyRoot, selected: boolean, onClick: () => void}> = ({k, selected, onClick}) => (
    <button
        onClick={onClick}
        className={`w-9 h-9 rounded-lg text-xs font-bold transition-all border ${
        selected
            ? 'bg-indigo-500 border-indigo-400 text-white shadow-md'
            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
        }`}
    >
        {k}
    </button>
);

export default App;
