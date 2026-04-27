"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const COLUMNS = [
  { id: "audition",   label: "Audition",   color: "border-purple-500/30 bg-purple-500/5",  dot: "bg-purple-400",  text: "text-purple-300" },
  { id: "contracted", label: "Contracted", color: "border-blue-500/30 bg-blue-500/5",      dot: "bg-blue-400",    text: "text-blue-300" },
  { id: "recording",  label: "Recording",  color: "border-yellow-500/30 bg-yellow-500/5",  dot: "bg-yellow-400",  text: "text-yellow-300" },
  { id: "editing",    label: "Editing",    color: "border-orange-500/30 bg-orange-500/5",  dot: "bg-orange-400",  text: "text-orange-300" },
  { id: "released",   label: "Released",   color: "border-emerald-500/30 bg-emerald-500/5",dot: "bg-emerald-400", text: "text-emerald-300" },
];

interface Link { label: string; url: string; }
interface BoardCard {
  id: string; title: string; author: string; cover_url: string;
  status: string; deadline?: string; notes: string; author_notes: string;
  links: Link[]; co_narrator: string; author_token: string; sort_order: number;
  subtitle: string; tags: string[]; description: string; audible_link: string; ar_link: string;
}

const EMPTY: Omit<BoardCard, "id"|"author_token"|"sort_order"> = {
  title:"", author:"", cover_url:"", status:"audition", deadline:"",
  notes:"", author_notes:"", links:[], co_narrator:"",
  subtitle:"", tags:[], description:"", audible_link:"", ar_link:"",
};

export default function BoardPage() {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCard, setEditCard] = useState<BoardCard|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({...EMPTY});
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string|null>(null);
  const [dragOver, setDragOver] = useState<string|null>(null);
  const [copied, setCopied] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [linkLabel, setLinkLabel] = useState(""); const [linkUrl, setLinkUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [syncing, setSyncing] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/board"); const d = await r.json(); setCards(d.cards||[]); }
    catch { setError("Failed to load."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const col = (id: string) => cards.filter(c=>c.status===id).sort((a,b)=>a.sort_order-b.sort_order);

  const drop = async (e: React.DragEvent, status: string) => {
    e.preventDefault(); setDragOver(null);
    if (!dragId) return;
    const card = cards.find(c=>c.id===dragId);
    if (!card || card.status===status) return;
    setCards(p=>p.map(c=>c.id===dragId?{...c,status}:c));
    await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:dragId,status})});
    setDragId(null);
    // If moved to released, sync to public books table
    if (status==="released") await syncToBooks({...card,status});
  };

  const syncToBooks = async (card: BoardCard) => {
    setSyncing(card.id);
    try {
      await fetch("/api/books",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        title:card.title, subtitle:card.subtitle||"", author:card.author,
        link:card.audible_link||"", ar_link:card.ar_link||"", cover_url:card.cover_url,
        tags:card.tags||[], description:card.description||"",
        category:"completed", co_narrator:card.co_narrator?[card.co_narrator]:[], sort_order:0,
      })});
    } catch { setError("Sync to public books failed."); }
    setSyncing(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editCard) {
        const r = await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editCard.id,...form})});
        const d = await r.json();
        if (d.card) setCards(p=>p.map(c=>c.id===editCard.id?d.card:c));
        setEditCard(null);
      } else {
        const r = await fetch("/api/board",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,sort_order:col(form.status).length})});
        const d = await r.json();
        if (d.card) setCards(p=>[...p,d.card]);
        setShowForm(false);
      }
      setForm({...EMPTY}); setTagInput("");
    } catch { setError("Save failed."); }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (!confirm("Delete this card?")) return;
    await fetch("/api/board",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
    setCards(p=>p.filter(c=>c.id!==id));
  };

  const startEdit = (card: BoardCard) => {
    setEditCard(card);
    setForm({title:card.title,author:card.author,cover_url:card.cover_url,status:card.status,
      deadline:card.deadline||"",notes:card.notes,author_notes:card.author_notes,
      links:card.links,co_narrator:card.co_narrator,subtitle:card.subtitle||"",
      tags:card.tags||[],description:card.description||"",
      audible_link:card.audible_link||"",ar_link:card.ar_link||""});
    setShowForm(false);
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/board/${token}`);
    setCopied(token); setTimeout(()=>setCopied(null),2000);
  };

  const addLink = () => { if(linkLabel&&linkUrl){setForm(f=>({...f,links:[...f.links,{label:linkLabel,url:linkUrl}]}));setLinkLabel("");setLinkUrl("");} };
  const removeLink = (i:number) => setForm(f=>({...f,links:f.links.filter((_,idx)=>idx!==i)}));
  const addTag = () => { const t=tagInput.trim(); if(t&&!form.tags.includes(t)){setForm(f=>({...f,tags:[...f.tags,t]}));setTagInput("");} };
  const removeTag = (t:string) => setForm(f=>({...f,tags:f.tags.filter(x=>x!==t)}));

  const F = ({label,k,placeholder,type="text"}:{label:string;k:string;placeholder?:string;type?:string}) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">{label}</span>
      <input type={type} value={(form as unknown as Record<string,string>)[k]}
        onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
    </label>
  );

  return (
    <main className="min-h-screen bg-[#06082E] text-white pt-14 sm:pt-16">
      {/* Sticky header */}
      <div className="sticky top-14 sm:top-16 z-40 bg-[#06082E]/95 backdrop-blur border-b border-white/8 px-5 sm:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/stats" className="text-xs text-white/40 hover:text-[#D4AF37] transition-colors">← Admin</Link>
          <span className="text-white/20">/</span>
          <h1 className="text-sm font-bold text-white">Production Board</h1>
          <span className="text-xs text-white/25">{cards.length} projects</span>
        </div>
        <button onClick={()=>{setShowForm(true);setEditCard(null);setForm({...EMPTY});setTagInput("");}}
          className="inline-flex items-center gap-1.5 bg-[#D4AF37] text-black text-xs font-bold px-4 py-2 rounded-full hover:bg-[#E0C15A] transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          New project
        </button>
      </div>

      {error && <div className="mx-5 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex justify-between"><span>{error}</span><button onClick={()=>setError(null)} className="text-red-300/50 hover:text-red-300">✕</button></div>}

      {/* Modal */}
      {(showForm||editCard) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={e=>{if(e.target===e.currentTarget){setShowForm(false);setEditCard(null);}}}>
          <div className="w-full max-w-2xl bg-[#0A0D3A] border border-[#1A2070] rounded-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <h2 className="font-bold text-white text-lg">{editCard?"Edit project":"New project"}</h2>
              <button onClick={()=>{setShowForm(false);setEditCard(null);}} className="text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <F label="Book title *" k="title" placeholder="e.g. Whiskey & Lies"/>
                <F label="Subtitle" k="subtitle" placeholder="e.g. Sultry Secrets Book 4"/>
                <F label="Author" k="author" placeholder="e.g. E.A. Harper"/>
                <F label="Co-narrator" k="co_narrator" placeholder="e.g. Ann Dahlia"/>
                <F label="Cover image URL" k="cover_url" placeholder="https://..."/>
                <F label="Audible / Amazon link" k="audible_link" placeholder="https://..."/>
                <F label="Authors Republic link" k="ar_link" placeholder="https://..."/>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Stage</span>
                  <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                    {COLUMNS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <F label="Deadline" k="deadline" type="date"/>
              </div>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Book description (public)</span>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}
                  placeholder="Shown on Narrated Works page..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none"/>
              </label>

              {/* Tags */}
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-2">Tags</span>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map(t=>(
                    <span key={t} className="inline-flex items-center gap-1 text-xs bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/25 px-2 py-0.5 rounded-full">
                      {t}<button type="button" onClick={()=>removeTag(t)} className="text-[#D4AF37]/50 hover:text-[#D4AF37]">✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTag();}}}
                    placeholder="e.g. Dark Romance" className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40"/>
                  <button type="button" onClick={addTag} className="bg-white/8 hover:bg-white/15 text-white text-xs px-3 py-2 rounded-lg transition">Add</button>
                </div>
              </div>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Private notes</span>
                <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2}
                  placeholder="Internal production notes..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none"/>
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Note to author (on their link)</span>
                <textarea value={form.author_notes} onChange={e=>setForm(p=>({...p,author_notes:e.target.value}))} rows={2}
                  placeholder="Visible to the author on their private link..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none"/>
              </label>

              {/* Links */}
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-2">Extra links</span>
                {form.links.map((l,i)=>(
                  <div key={i} className="flex items-center gap-2 mb-1.5 text-xs">
                    <span className="text-[#D4AF37]/70 flex-1 truncate">{l.label}: {l.url}</span>
                    <button type="button" onClick={()=>removeLink(i)} className="text-red-400/50 hover:text-red-400">✕</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} placeholder="Label"
                    className="w-28 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40"/>
                  <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://..."
                    className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40"/>
                  <button type="button" onClick={addLink} className="bg-white/8 hover:bg-white/15 text-white text-xs px-3 py-2 rounded-lg transition">Add</button>
                </div>
              </div>

              {/* Released notice */}
              {form.status==="released" && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-xs text-emerald-300">
                  ✓ When saved as Released, this project will automatically be added to the public Narrated Works page.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving||!form.title.trim()}
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold py-3 rounded-full text-sm transition disabled:opacity-50">
                  {saving?"Saving…":editCard?"Save changes":"Create project"}
                </button>
                <button onClick={()=>{setShowForm(false);setEditCard(null);}}
                  className="border border-white/20 text-white/60 hover:text-white px-6 py-3 rounded-full text-sm transition">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="px-4 sm:px-6 py-6 overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-6">
          {COLUMNS.map(col => (
            <div key={col.id}
              onDragOver={e=>{e.preventDefault();setDragOver(col.id);}}
              onDrop={e=>drop(e,col.id)}
              onDragLeave={()=>setDragOver(null)}
              className={`w-72 flex-shrink-0 rounded-2xl border ${col.color} transition-all duration-200 ${dragOver===col.id?"ring-2 ring-[#D4AF37]/40 scale-[1.01]":""}`}>

              <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${col.dot}`}/>
                  <h2 className={`text-xs font-bold uppercase tracking-wider ${col.text}`}>{col.label}</h2>
                </div>
                <span className="text-xs text-white/25 font-mono">{cards.filter(c=>c.status===col.id).length}</span>
              </div>

              <div className="px-3 pb-3 space-y-3">
                {loading ? <div className="h-24 rounded-xl bg-white/5 animate-pulse"/> :
                cards.filter(c=>c.status===col.id).sort((a,b)=>a.sort_order-b.sort_order).map(card=>(
                  <div key={card.id} draggable onDragStart={()=>setDragId(card.id)}
                    className={`rounded-xl bg-[#06082E]/80 border border-white/8 hover:border-white/15 transition-all cursor-grab active:cursor-grabbing shadow-md group ${dragId===card.id?"opacity-30 scale-95":""} ${syncing===card.id?"opacity-60":""}`}>

                    {card.cover_url && (
                      <div className="h-32 rounded-t-xl overflow-hidden">
                        <img src={card.cover_url} alt={card.title} className="w-full h-full object-cover object-top"/>
                      </div>
                    )}

                    <div className="p-3">
                      <p className="font-semibold text-sm text-white leading-snug">{card.title}</p>
                      {card.subtitle && <p className="text-[11px] text-white/40 mt-0.5">{card.subtitle}</p>}
                      {card.author && <p className="text-xs text-[#D4AF37]/80 mt-1 font-medium">{card.author}</p>}
                      {card.co_narrator && <p className="text-[10px] text-white/30 mt-0.5">with {card.co_narrator}</p>}
                      <Link href={`/board/card/${card.id}`}
                        className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors font-semibold"
                        onClick={e => e.stopPropagation()}>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                        {card.chapters?.length > 0 ? `${card.chapters.filter((c: {status:string}) => c.status === "live").length}/${card.chapters.length} chapters` : "Track chapters"}
                      </Link>

                      {/* Tags */}
                      {card.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {card.tags.slice(0,3).map(t=>(
                            <span key={t} className="text-[9px] uppercase tracking-wide font-bold text-white/40 bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      )}

                      {/* Deadline */}
                      {card.deadline && (
                        <div className="flex items-center gap-1 mt-2">
                          <svg className="h-3 w-3 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          <span className={`text-[10px] ${new Date(card.deadline)<new Date()&&col.id!=="released"?"text-red-400":"text-white/30"}`}>
                            {new Date(card.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                          </span>
                        </div>
                      )}

                      {/* Expand */}
                      {(card.notes||card.links?.length>0) && (
                        <button type="button" onClick={()=>setExpanded(expanded===card.id?null:card.id)}
                          className="mt-2 text-[10px] text-white/25 hover:text-white/50 flex items-center gap-1 transition-colors">
                          <svg className={`h-3 w-3 transition-transform ${expanded===card.id?"rotate-180":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                          {expanded===card.id?"Less":"More"}
                        </button>
                      )}
                      {expanded===card.id && (
                        <div className="mt-2 space-y-1.5">
                          {card.notes && <p className="text-xs text-white/45 leading-relaxed">{card.notes}</p>}
                          {card.links?.map((l,i)=>(
                            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors">
                              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                              {l.label}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Card footer */}
                      <div className="mt-3 pt-2.5 border-t border-white/6 flex items-center justify-between gap-2">
                        <select value={card.status}
                          onChange={async e=>{
                            const s=e.target.value;
                            setCards(p=>p.map(c=>c.id===card.id?{...c,status:s}:c));
                            await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:card.id,status:s})});
                            if(s==="released") await syncToBooks({...card,status:s});
                          }}
                          className="text-[10px] bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white/50 appearance-none focus:outline-none hover:border-white/20 transition cursor-pointer">
                          {COLUMNS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>

                        <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          {/* Author link */}
                          <button type="button" onClick={()=>copyLink(card.author_token)} title="Copy author link"
                            className="text-white/40 hover:text-[#D4AF37] transition-colors">
                            {copied===card.author_token
                              ? <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                              : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>}
                          </button>
                          {/* Sync to public */}
                          {card.status==="released" && (
                            <button type="button" onClick={()=>syncToBooks(card)} title="Sync to public Narrated Works"
                              className="text-white/40 hover:text-emerald-400 transition-colors">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </button>
                          )}
                          <button type="button" onClick={()=>startEdit(card)} className="text-white/40 hover:text-white transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button type="button" onClick={()=>del(card.id)} className="text-white/40 hover:text-red-400 transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button onClick={()=>{setShowForm(true);setEditCard(null);setForm({...EMPTY,status:col.id});}}
                  className="w-full py-2.5 text-xs text-white/20 hover:text-white/50 hover:bg-white/5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                  Add to {col.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
