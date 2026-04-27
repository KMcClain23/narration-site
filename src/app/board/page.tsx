"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const COLUMNS = [
  { id: "audition",   label: "Audition",   color: "border-purple-500/40 bg-purple-500/5" },
  { id: "contracted", label: "Contracted", color: "border-blue-500/40 bg-blue-500/5" },
  { id: "recording",  label: "Recording",  color: "border-yellow-500/40 bg-yellow-500/5" },
  { id: "editing",    label: "Editing",    color: "border-orange-500/40 bg-orange-500/5" },
  { id: "released",   label: "Released",   color: "border-emerald-500/40 bg-emerald-500/5" },
];

const COLUMN_DOTS: Record<string, string> = {
  audition:   "bg-purple-400",
  contracted: "bg-blue-400",
  recording:  "bg-yellow-400",
  editing:    "bg-orange-400",
  released:   "bg-emerald-400",
};

interface BoardCard {
  id: string;
  title: string;
  author: string;
  cover_url: string;
  status: string;
  deadline?: string;
  notes: string;
  author_notes: string;
  links: { label: string; url: string }[];
  co_narrator: string;
  author_token: string;
  sort_order: number;
}

const EMPTY_CARD: Omit<BoardCard, "id" | "author_token" | "sort_order"> = {
  title: "", author: "", cover_url: "", status: "audition",
  deadline: "", notes: "", author_notes: "", links: [], co_narrator: "",
};

export default function BoardPage() {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<BoardCard | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CARD });
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/board");
      const data = await res.json();
      setCards(data.cards || []);
    } catch { setError("Failed to load board."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cardsInColumn = (col: string) =>
    cards.filter(c => c.status === col).sort((a, b) => a.sort_order - b.sort_order);

  // Drag and drop
  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, col: string) => { e.preventDefault(); setDragOver(col); };
  const handleDrop = async (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragId) return;
    const card = cards.find(c => c.id === dragId);
    if (!card || card.status === col) return;
    setCards(prev => prev.map(c => c.id === dragId ? { ...c, status: col } : c));
    await fetch("/api/board", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dragId, status: col }) });
    setDragId(null);
  };

  // Save card
  const saveCard = async () => {
    setSaving(true);
    try {
      if (editingCard) {
        const res = await fetch("/api/board", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingCard.id, ...form }) });
        const data = await res.json();
        if (data.card) setCards(prev => prev.map(c => c.id === editingCard.id ? data.card : c));
        setEditingCard(null);
      } else {
        const res = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, sort_order: cardsInColumn(form.status).length }) });
        const data = await res.json();
        if (data.card) setCards(prev => [...prev, data.card]);
        setShowAddForm(false);
      }
      setForm({ ...EMPTY_CARD });
    } catch { setError("Save failed."); }
    setSaving(false);
  };

  const deleteCard = async (id: string) => {
    if (!confirm("Delete this card?")) return;
    await fetch("/api/board", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setCards(prev => prev.filter(c => c.id !== id));
  };

  const startEdit = (card: BoardCard) => {
    setEditingCard(card);
    setForm({ title: card.title, author: card.author, cover_url: card.cover_url, status: card.status,
      deadline: card.deadline || "", notes: card.notes, author_notes: card.author_notes,
      links: card.links, co_narrator: card.co_narrator });
    setShowAddForm(false);
  };

  const copyToken = (token: string, type: "author") => {
    const url = `${window.location.origin}/board/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const addLink = () => {
    if (!newLinkLabel || !newLinkUrl) return;
    setForm(f => ({ ...f, links: [...f.links, { label: newLinkLabel, url: newLinkUrl }] }));
    setNewLinkLabel(""); setNewLinkUrl("");
  };

  const removeLink = (i: number) => setForm(f => ({ ...f, links: f.links.filter((_, idx) => idx !== i) }));

  return (
    <main className="min-h-screen bg-[#06082E] text-white pt-14 sm:pt-16">
      {/* Header */}
      <div className="sticky top-14 sm:top-16 z-40 bg-[#06082E]/95 backdrop-blur border-b border-white/8 px-5 sm:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/stats" className="text-xs text-white/40 hover:text-[#D4AF37] transition-colors">
            ← Admin
          </Link>
          <span className="text-white/20">/</span>
          <h1 className="text-sm font-bold text-white">Production Board</h1>
        </div>
        <button onClick={() => { setShowAddForm(true); setEditingCard(null); setForm({ ...EMPTY_CARD }); }}
          className="inline-flex items-center gap-1.5 bg-[#D4AF37] text-black text-xs font-bold px-4 py-2 rounded-full hover:bg-[#E0C15A] transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add card
        </button>
      </div>

      {error && <div className="mx-5 mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">{error}</div>}

      {/* Add / Edit form */}
      {(showAddForm || editingCard) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setShowAddForm(false); setEditingCard(null); } }}>
          <div className="w-full max-w-lg bg-[#0A0D3A] border border-[#1A2070] rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <h2 className="font-bold text-white">{editingCard ? "Edit card" : "New card"}</h2>
              <button onClick={() => { setShowAddForm(false); setEditingCard(null); }} className="text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {[
                { label: "Book title *", key: "title", placeholder: "e.g. Whiskey & Lies" },
                { label: "Author", key: "author", placeholder: "e.g. E.A. Harper" },
                { label: "Cover image URL", key: "cover_url", placeholder: "https://..." },
                { label: "Co-narrator", key: "co_narrator", placeholder: "e.g. Ann Dahlia" },
              ].map(f => (
                <label key={f.key} className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">{f.label}</span>
                  <input value={(form as Record<string, string>)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition" />
                </label>
              ))}

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Column</span>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Deadline</span>
                  <input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40" />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Your notes (private)</span>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                  placeholder="Private production notes..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none" />
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Note to author (visible on their link)</span>
                <textarea value={form.author_notes} onChange={e => setForm(p => ({ ...p, author_notes: e.target.value }))} rows={2}
                  placeholder="Message visible to the author..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none" />
              </label>

              {/* Links */}
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-2">Links</span>
                {form.links.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-[#D4AF37] flex-1 truncate">{link.label}: {link.url}</span>
                    <button type="button" onClick={() => removeLink(i)} className="text-red-400/50 hover:text-red-400 text-xs">✕</button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)} placeholder="Label (e.g. ACX)"
                    className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40" />
                  <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://..."
                    className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40" />
                  <button type="button" onClick={addLink} className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-2 rounded-lg transition">Add</button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={saveCard} disabled={saving || !form.title.trim()}
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold py-2.5 rounded-full text-sm transition disabled:opacity-50">
                  {saving ? "Saving…" : editingCard ? "Save changes" : "Add card"}
                </button>
                <button onClick={() => { setShowAddForm(false); setEditingCard(null); }}
                  className="border border-white/20 text-white/60 hover:text-white px-5 py-2.5 rounded-full text-sm transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="px-4 sm:px-6 py-6 overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {COLUMNS.map(col => (
            <div key={col.id}
              onDragOver={e => handleDragOver(e, col.id)}
              onDrop={e => handleDrop(e, col.id)}
              onDragLeave={() => setDragOver(null)}
              className={`w-64 flex-shrink-0 rounded-2xl border ${col.color} ${dragOver === col.id ? "ring-2 ring-[#D4AF37]/50" : ""} transition-all`}>

              {/* Column header */}
              <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${COLUMN_DOTS[col.id]}`} />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-white/70">{col.label}</h2>
                </div>
                <span className="text-xs text-white/30">{cardsInColumn(col.id).length}</span>
              </div>

              {/* Cards */}
              <div className="px-3 pb-3 space-y-2.5">
                {loading ? (
                  <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
                ) : cardsInColumn(col.id).map(card => (
                  <div key={card.id}
                    draggable
                    onDragStart={() => handleDragStart(card.id)}
                    className={`rounded-xl bg-[#06082E] border border-white/8 hover:border-[#D4AF37]/25 transition-all cursor-grab active:cursor-grabbing shadow-md ${dragId === card.id ? "opacity-40" : ""}`}>

                    {/* Cover */}
                    {card.cover_url && (
                      <div className="h-28 rounded-t-xl overflow-hidden">
                        <img src={card.cover_url} alt={card.title} className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="p-3">
                      <p className="font-semibold text-sm text-white leading-snug">{card.title}</p>
                      {card.author && <p className="text-xs text-[#D4AF37]/80 mt-0.5">{card.author}</p>}
                      {card.co_narrator && (
                        <p className="text-[10px] text-white/35 mt-0.5">with {card.co_narrator}</p>
                      )}
                      {card.deadline && (
                        <div className="flex items-center gap-1 mt-2">
                          <svg className="h-3 w-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className={`text-[10px] ${new Date(card.deadline) < new Date() && col.id !== "released" ? "text-red-400" : "text-white/35"}`}>
                            {new Date(card.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                      )}

                      {/* Expand/collapse notes */}
                      {(card.notes || card.links.length > 0) && (
                        <button type="button" onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                          className="mt-2 text-[10px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1">
                          {expandedCard === card.id ? "▲ Less" : "▼ More"}
                        </button>
                      )}

                      {expandedCard === card.id && (
                        <div className="mt-2 space-y-2">
                          {card.notes && <p className="text-xs text-white/55 leading-relaxed">{card.notes}</p>}
                          {card.links.map((link, i) => (
                            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors">
                              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 pt-2.5 border-t border-white/6 flex items-center justify-between">
                        <div className="flex gap-1.5">
                          {/* Column dropdown */}
                          <select value={card.status}
                            onChange={async e => {
                              const newCol = e.target.value;
                              setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: newCol } : c));
                              await fetch("/api/board", { method: "PUT", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: card.id, status: newCol }) });
                            }}
                            className="text-[10px] bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white/60 appearance-none focus:outline-none hover:border-white/20 transition cursor-pointer">
                            {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Copy author link */}
                          <button type="button" onClick={() => copyToken(card.author_token, "author")} title="Copy author link"
                            className="text-white/25 hover:text-[#D4AF37] transition-colors">
                            {copiedToken === card.author_token ? (
                              <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            )}
                          </button>
                          <button type="button" onClick={() => startEdit(card)} className="text-white/25 hover:text-white transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button type="button" onClick={() => deleteCard(card.id)} className="text-white/25 hover:text-red-400 transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add card shortcut */}
                <button onClick={() => { setShowAddForm(true); setEditingCard(null); setForm({ ...EMPTY_CARD, status: col.id }); }}
                  className="w-full py-2 text-xs text-white/20 hover:text-white/50 hover:bg-white/5 rounded-xl transition-colors flex items-center justify-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add card
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
