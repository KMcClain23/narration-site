"use client";

import Link from "next/link";
import { useRef, useEffect, useState, useCallback } from "react";
import { sendGAEvent } from "@next/third-parties/google";

/**
 * The demo player, shared by the homepage and /demos.
 *
 * It lived inside HomeClient, so /demos could not reach it and fell back to a
 * raw <audio controls> — a white browser widget on a navy page, with its own
 * duration readout disagreeing with the one printed above it. Same component
 * on both pages now: one gold play control, one seek bar, one duration, and
 * the single-active-playback behavior that stops two clips overlapping.
 */

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Rotating border colors for demo cards (cycles past six)
// Rotating border colors for demo cards (cycles if more than 6 demos)
export const DEMO_COLORS = [
  "border-pink-400","border-purple-400","border-violet-400",
  "border-rose-300","border-blue-400","border-amber-400",
];

export function titleToSlug(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Static waveform heights for the decorative bar animation
// Static waveform heights for the decorative bar animation
const WAVE_BARS = [3,5,9,14,20,17,12,7,3,6,11,17,22,18,13,8,4,7,13,20,24,17,10,5,3,8,15,22,18,11,5,3];

export function DemoPlayer({
  title, desc, src, slug, index, activeIndex, setActiveIndex, audioRefs, color, tags, durationSeconds,
}: {
  title: string; desc: string; src: string; slug: string; index: number; color: string; tags: string[];
  activeIndex: number | null; setActiveIndex: (v: number | null) => void;
  audioRefs: React.MutableRefObject<(HTMLAudioElement | null)[]>;
  durationSeconds?: number;
}) {
  const isActive = activeIndex === index;
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [progress, setProgress] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [muted, setMuted] = useState(false);

  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const setAudioEl = useCallback((el: HTMLAudioElement | null) => {
    audioElRef.current = el;
    audioRefs.current[index] = el;
  }, [audioRefs, index]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    const a = audioElRef.current;
    if (!a) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  };

  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  const seekTo = (clientX: number) => {
    const a = audioElRef.current;
    const bar = seekBarRef.current;
    if (!a || !bar) return;
    const dur = a.duration;
    if (!dur) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max(0, (clientX - rect.left) / rect.width), 1);
    a.currentTime = ratio * dur;
    setProgress(ratio * 100);
    setDisplayTime(ratio * dur);
  };

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    seekTo(e.clientX);

    const onMove = (ev: MouseEvent) => { if (isDragging.current) seekTo(ev.clientX); };
    const onUp = () => { isDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleMute = () => {
    const a = audioElRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(v => !v);
  };

  useEffect(() => {
    const a = audioElRef.current;
    if (!a) return;
    const onTimeUpdate = () => {
      const rawDur = a.duration;
      const dur = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : (durationSeconds ?? 0);
      setDisplayTime(a.currentTime);
      setProgress(dur > 0 ? (a.currentTime / dur) * 100 : 0);
    };
    const onDurationChange = () => {
      // Streamed R2 files sometimes report duration as Infinity/NaN until
      // fully buffered — keep the known duration_seconds fallback instead.
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    const onPlay = () => {
      setPlaying(true); setBuffering(false); setActiveIndex(index);
      sendGAEvent("event", "demo_play", { event_category: "Audio", event_label: title, value: index });
      fetch("/api/track-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {});
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => { setPlaying(false); setProgress(0); setDisplayTime(0); setActiveIndex(null); };
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
  }, [index, title, setActiveIndex, durationSeconds]);

  return (
    <div
      className={`group relative rounded-2xl border-t-2 ${color} transition-all duration-500 ${isActive ? "ring-1 ring-[#D4AF37]/50" : "hover:ring-1 hover:ring-white/10"}`}
      style={{ background: isActive ? "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(11,18,36,1) 60%)" : "rgba(11,18,36,1)" }}
    >
      {isActive && (
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, rgba(212,175,55,0.4), transparent 60%)" }} />
      )}

      <div className="relative p-4 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-white leading-snug">{title}</h3>
            <p className="mt-0.5 text-xs text-white/50 leading-snug">{desc}</p>
          </div>
          {isActive && (
            <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-0.5 rounded-full bg-[#D4AF37]"
                  style={{ height: 12, animation: `barPulse 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
              ))}
            </div>
          )}
        </div>

        {/* Genre tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/50">{tag}</span>
            ))}
          </div>
        )}

        {/* Player */}
        <div className="relative mt-auto rounded-xl bg-black/40 p-4">

          {/* Row 1: play button + waveform + mute */}
          <div className="flex items-center gap-3">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} type="button"
              className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-[#D4AF37] text-black hover:bg-[#E0C15A] transition-colors shadow-lg shadow-[#D4AF37]/20 ${!src ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}>
              {buffering
                ? <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                : playing
                  ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
                  : <svg className="h-4 w-4 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
              }
            </button>

            {/* Waveform — h-12, fills between play and mute */}
            <div className="flex-1 h-12 flex items-end justify-between gap-px" aria-hidden="true">
              {WAVE_BARS.map((h, i) => (
                <div key={i}
                  className="rounded-full bg-[#D4AF37] flex-1"
                  style={{
                    height: `${Math.round(h * (48 / 24))}px`,
                    opacity: playing ? 0.5 : 0.1,
                    animation: playing ? `barPulse ${0.6 + (i % 4) * 0.1}s ease-in-out ${(i % 5) * 0.08}s infinite alternate` : "none",
                  }}
                />
              ))}
            </div>

            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}
              className="shrink-0 text-white/25 hover:text-white/60 transition-colors">
              {muted
                ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              }
            </button>
            {src && (
              <Link
                href={`/demos/${slug}`}
                title="Download demo"
                className="shrink-0 text-white/40 hover:text-white transition-colors p-1"
                onClick={e => e.stopPropagation()}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
              </Link>
            )}
          </div>

          {/* Row 2: progress bar + timestamps */}
          <div className="mt-3">
            <div ref={seekBarRef} className="relative w-full h-5 flex items-center cursor-pointer select-none" onMouseDown={handleSeekMouseDown}
              role="slider" aria-label="Seekbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="relative w-full h-1 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${progress}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-[#D4AF37] border border-black/20 shadow pointer-events-none"
                  style={{ left: `calc(${progress}% - 6px)` }} />
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-white/30 mt-1">
              <span>{formatTime(displayTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <audio ref={setAudioEl} src={src} preload="metadata" />
        </div>
      </div>
    </div>
  );
}
