import { useState, useEffect, useRef } from 'react';
import { YIN } from 'pitchfinder';

export function usePitchDetector(isActive: boolean) {
  const [pitch, setPitch] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      stopDetection();
      return;
    }

    let isMounted = true;
    setError(null);

    const startDetection = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) return;
        
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioContextRef.current = audioCtx;
        streamRef.current = stream;
        
        const analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 2048;
        analyzerRef.current = analyzer;
        
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyzer);

        const detectPitch = YIN({ sampleRate: audioCtx.sampleRate });
        const dataArray = new Float32Array(analyzer.fftSize);
        
        // Stabilization variables
        let stablePitch: number | null = null;
        let pitchHistory: (number | null)[] = [];
        const historySize = 2; // Require ~2 frames of similar pitch for faster detection

        const updatePitch = () => {
          if (!analyzerRef.current) return;
          analyzerRef.current.getFloatTimeDomainData(dataArray);
          const detectedPitch = detectPitch(dataArray);
          
          let currentMidi: number | null = null;
          if (detectedPitch && detectedPitch > 50 && detectedPitch < 4000) {
            currentMidi = Math.round(69 + 12 * Math.log2(detectedPitch / 440));
          }
          
          pitchHistory.push(currentMidi);
          if (pitchHistory.length > historySize) {
            pitchHistory.shift();
          }
          
          // Check if all recent pitches are the same MIDI note
          const allSame = pitchHistory.length === historySize && pitchHistory.every(p => p !== null && p === pitchHistory[0]);
          
          if (allSame) {
            if (stablePitch !== pitchHistory[0]) {
              stablePitch = pitchHistory[0];
              // We return the actual frequency of the latest frame, but only if the MIDI note is stable
              setPitch(detectedPitch);
            }
          } else if (pitchHistory.filter(p => p === null).length >= 2) {
            if (stablePitch !== null) {
              stablePitch = null;
              setPitch(null);
            }
          }
          
          requestRef.current = requestAnimationFrame(updatePitch);
        };

        updatePitch();
      } catch (err) {
        console.error('Error accessing microphone:', err);
        if (isMounted) {
          setError('Could not access microphone. Please ensure you have granted permission.');
        }
      }
    };

    startDetection();

    return () => {
      isMounted = false;
      stopDetection();
    };
  }, [isActive]);

  const stopDetection = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyzerRef.current = null;
    setPitch(null);
  };

  return { pitch, error };
}
