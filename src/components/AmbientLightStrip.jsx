import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioLines, Play, AlertCircle, Square, Sparkles } from 'lucide-react';

export default function AmbientLightStrip({ color = '#38bdf8', enabled = true, idle = false }) {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationIdRef = useRef(null);

  const [mode, setMode] = useState('idle'); // Modes: idle, live audio, or simulated audio.
  const [error, setError] = useState(null);

  // Match the canvas backing store to its displayed size and device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  // Draw live frequency data or a generated waveform until the mode changes.
  const visualize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let simPhase = 0;

    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      let bufferLength = 32;
      let values = [];

      if (mode === 'real' && analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        bufferLength = dataArrayRef.current.length;
        values = Array.from(dataArrayRef.current);
      } else if (mode === 'simulated') {
        simPhase += 0.05;
        for (let i = 0; i < bufferLength; i++) {
          const noise = Math.sin(simPhase + i * 0.3) * 0.4 + Math.cos(simPhase * 0.7 + i * 0.2) * 0.4 + 0.5;
          values.push(Math.min(255, Math.max(20, noise * 255)));
        }
      } else {
        return;
      }

      const barWidth = (width / bufferLength) * 1.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const value = values[i];
        const barHeight = (value / 255) * height * 0.85;

        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.save();
        ctx.fillStyle = gradient;

        const radius = Math.min(barWidth / 2, 4);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight, barWidth - 2, barHeight, [radius, radius, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
        }

        if (value > 10) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = value / 255;
          ctx.fillRect(x, height - barHeight, barWidth - 2, 2);
        }

        ctx.restore();
        x += barWidth;
      }
    };

    draw();
  }, [color, mode]);

  useEffect(() => {
    if (mode !== 'idle') {
      visualize();
    }
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    };
  }, [mode, visualize]);

  // Screen-audio capture is available only in secure browser contexts.
  const startSystemAudioCapture = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      setError(null);

      // Fail early when the browser does not expose the screen-capture API.
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Requires HTTPS or localhost server environment.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        systemAudio: 'include',
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Share audio option was unchecked.');
      }

      stream.getVideoTracks().forEach((track) => track.stop());
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      audioTracks[0].onended = () => stopAudioCapture();

      setMode('real');
    } catch (err) {
      console.warn('Audio capture error/canceled:', err);
      setError(err instanceof Error ? err.message : 'Audio access denied');
      // Keep the visualizer available when capture is denied or unavailable.
      setMode('simulated');
    }
  };

  const stopAudioCapture = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setMode('idle');
  };

  useEffect(() => {
    return () => stopAudioCapture();
  }, []);

  if (!enabled) return null;

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-2xl h-16 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] overflow-hidden flex items-center px-4 transition-all duration-300 pointer-events-auto ${idle && mode === 'idle' ? 'ambient-strip-idle-hidden' : ''}`}>
      
      {/* Keep the canvas decorative so the controls beneath it remain interactive. */}
      <canvas
        ref={canvasRef}
        className="h-full w-full block transition-opacity duration-500 pointer-events-none"
        style={{ opacity: mode !== 'idle' ? 1 : 0.1 }}
      />

      {/* Offer capture controls while no audio source is active. */}
      {mode === 'idle' && (
        <div className="absolute inset-0 z-10 flex items-center justify-between px-5 bg-black/40 backdrop-blur-md pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 border border-white/10 text-white/90">
              {error ? (
                <AlertCircle className="h-4 w-4 text-amber-400" />
              ) : (
                <AudioLines className="h-4 w-4" />
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-white tracking-wide">
                Ambient Sound Sync
              </span>
              <span className="text-[11px] text-white/60 max-w-55 truncate">
                {error || 'Sync with YouTube Music or desktop tabs'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setMode('simulated');
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-xs font-medium hover:bg-white/20 active:scale-95 transition-all cursor-pointer z-20"
            >
              <Sparkles className="h-3 w-3" />
              Simulate
            </button>

            <button
              type="button"
              onClick={startSystemAudioCapture}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-white/90 active:scale-95 transition-all shadow-md cursor-pointer z-20"
            >
              <Play className="h-3 w-3 fill-black" />
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Show the active source controls and capture status. */}
      {mode !== 'idle' && (
        <div className="absolute top-2.5 right-3 z-10 flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md">
            <span
              className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                mode === 'real' ? 'bg-emerald-400' : 'bg-sky-400'
              }`}
            />
            <span className="text-[10px] font-medium text-white/80">
              {mode === 'real' ? 'Live Audio' : 'Ambient Wave'}
            </span>
          </div>

          <button
            type="button"
            onClick={stopAudioCapture}
            title="Stop Sync"
            className="p-1 rounded-full bg-white/10 border border-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-all cursor-pointer z-20"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        </div>
      )}
    </div>
  );
}