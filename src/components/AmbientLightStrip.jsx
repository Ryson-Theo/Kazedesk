import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, AudioLines, Play, Sparkles, X } from 'lucide-react';
import MinimizedWidgetDock from './MinimizedWidgetDock';

export default function AmbientLightStrip({
  color = '#b6d2ad',
  enabled = true,
  idle = false,
  dockItems = [],
  dockStyle = 'icons',
}) {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationIdRef = useRef(null);
  const smoothedLevelsRef = useRef([]);
  const stopControlTimerRef = useRef(null);

  const [mode, setMode] = useState('idle');
  const [error, setError] = useState('');
  const [stopControlVisible, setStopControlVisible] = useState(false);
  const canConnect = typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getDisplayMedia)
    && Boolean(window.AudioContext || window.webkitAudioContext)
    && !window.matchMedia('(max-width: 767px)').matches
    && !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const context = canvas.getContext('2d');
      context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    resizeCanvas();
    return () => observer.disconnect();
  }, []);

  const visualize = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    let phase = 0;
    let lastFrameTime = 0;
    let frameCount = 0;
    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);
      frameCount += 1;
      if (frameCount % 2 !== 0) return;

      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      context.clearRect(0, 0, width, height);

      const barCount = Math.max(36, Math.min(112, Math.floor(width / 7)));
      let levels = [];
      if (mode === 'real' && analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        const spectrum = dataArrayRef.current;
        let peak = 0.16;
        for (let index = 0; index < spectrum.length; index += 1) {
          peak = Math.max(peak, spectrum[index] / 255);
        }
        levels = Array.from({ length: barCount }, (_, index) => {
          const progress = index / Math.max(1, barCount - 1);
          const binPosition = Math.expm1(progress * Math.log(spectrum.length));
          const lowBin = Math.max(0, Math.floor(binPosition));
          const highBin = Math.min(spectrum.length - 1, lowBin + 1);
          const fraction = binPosition - lowBin;
          const energy = ((spectrum[lowBin] * (1 - fraction)) + (spectrum[highBin] * fraction)) / 255;
          const floor = peak * 0.1;
          const relativeEnergy = Math.max(0, (energy - floor) / (peak - floor));
          return 0.035 + Math.pow(relativeEnergy, 0.72) * Math.min(0.9, 0.55 + peak * 0.6);
        });
      } else if (mode === 'simulated') {
        const now = performance.now();
        phase += Math.min(0.05, (now - (lastFrameTime || now)) / 1000);
        lastFrameTime = now;
        const beatDuration = 60 / 84;
        const beatPhase = (phase % beatDuration) / beatDuration;
        const offbeatPhase = ((phase + beatDuration * 0.5) % beatDuration) / beatDuration;
        const beatKick = Math.exp(-beatPhase * 8);
        const offbeat = Math.exp(-offbeatPhase * 12);
        levels = Array.from({ length: barCount }, (_, index) => {
          const progress = index / Math.max(1, barCount - 1);
          const slowPhrase = Math.sin(phase * 0.52 + progress * 13 + Math.sin(progress * 29 + phase * 0.17) * 0.72);
          const midPhrase = Math.sin(phase * 0.86 - progress * 31 + Math.sin(phase * 0.31 + progress * 5) * 0.55);
          const highPhrase = Math.sin(phase * 0.42 + progress * 47 + Math.sin(progress * 17 - phase * 0.13));
          const contour = 0.22 + slowPhrase * 0.24 + midPhrase * 0.17 + highPhrase * 0.1;
          const bassWeight = Math.exp(-progress * 1.8);
          const beat = beatKick * bassWeight * (0.12 + 0.2 * Math.max(0, slowPhrase));
          const offbeatAccent = offbeat * (0.035 + progress * 0.08)
            * (0.25 + Math.max(0, Math.sin(phase * 6.8 + progress * 23)) * 0.75);
          const melody = Math.max(0, contour) * (0.72 + Math.max(0, midPhrase) * 0.18);
          const texture = Math.max(0, Math.sin(phase * 2.1 + progress * 37)) * 0.1;
          return Math.min(0.96, 0.04 + beat + offbeatAccent + melody + texture);
        });
      } else {
        return;
      }

      const previousLevels = smoothedLevelsRef.current;
      const nextLevels = Array.from({ length: barCount }, (_, index) => {
        const rawLevel = levels[index];
        const smoothed = previousLevels[index] === undefined
          ? rawLevel
          : previousLevels[index] + (rawLevel - previousLevels[index]) * (rawLevel > previousLevels[index] ? 0.34 : 0.14);
        return Math.max(0.045, Math.min(0.96, smoothed));
      });

      const slotWidth = width / barCount;
      const barWidth = Math.min(9, slotWidth * 0.88);
      const segmentGap = 1;
      const segmentHeight = Math.max(1.7, Math.min(2.5, (height - 6) / 15));
      const segmentStep = segmentHeight + segmentGap;
      const maxSegments = Math.max(1, Math.floor((height - 4) / segmentStep));
      const baseline = height - 2;
      const gradient = context.createLinearGradient(0, baseline, 0, 2);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
      gradient.addColorStop(0.62, color);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
      context.fillStyle = gradient;
      context.shadowColor = color;
      context.shadowBlur = 3;
      context.beginPath();
      for (let index = 0; index < nextLevels.length; index += 1) {
        const level = nextLevels[index];
        const activeSegments = Math.max(1, Math.round(level * maxSegments));
        const x = index * slotWidth + (slotWidth - barWidth) / 2;
        for (let segment = 0; segment < activeSegments; segment += 1) {
          const y = baseline - segmentHeight - segment * segmentStep;
          if (typeof context.roundRect === 'function') {
            context.roundRect(x, y, barWidth, segmentHeight, Math.min(1.2, segmentHeight / 2));
          } else {
            context.rect(x, y, barWidth, segmentHeight);
          }
        }
      }
      context.fill();
      context.shadowBlur = 0;
      smoothedLevelsRef.current = nextLevels;
    };

    draw();
  }, [color, mode]);

  useEffect(() => {
    if (mode !== 'idle') visualize();
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    };
  }, [mode, visualize]);

  const revealStopControl = useCallback(() => {
    if (mode === 'idle') return;
    setStopControlVisible(true);
    clearTimeout(stopControlTimerRef.current);
    stopControlTimerRef.current = setTimeout(() => setStopControlVisible(false), 2600);
  }, [mode]);

  useEffect(() => {
    if (mode === 'idle') {
      setStopControlVisible(false);
      clearTimeout(stopControlTimerRef.current);
      return undefined;
    }

    revealStopControl();
    const hideOnOutsideClick = (event) => {
      if (!event.target.closest('.ambient-strip')) setStopControlVisible(false);
    };
    document.addEventListener('pointerdown', hideOnOutsideClick);
    return () => {
      clearTimeout(stopControlTimerRef.current);
      document.removeEventListener('pointerdown', hideOnOutsideClick);
    };
  }, [mode, revealStopControl]);

  const stopAudioCapture = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    animationIdRef.current = null;
    clearTimeout(stopControlTimerRef.current);
    setStopControlVisible(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    setMode('idle');
  };

  const startSystemAudioCapture = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setError('');

    if (!window.isSecureContext) {
      setError('Audio capture needs HTTPS or localhost.');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('This mobile browser cannot share system audio. Try Simulate or connect from desktop.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
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
      if (!audioTracks.length) {
        stream.getTracks().forEach((track) => track.stop());
        setError('No shared audio was provided. Enable “Share tab audio” or “Share system audio”.');
        return;
      }

      stream.getVideoTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Audio visualization is not supported by this browser.');

      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      audioTracks[0].addEventListener('ended', stopAudioCapture, { once: true });
      setMode('real');
    } catch (captureError) {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
      const isCancel = captureError instanceof DOMException
        && ['AbortError', 'NotAllowedError'].includes(captureError.name);
      setError(isCancel
        ? 'Audio sharing was canceled or permission was not granted.'
        : captureError instanceof Error ? captureError.message : 'Could not connect to shared audio.');
    }
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
  }, []);

  if (!enabled) return null;

  const splitIndex = Math.ceil(dockItems.length / 2);
  const leftItems = dockItems.slice(0, splitIndex);
  const rightItems = dockItems.slice(splitIndex);

  return (
    <div
      className={`ambient-strip ${dockItems.length ? 'ambient-strip-has-dock' : ''} ${mode !== 'idle' ? 'ambient-strip-active' : ''} ${stopControlVisible ? 'ambient-stop-visible' : ''} ${idle && mode === 'idle' ? 'ambient-strip-idle-hidden' : ''} ${idle && mode !== 'idle' ? 'ambient-strip-active-dock-idle' : ''}`}
      style={{ '--ambient-color': color }}
      onPointerEnter={revealStopControl}
      onFocusCapture={revealStopControl}
      onPointerDown={(event) => {
        if (!event.target.closest('.ambient-wave-stop')) revealStopControl();
      }}
    >
      {leftItems.length > 0 && (
        <MinimizedWidgetDock items={leftItems} style={dockStyle} embedded idle={idle && mode !== 'idle'} />
      )}
      <div className="ambient-strip-main">
        <canvas ref={canvasRef} className="ambient-strip-visualizer" aria-hidden="true" />
        <div className="ambient-strip-status">
          <span className="ambient-strip-icon">
            {error ? <AlertCircle size={15} /> : <AudioLines size={15} />}
          </span>
          <span className="ambient-strip-copy">
            <strong>Ambient Sound Sync</strong>
            <span>{error || (mode === 'real' ? 'Listening to shared audio' : mode === 'simulated' ? 'Ambient wave is active' : canConnect ? 'Sync a tab or system audio' : 'Create a gentle ambient wave')}</span>
          </span>
        </div>
        <div className="ambient-strip-actions">
          {mode === 'idle' ? (
            <>
              <button
                type="button"
                className="ambient-action ambient-action-secondary"
                onClick={() => {
                  setError('');
                  setMode('simulated');
                }}
              >
                <Sparkles size={13} />
                <span>Simulate</span>
              </button>
              {canConnect && (
                <button type="button" className="ambient-action ambient-action-primary" onClick={startSystemAudioCapture}>
                  <Play size={13} fill="currentColor" />
                  <span>Connect</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="ambient-wave-stop"
                onClick={stopAudioCapture}
                aria-label="Stop ambient sync"
                title="Stop sync"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </>
          )}
        </div>
      </div>
      {rightItems.length > 0 && (
        <MinimizedWidgetDock items={rightItems} style={dockStyle} embedded idle={idle && mode !== 'idle'} />
      )}
    </div>
  );
}
