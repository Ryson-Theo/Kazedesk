import { useEffect, useMemo, useState } from 'react';
import { Minimize2, Play } from 'lucide-react';
import { storageManager } from '../utils/localStorage';
import '../styles/YouTubePlayer.css';

export default function YouTubePlayer({ minimized = false, onToggleMinimize }) {
  const [playlistId, setPlaylistId] = useState('');

  useEffect(() => {
    const currentPlaylist = storageManager.getCurrentYouTubePlaylist();
    if (currentPlaylist) {
      setPlaylistId(currentPlaylist);
      return;
    }
    const savedPlaylists = storageManager.getYouTubePlaylists();
    if (savedPlaylists?.length) {
      const last = savedPlaylists[savedPlaylists.length - 1];
      setPlaylistId(last.playlistId || '');
    }
  }, []);

  useEffect(() => {
    const handlePlaylistUpdate = () => {
      const currentPlaylist = storageManager.getCurrentYouTubePlaylist();
      if (currentPlaylist) {
        setPlaylistId(currentPlaylist);
        return;
      }
      const savedPlaylists = storageManager.getYouTubePlaylists();
      const last = savedPlaylists?.[savedPlaylists.length - 1];
      if (last) {
        setPlaylistId(last.playlistId || '');
      }
    };

    window.addEventListener('youtube-playlist-updated', handlePlaylistUpdate);
    return () => window.removeEventListener('youtube-playlist-updated', handlePlaylistUpdate);
  }, []);

  const embedUrl = useMemo(() => {
    if (!playlistId) return '';
    return `https://www.youtube.com/embed/videoseries?list=${playlistId}&controls=1&rel=0&modestbranding=1&showinfo=0`;
  }, [playlistId]);

  return (
    <div className={`youtube-card ${minimized ? 'minimized' : ''}`}>
      <div className="youtube-player-shell">
        {embedUrl ? (
          <iframe
            title="YouTube playlist player"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="youtube-iframe"
          />
        ) : (
          <div className="youtube-placeholder">
            <p>Add playlist from dashboard settings.</p>
          </div>
        )}
      </div>
      <button
        type="button"
        className={minimized ? 'youtube-restore-btn' : 'youtube-minimize-btn'}
        onMouseDown={minimized ? undefined : (event) => event.stopPropagation()}
        onClick={onToggleMinimize}
        aria-label={minimized ? 'Restore YouTube player' : 'Minimize YouTube player'}
        title={minimized ? 'Restore YouTube player' : 'Minimize YouTube player'}
      >
        {minimized ? <Play size={24} /> : <Minimize2 size={15} />}
      </button>
    </div>
  );
}
