"use client";

import { useState, useEffect, useRef } from "react";

interface Msg {
  id: string;
  sender: "dean" | "author";
  sender_name: string;
  text: string;
  read: boolean;
  created_at: string;
}

interface Chapter { title: string }

export default function AuthorMessages({
  cardId,
  token,
  authorName,
  chapters,
}: {
  cardId: string;
  token: string;
  authorName: string;
  chapters: Chapter[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    const res = await fetch(`/api/board-messages?cardId=${cardId}&token=${token}`);
    const data = await res.json();
    if (data.messages) setMessages(data.messages);
  };

  useEffect(() => {
    load();
    // mark dean's messages as read when author opens the thread
    fetch("/api/board-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, viewedBy: "author", token }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    await fetch("/api/board-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, text: text.trim(), sender: "author", senderName: authorName, token }),
    });
    setText("");
    await load();
    setSending(false);
    textareaRef.current?.focus();
  };

  const flagChapter = (title: string) => {
    setText(`⚑ ${title}: `);
    setFlagOpen(false);
    textareaRef.current?.focus();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="rounded-2xl border border-white/8 bg-[#0A0D3A] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium">Messages</p>
        {chapters.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setFlagOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-[#D4AF37] border border-white/10 hover:border-[#D4AF37]/30 px-3 py-1.5 rounded-full transition-colors"
            >
              <span>⚑</span> Flag a chapter
            </button>
            {flagOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-[#06082E] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden max-h-60 overflow-y-auto">
                {chapters.map((ch, i) => (
                  <button key={i} type="button" onClick={() => flagChapter(ch.title)}
                    className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0">
                    {ch.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thread */}
      <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-white/25 text-center py-4">No messages yet. Send Dean a note below.</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === "author" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] ${msg.sender === "author" ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.sender === "author"
                  ? "bg-[#D4AF37]/20 border border-[#D4AF37]/25 text-white"
                  : "bg-white/5 border border-white/8 text-white/85"
              }`}>
                {msg.text}
              </div>
              <p className="text-[10px] text-white/25 px-1">{msg.sender_name} · {fmt(msg.created_at)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="px-4 pb-4">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder="Send Dean a message… (Enter to send)"
            className="flex-1 rounded-xl bg-black/30 border border-white/8 px-3 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
            className="shrink-0 bg-[#D4AF37] text-black text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-[#E0C15A] transition disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
