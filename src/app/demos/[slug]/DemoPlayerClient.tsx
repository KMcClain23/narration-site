"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const WAVE_BARS = [3,5,9,14,20,17,12,7,3,6,11,17,22,18,13,8,4,7,13,20,24,17,10,5,3,8,15,22,18,11,5,3];

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function DemoPlayerClient({
  title, src, color,
}: {
  title: string;
  src: string;
  color: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [muted, setMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    const a = audioRef.current;
    if (!a) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  };

  const seekTo = useCallback((clientX: number) => {
    const a = audioRef.current;
    const bar = seekBarRef.current;
    if (!a || !bar || !a.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max(0, (clientX - rect.left) / rect.width), 1);
    a.currentTime = ratio * a.duration;
    setProgress(ratio * 100);
    setDisplayTime(ratio * a.duration);
  }, []);

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    seekTo(e.clientX);
    const onMove = (ev: MouseEvent) => { if (isDragging.current) seekTo(ev.clientX); };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleMute = () => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(v => !v);
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTimeUpdate = () => {
      const dur = a.duration || 0;
      setDisplayTime(a.currentTime);
      setProgress(dur > 0 ? (a.currentTime / dur) * 100 : 0);
    };
    const onDurationChange = () => setDuration(a.duration || 0);
    const onPlay = () => { setPlaying(true); setBuffering(false); };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => { setPlaying(false); setProgress(0); setDisplayTime(0); };
    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("durationchange", onDurationChange);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("durationchange", onDurationChange);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes barPulse {
          from { transform: scaleY(0.4); opacity: 0.6; }
          to   { transform: scaleY(1);   opacity: 1;   }
        }
      `}</style>

      <div className={`w-full max-w-lg rounded-2xl border-t-2 ${color} bg-[#0B1224]`}
        style={{ boxShadow: "0 0 60px rgba(212,175,55,0.08)" }}>
        <div className="p-6">
          {/* Waveform decoration */}
          <div className="flex items-end justify-between gap-px h-16 mb-5" aria-hidden="true">
            {WAVE_BARS.map((h, i) => (
              <div key={i}
                className="rounded-full bg-[#D4AF37] flex-1"
                style={{
                  height: `${Math.round(h * (64 / 24))}px`,
                  opacity: playing ? 0.6 : 0.15,
                  animation: playing
                    ? `barPulse ${0.6 + (i % 4) * 0.1}s ease-in-out ${(i % 5) * 0.08}s infinite alternate`
                    : "none",
                }}
              />
            ))}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-4">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} type="button"
              className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center bg-[#D4AF37] text-black hover:bg-[#E0C15A] transition-colors shadow-lg shadow-[#D4AF37]/20 cursor-pointer">
              {buffering
                ? <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                : playing
                  ? <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>
                  : <svg className="h-5 w-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z"/></svg>
              }
            </button>

            {/* Seek bar */}
            <div className="flex-1">
              <div ref={seekBarRef} className="relative w-full h-5 flex items-center cursor-pointer select-none"
                onMouseDown={handleSeekMouseDown}
                role="slider" aria-label="Seek" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="relative w-full h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${progress}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[#D4AF37] border border-black/20 shadow pointer-events-none"
                    style={{ left: `calc(${progress}% - 7px)` }} />
                </div>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-white/30 mt-1">
                <span>{formatTime(displayTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}
              className="shrink-0 text-white/30 hover:text-white/70 transition-colors">
              {muted
                ? <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              }
            </button>
          </div>
        </div>

        <audio ref={audioRef} src={src} preload="metadata" />
      </div>
    </>
  );
}
