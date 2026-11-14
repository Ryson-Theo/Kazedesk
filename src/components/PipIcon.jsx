import settledPip from "../assets/pipbird/Chibi Bird Sticker Animation Frames.gif";

export default function PipIcon({ className, size = 100, label }) {
  return (
    <img
      className={className}
      src={settledPip}
      width={size}
      height={size}
      alt={label || ""}
      aria-hidden={label ? undefined : true}
      draggable="false"
    />
  );
}
