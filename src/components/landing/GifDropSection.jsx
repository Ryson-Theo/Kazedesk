import { ArrowDownToLine, ArrowUpRight, FileImage, Image } from "lucide-react";
import animeGif from "../../assets/anime.gif";

export default function GifDropSection() {
  return (
    <section className="gif-drop-section" id="backgrounds">
      <div className="gif-drop-inner">
        <div className="gif-drop-copy">
          <span className="section-kicker">Make the space yours</span>
          <h2>A new backdrop,<br /><em>in one little drop.</em></h2>
          <p>Find a GIF you have permission to use, drag it from its browser tab, and drop it onto the Kazedesk dashboard. Your chosen background stays on your device.</p>
          <div className="gif-drop-steps">
            <span><b>01</b> Open a GIF source in another tab</span>
            <span><b>02</b> Drag the image onto your dashboard</span>
            <span><b>03</b> Settle into your new scene</span>
          </div>
        </div>

        <div className="gif-drop-demo" role="img" aria-label="Animated demonstration of dragging a GIF from another browser tab into a Kazedesk dashboard">
          <div className="gif-demo-browser-bar"><span className="gif-demo-dots"><i /><i /><i /></span><span className="gif-demo-tab gif-source-tab"><FileImage size={13} /> GIF source</span><span className="gif-demo-tab gif-dashboard-tab"><Image size={13} /> Kazedesk</span></div>
          <div className="gif-demo-workspace">
            <div className="gif-source-window">
              <span className="gif-source-label">IMAGE PICKER</span>
              <div className="gif-source-art"><img src={animeGif} alt="Animated anime GIF ready to use as a background" /><span>GIF</span></div>
              <span className="gif-source-file"><FileImage size={12} /> anime.gif</span>
            </div>
            <ArrowUpRight className="gif-drop-direction" size={18} />
            <div className="gif-dashboard-window">
              <div className="gif-dashboard-bar"><i /><span>MY WORKSPACE</span><span>LOCAL BACKGROUND</span></div>
              <div className="gif-dashboard-scene"><div className="gif-dashboard-blue" /><img className="gif-dashboard-applied" src={animeGif} alt="Anime GIF applied as the dashboard background after the drop" /><div className="gif-dashboard-card"><span>FOCUS</span><strong>25:00</strong><small>Ready when you are</small></div><span className="gif-drop-target"><ArrowDownToLine size={14} /> DROP BACKGROUND</span></div>
            </div>
            <div className="gif-flying-file"><img src={animeGif} alt="" /><span>GIF</span></div>
            <span className="gif-drop-success"><Image size={12} /> Background changed</span>
          </div>
          <div className="gif-demo-footer"><span>DRAG &amp; DROP</span><span><i /> LOOPING PREVIEW</span></div>
        </div>
      </div>
    </section>
  );
}