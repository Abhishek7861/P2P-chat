import { useEffect } from 'react';

// Ring sounds made with Web Audio, so there's no audio file to ship.
// 'incoming' is a double ring every 3 s; 'outgoing' is a quieter ringback tone every 4 s.
// Browsers may block sound until the user has clicked something on the page; then it stays silent.
export function useRingtone(kind: 'incoming' | 'outgoing' | null) {
  useEffect(() => {
    if (!kind) return;
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});

    const tone = (start: number, length: number, volume: number) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.02);
      gain.gain.setValueAtTime(volume, start + length - 0.05);
      gain.gain.linearRampToValueAtTime(0, start + length);
      gain.connect(ctx.destination);
      for (const freq of [440, 480]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + length);
      }
    };

    const ring = () => {
      const t = ctx.currentTime + 0.05;
      if (kind === 'incoming') {
        tone(t, 0.4, 0.18);
        tone(t + 0.6, 0.4, 0.18);
      } else {
        tone(t, 1.5, 0.06);
      }
    };

    ring();
    const timer = window.setInterval(ring, kind === 'incoming' ? 3000 : 4000);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [kind]);
}
