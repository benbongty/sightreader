declare module 'pitchfinder' {
  export function YIN(config?: { sampleRate?: number; threshold?: number }): (float32AudioBuffer: Float32Array) => number | null;
  export function AMDF(config?: { sampleRate?: number; minFrequency?: number; maxFrequency?: number }): (float32AudioBuffer: Float32Array) => number | null;
  export function MacLeod(config?: { sampleRate?: number }): (float32AudioBuffer: Float32Array) => number | null;
}
