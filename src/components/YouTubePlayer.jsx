import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Music2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { storageManager } from '../utils/localStorage';
import '../styles/YouTubePlayer.css';

let youtubeApiPromise;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      youtubeApiPromise = undefined;
      reject(new Error('The YouTube player API could not be loaded.'));
    };
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function getPlayerErrorMessage(code) {
  if (code === 2) return 'This playlist link is invalid. Add a public YouTube playlist in Settings.';
  if (code === 5) return 'This video is not playable in the embedded player. Try the next video or use a public playlist.';
  if (code === 100) return 'This playlist is unavailable or private. Use a public playlist link.';
  if (code === 101 || code === 150) return 'A video in this playlist does not allow embedded playback.';
  if (code === 153) return 'YouTube could not verify this embed. Check the page referrer settings and reload.';
  return `YouTube could not load this playlist (error ${code}).`;
}

export default function YouTubePlayer({ minimized = false, onToggleMinimize, onResize }) {
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  const progressFillRef = useRef(null);
  const playbackClockRef = useRef({ time: 0, updatedAt: 0 });
  const playerElementId = useId();
  const [playlistId, setPlaylistId] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [playerErrorCode, setPlayerErrorCode] = useState(null);
  const [playerRetryCount, setPlayerRetryCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoTitle, setVideoTitle] = useState('');

  const syncPlaybackClock = useCallback((player) => {
    const nextDuration = Math.max(0, player.getDuration() || 0);
    const nextTime = Math.max(0, player.getCurrentTime() || 0);
    playbackClockRef.current = { time: nextTime, updatedAt: performance.now() };
    setDuration((previous) => previous === nextDuration ? previous : nextDuration);
    setCurrentTime((previous) => Math.floor(previous) === Math.floor(nextTime) ? previous : nextTime);
    const progress = nextDuration > 0 ? Math.min(nextTime / nextDuration, 1) : 0;
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${progress})`;
    }
  }, []);

  useEffect(() => {
    if (!playerReady || !isPlaying) return undefined;
    let animationFrameId;
    let lastPollTime = 0;
    const animateProgress = (now) => {
      const player = playerRef.current;
      if (!player) return;

      if (now - lastPollTime >= 500) {
        syncPlaybackClock(player);
        lastPollTime = now;
      }

      const { time, updatedAt } = playbackClockRef.current;
      const elapsed = Math.max(0, (now - updatedAt) / 1000);
      const projectedTime = Math.min(time + elapsed, duration || time + elapsed);
      const progress = duration > 0 ? Math.min(projectedTime / duration, 1) : 0;
      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleX(${progress})`;
      }

      animationFrameId = window.requestAnimationFrame(animateProgress);
    };

    animationFrameId = window.requestAnimationFrame(animateProgress);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [duration, isPlaying, playerReady, syncPlaybackClock]);

  const formatTime = (time) => {
    if (!Number.isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  useEffect(() => {
    const loadCurrentPlaylist = () => {
      const currentPlaylist = storageManager.getCurrentYouTubePlaylist();
      if (currentPlaylist) {
        setPlaylistId(currentPlaylist);
        return;
      }

      const savedPlaylists = storageManager.getYouTubePlaylists();
      setPlaylistId(savedPlaylists?.[savedPlaylists.length - 1]?.playlistId || '');
    };

    loadCurrentPlaylist();
    window.addEventListener('youtube-playlist-updated', loadCurrentPlaylist);
    return () => window.removeEventListener('youtube-playlist-updated', loadCurrentPlaylist);
  }, []);

  useEffect(() => {
    setIsPlaying(false);
    setPlayerError('');
    setPlayerErrorCode(null);
    if (!playlistId) {
      setPlayerReady(false);
      playerRef.current?.destroy();
      playerRef.current = null;
      return undefined;
    }

    if (playerRef.current) {
      playerRef.current.loadPlaylist({ list: playlistId, listType: 'playlist' });
      return undefined;
    }
    setPlayerReady(false);
    setVideoTitle('');
    if (!playerContainerRef.current) return undefined;

    let cancelled = false;

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !playerContainerRef.current) return;

        const player = new youtube.Player(playerContainerRef.current, {
          playerVars: {
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            listType: 'playlist',
            list: playlistId,
            origin: window.location.origin,
            widget_referrer: window.location.href,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              event.target.getIframe().setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              setPlayerReady(true);
              setIsMuted(event.target.isMuted());
              syncPlaybackClock(event.target);
              setVideoTitle(event.target.getVideoData()?.title || '');
            },
            onStateChange: (event) => {
              const playing = event.data === window.YT.PlayerState.PLAYING;
              setIsPlaying(playing);
              if (playing) {
                setPlayerError('');
                setPlayerErrorCode(null);
              }
              syncPlaybackClock(event.target);
              setVideoTitle(event.target.getVideoData()?.title || '');
            },
            onError: (event) => {
              setPlayerErrorCode(event.data);
              setPlayerError(getPlayerErrorMessage(event.data));
            },
          },
        });
        playerRef.current = player;
      })
      .catch((error) => {
        if (!cancelled) setPlayerError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [playerElementId, playlistId, playerRetryCount, syncPlaybackClock]);

  useEffect(() => () => {
    playerRef.current?.destroy();
    playerRef.current = null;
  }, []);

  useEffect(() => {
    if (!minimized || !playerRef.current) return;
    playerRef.current.pauseVideo();
    setIsPlaying(false);
  }, [minimized]);

  const togglePlayback = () => {
    if (!playerReady || !playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const toggleMute = () => {
    if (!playerReady || !playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
    } else {
      playerRef.current.mute();
    }
    setIsMuted(!isMuted);
  };

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div className={`youtube-card ${minimized ? 'minimized' : ''}`}>
      <div className="youtube-player-shell">
        {playlistId ? (
          <div
            ref={playerContainerRef}
            id={playerElementId}
            className="youtube-player-container"
            aria-label="YouTube playlist player"
          />
        ) : (
          <div className="youtube-placeholder">
            <span className="youtube-empty-icon"><Music2 size={19} /></span>
            <strong>Bring your playlist</strong>
            <span>Add a public YouTube playlist link in Settings to load it here.</span>
            <button
              type="button"
              className="youtube-settings-link"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => window.dispatchEvent(new Event('open-youtube-settings'))}
            >
              Open YouTube settings
            </button>
          </div>
        )}
      </div>
      {playerError && !minimized && (
        <div className="youtube-player-error" role="alert">
          <span>{playerError}</span>
          <button
            type="button"
            className="youtube-error-retry"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              setPlayerError('');
              if ([5, 101, 150].includes(playerErrorCode)) {
                playerRef.current?.nextVideo();
              } else if (playerRef.current) {
                playerRef.current.loadPlaylist({ list: playlistId, listType: 'playlist' });
              } else {
                setPlayerRetryCount((count) => count + 1);
              }
            }}
          >
            {[5, 101, 150].includes(playerErrorCode) ? 'Skip video' : 'Retry'}
          </button>
        </div>
      )}
      {!minimized && (
        <div className="youtube-control-dock" aria-label="YouTube playlist controls">
          {playlistId && (
            <div className="youtube-track-info">
              <span className="youtube-track-icon"><Music2 size={14} /></span>
              <span className="youtube-track-copy">
                <strong>{videoTitle || 'YouTube playlist'}</strong>
                <span>{isPlaying ? 'NOW PLAYING' : playerReady ? 'READY TO PLAY' : 'PLAYLIST'}</span>
              </span>
            </div>
          )}
          {playlistId && (
            <div className="youtube-progress-row">
              <span className="youtube-time">{formatTime(currentTime)}</span>
              <div
                className="youtube-progress-track"
                role="progressbar"
                aria-label="Video playback progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(progress)}
              >
                <span
                  ref={progressFillRef}
                  className="youtube-progress-fill"
                  style={{ transform: `scaleX(${progress / 100})` }}
                />
              </div>
              <span className="youtube-time">{formatTime(duration)}</span>
            </div>
          )}
          <div className="youtube-controls-row">
            {playlistId && (
              <button
                type="button"
                className="youtube-control-button youtube-secondary-control"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={toggleMute}
                disabled={!playerReady}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}
            {playlistId && (
              <div className="youtube-main-controls">
                <button
                  type="button"
                  className="youtube-control-button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => playerRef.current?.previousVideo()}
                  disabled={!playerReady}
                  aria-label="Previous video"
                  title="Previous video"
                >
                  <SkipBack size={17} />
                </button>
                <button
                  type="button"
                  className="youtube-control-button youtube-play-button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={togglePlayback}
                  disabled={!playerReady}
                  aria-label={isPlaying ? 'Pause playlist' : 'Play playlist'}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={17} /> : <Play size={17} />}
                </button>
                <button
                  type="button"
                  className="youtube-control-button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => playerRef.current?.nextVideo()}
                  disabled={!playerReady}
                  aria-label="Next video"
                  title="Next video"
                >
                  <SkipForward size={17} />
                </button>
              </div>
            )}
            <div className="youtube-widget-actions">
              <button
                type="button"
                className="youtube-control-button youtube-secondary-control youtube-minimize-button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={onToggleMinimize}
                aria-label="Minimize YouTube widget"
                title="Minimize widget"
              >
                <Minimize2 size={16} />
              </button>
              <div
                className="youtube-resize-grip"
                onMouseDown={onResize}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      )}
      {minimized && (
        <button
          type="button"
          className="youtube-restore-btn"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onToggleMinimize}
          aria-label="Restore YouTube player"
          title="Restore YouTube player"
        >
          <Play size={21} />
          <span>Restore player</span>
        </button>
      )}
    </div>
  );
}
