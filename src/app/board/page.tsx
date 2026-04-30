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
  chapters: { status: string }[];
  word_count: number;
  first15_due: string;
  pfh_rate: number;
  payment_type: string; // pfh | rs | rs_plus
  first_15_complete: boolean;
}

const EMPTY: Omit<BoardCard, "id"|"author_token"|"sort_order"> = {
  title:"", author:"", cover_url:"", status:"audition", deadline:"",
  notes:"", author_notes:"", links:[], co_narrator:"",
  subtitle:"", tags:[], description:"", audible_link:"", ar_link:"", chapters:[], word_count:0, first15_due:"", pfh_rate:0, payment_type:"pfh", first_15_complete:false,
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
  const [coNarratorNames, setCoNarratorNames] = useState<string[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importBooks, setImportBooks] = useState<{id:string;title:string;author:string;cover_url:string;link:string;ar_link?:string;subtitle?:string;tags?:string[];description?:string;co_narrator?:string[];category:string}[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importingId, setImportingId] = useState<string|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, cnr] = await Promise.all([fetch("/api/board"), fetch("/api/co-narrators")]);
      const d = await r.json(); setCards(d.cards||[]);
      const cn = await cnr.json(); setCoNarratorNames((cn.co_narrators||[]).map((n:{name:string})=>n.name).sort());
    } catch { setError("Failed to load."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getEarliestDate = (card: BoardCard) => {
    // Once First 15 is done its due date no longer drives sort priority
    const dates = [card.first_15_complete ? null : card.first15_due, card.deadline]
      .filter(Boolean).map(d => {
        const [y,m,dy] = d!.split("-"); return new Date(+y,+m-1,+dy).getTime();
      });
    return dates.length ? Math.min(...dates) : Infinity;
  };

  const sortCards = (a: BoardCard, b: BoardCard) => {
    const diff = getEarliestDate(a) - getEarliestDate(b);
    return diff !== 0 ? diff : a.sort_order - b.sort_order;
  };

  const col = (id: string) => cards.filter(c=>c.status===id).sort(sortCards);

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

  const cleanForm = (f: typeof form) => ({
    ...f,
    // Only save deadline/first15 if all parts are present
    deadline: f.deadline && f.deadline.split("-").filter(Boolean).length === 3 && !f.deadline.startsWith("-") ? f.deadline : "",
    first15_due: f.first15_due && f.first15_due.split("-").filter(Boolean).length === 3 && !f.first15_due.startsWith("-") ? f.first15_due : "",
  });

  const save = async () => {
    setSaving(true);
    try {
      if (editCard) {
        const r = await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editCard.id,...cleanForm(form)})});
        const d = await r.json();
        // Use returned card if available, otherwise merge form data into existing card
        const updatedCard = d.card || {...editCard, ...cleanForm(form)};
        setCards(p=>p.map(c=>c.id===editCard.id ? updatedCard : c));
        setEditCard(null);
      } else {
        const r = await fetch("/api/board",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...cleanForm(form),sort_order:col(form.status).length})});
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
      audible_link:card.audible_link||"",ar_link:card.ar_link||"",chapters:card.chapters||[],
      word_count:card.word_count||0,first15_due:card.first15_due||"",pfh_rate:card.pfh_rate||0,payment_type:card.payment_type||"pfh",first_15_complete:card.first_15_complete||false});
    setShowForm(false);
  };

  const loadImportBooks = async () => {
    setImportLoading(true);
    try {
      const r = await fetch("/api/books");
      const d = await r.json();
      // Filter out books already on the board
      const boardTitles = new Set(cards.map(c => c.title.toLowerCase()));
      setImportBooks((d.books || []).filter((b:{title:string}) => !boardTitles.has(b.title.toLowerCase())));
    } catch { setError("Failed to load books."); }
    setImportLoading(false);
  };

  const importBook = async (book: typeof importBooks[0]) => {
    setImportingId(book.id);
    const statusMap: Record<string,string> = { "coming-soon": "contracted", "in-progress": "recording", "completed": "released" };
    try {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: book.title,
          subtitle: book.subtitle || "",
          author: book.author,
          cover_url: book.cover_url || "",
          audible_link: book.link || "",
          ar_link: book.ar_link || "",
          tags: book.tags || [],
          description: book.description || "",
          co_narrator: Array.isArray(book.co_narrator) ? (book.co_narrator[0] || "") : "",
          status: statusMap[book.category] || "contracted",
          sort_order: col(statusMap[book.category] || "contracted").length,
        }),
      });
      const d = await r.json();
      if (d.card) {
        setCards(p => [...p, d.card]);
        setImportBooks(p => p.filter(b => b.id !== book.id));
      }
    } catch { setError("Import failed."); }
    setImportingId(null);
  };

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-cover", { method: "POST", body: fd });
      const data = await res.json();
      if (data.coverUrl) setForm(p => ({ ...p, cover_url: data.coverUrl }));
      else setError(data.error || "Cover upload failed.");
    } catch { setError("Cover upload failed."); }
    setUploadingCover(false);
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

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={e=>{if(e.target===e.currentTarget) setShowImport(false);}}>
          <div className="w-full max-w-lg bg-[#0A0D3A] border border-[#1A2070] rounded-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <div>
                <h2 className="font-bold text-white text-lg">Import from books</h2>
                <p className="text-xs text-white/40 mt-0.5">Add existing books to the production board</p>
              </div>
              <button onClick={()=>setShowImport(false)} className="text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-4">
              {importLoading ? (
                <div className="py-10 flex justify-center"><div className="h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/></div>
              ) : importBooks.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-white/30 text-sm">All books are already on the board.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {importBooks.map(book => (
                    <div key={book.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#06082E] p-3 hover:border-white/15 transition-colors">
                      {book.cover_url && <img src={book.cover_url} alt={book.title} className="h-12 w-8 object-cover rounded shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{book.title}</p>
                        <p className="text-xs text-[#D4AF37]/70">{book.author}</p>
                        <p className="text-[10px] text-white/30 capitalize">{book.category?.replace("-"," ")}</p>
                      </div>
                      <button type="button" onClick={()=>importBook(book)} disabled={importingId===book.id}
                        className="shrink-0 text-xs font-bold bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
                        {importingId===book.id ? "…" : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Book title *</span><input type="text" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Whiskey &amp; Lies" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Subtitle</span><input type="text" value={form.subtitle} onChange={e=>setForm(p=>({...p,subtitle:e.target.value}))} placeholder="e.g. Sultry Secrets Book 4" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Author</span><input type="text" value={form.author} onChange={e=>setForm(p=>({...p,author:e.target.value}))} placeholder="e.g. E.A. Harper" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Co-narrator</span>
                  <select value={form.co_narrator} onChange={e=>setForm(p=>({...p,co_narrator:e.target.value}))}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                    <option value="">— None —</option>
                    {coNarratorNames.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Cover image</span>
                  <div className="mt-1.5 space-y-2">
                    <label className={`flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer transition-colors ${uploadingCover ? "border-[#D4AF37]/40 bg-[#D4AF37]/5" : "border-white/15 hover:border-[#D4AF37]/30 hover:bg-white/5"}`}>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { if(e.target.files?.[0]) uploadCover(e.target.files[0]); }} />
                      {uploadingCover ? (
                        <div className="flex items-center gap-2 text-xs text-[#D4AF37]">
                          <div className="h-3.5 w-3.5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/>
                          Uploading…
                        </div>
                      ) : form.cover_url ? (
                        <div className="flex items-center gap-2">
                          <img src={form.cover_url} alt="Cover" className="h-10 w-7 object-cover rounded"/>
                          <span className="text-xs text-white/50">Click to replace</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-white/35">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          Upload cover image
                        </div>
                      )}
                    </label>
                    <input value={form.cover_url} onChange={e=>setForm(p=>({...p,cover_url:e.target.value}))}
                      placeholder="Or paste image URL..."
                      className="w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white/60 placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </div>
                </label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Audible / Amazon link</span><input type="text" value={form.audible_link} onChange={e=>setForm(p=>({...p,audible_link:e.target.value}))} placeholder="https://..." className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Authors Republic link</span><input type="text" value={form.ar_link} onChange={e=>setForm(p=>({...p,ar_link:e.target.value}))} placeholder="https://..." className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Stage</span>
                  <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                    {COLUMNS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-1.5">Deadline</span>
                  <div className="flex gap-2">
                    <select value={form.deadline ? form.deadline.split("-")[1] : ""}
                      onChange={e => { const p = form.deadline?.split("-") || [new Date().getFullYear().toString(),"","01"]; setForm(f=>({...f,deadline:e.target.value?`${p[0]||new Date().getFullYear()}-${e.target.value}-${p[2]||"01"}`:""}))} }
                      className="flex-1 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Month</option>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=>(
                        <option key={m} value={String(i+1).padStart(2,"0")}>{m}</option>
                      ))}
                    </select>
                    <select value={form.deadline ? form.deadline.split("-")[2] : ""}
                      onChange={e => { const p = form.deadline?.split("-") || [new Date().getFullYear().toString(),"01",""]; setForm(f=>({...f,deadline:e.target.value?`${p[0]||new Date().getFullYear()}-${p[1]||"01"}-${e.target.value}`:""}))} }
                      className="w-20 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Day</option>
                      {Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0")).map(d=>(
                        <option key={d} value={d}>{parseInt(d)}</option>
                      ))}
                    </select>
                    <select value={form.deadline ? form.deadline.split("-")[0] : ""}
                      onChange={e => { const p = form.deadline?.split("-") || ["","01","01"]; setForm(f=>({...f,deadline:e.target.value?`${e.target.value}-${p[1]||"01"}-${p[2]||"01"}`:""}))} }
                      className="w-24 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Year</option>
                      {Array.from({length:6},(_,i)=>new Date().getFullYear()+i).map(y=>(
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Production details */}
              <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4 space-y-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 font-medium">Production details <span className="text-white/20 normal-case tracking-normal text-[10px]">— private</span></p>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Word count</span>
                    <input type="number" value={form.word_count || ""} onChange={e=>setForm(p=>({...p,word_count:parseInt(e.target.value)||0}))} placeholder="e.g. 90000" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Payment type</span>
                    <select value={form.payment_type} onChange={e=>setForm(p=>({...p,payment_type:e.target.value}))} className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="pfh">PFH (Per Finished Hour)</option>
                      <option value="rs">Royalty Share (RS)</option>
                      <option value="rs_plus">Royalty Share Plus (RS+)</option>
                    </select>
                  </label>
                </div>
                {(form.payment_type === "pfh" || form.payment_type === "rs_plus") && (
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">{form.payment_type === "rs_plus" ? "RS+ stipend ($ PFH)" : "PFH rate ($)"}</span>
                    <input type="number" value={form.pfh_rate || ""} onChange={e=>setForm(p=>({...p,pfh_rate:parseFloat(e.target.value)||0}))} placeholder={form.payment_type === "rs_plus" ? "e.g. 100" : "e.g. 250"} className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </label>
                )}
                <div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-1.5">First 15 due date</span>
                  <div className="flex gap-2">
                    <select value={form.first15_due ? form.first15_due.split("-")[1] : ""} onChange={e => { const p = form.first15_due?.split("-") || [new Date().getFullYear().toString(),"","01"]; setForm(f=>({...f,first15_due:e.target.value?`${p[0]||new Date().getFullYear()}-${e.target.value}-${p[2]||"01"}`:""}))} } className="flex-1 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Month</option>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=><option key={m} value={String(i+1).padStart(2,"0")}>{m}</option>)}
                    </select>
                    <select value={form.first15_due ? form.first15_due.split("-")[2] : ""} onChange={e => { const p = form.first15_due?.split("-") || [new Date().getFullYear().toString(),"01",""]; setForm(f=>({...f,first15_due:e.target.value?`${p[0]||new Date().getFullYear()}-${p[1]||"01"}-${e.target.value}`:""}))} } className="w-20 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Day</option>
                      {Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0")).map(d=><option key={d} value={d}>{parseInt(d)}</option>)}
                    </select>
                    <select value={form.first15_due ? form.first15_due.split("-")[0] : ""} onChange={e => { const p = form.first15_due?.split("-") || ["","01","01"]; setForm(f=>({...f,first15_due:e.target.value?`${e.target.value}-${p[1]||"01"}-${p[2]||"01"}`:""}))} } className="w-24 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Year</option>
                      {(() => { const base=Array.from({length:6},(_,i)=>new Date().getFullYear()+i); const ex=form.first15_due?parseInt(form.first15_due.split("-")[0]):null; const yrs=ex&&!base.includes(ex)?[ex,...base]:base; return yrs.map(y=><option key={y} value={String(y)}>{y}</option>); })()}
                    </select>
                  </div>
                </div>
                {form.word_count > 0 && (
                  <div className="rounded-lg bg-[#D4AF37]/5 border border-[#D4AF37]/15 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#D4AF37]/60 font-medium mb-1">{form.payment_type==="rs"?"Royalty Share":form.payment_type==="rs_plus"?"RS+ — Estimated upfront":"Estimated earnings"}</p>
                    {form.payment_type==="rs" ? <p className="text-sm text-[#D4AF37]">~{(form.word_count/9400).toFixed(1)} finished hours · earnings depend on sales</p>
                    : form.pfh_rate>0 ? <p className="text-lg font-bold text-[#D4AF37]">${((form.word_count/9400)*form.pfh_rate).toLocaleString("en-US",{maximumFractionDigits:0})} <span className="text-xs font-normal text-white/30">~{(form.word_count/9400).toFixed(1)} hrs × ${form.pfh_rate}/hr{form.payment_type==="rs_plus"?" + royalties":""}</span></p>
                    : <p className="text-sm text-[#D4AF37]/60">Enter rate to estimate</p>}
                  </div>
                )}
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

              {/* Author link — only shown when editing existing card */}
              {editCard && (
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium mb-2">Author project link</p>
                  <p className="text-xs text-white/50 mb-3">Share this private link with the author so they can track their project status.</p>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white/60 font-mono truncate">
                      {typeof window !== "undefined" ? `${window.location.origin}/board/${editCard.author_token}` : `/board/${editCard.author_token}`}
                    </div>
                    <button type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/board/${editCard.author_token}`);
                        setCopied(editCard.author_token);
                        setTimeout(() => setCopied(null), 2000);
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors shrink-0 ${copied === editCard.author_token ? "bg-emerald-500 text-white" : "bg-[#D4AF37] text-black hover:bg-[#E0C15A]"}`}>
                      {copied === editCard.author_token ? "✓ Copied" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}

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
          {COLUMNS.map(column => (
            <div key={column.id}
              onDragOver={e=>{e.preventDefault();setDragOver(column.id);}}
              onDrop={e=>drop(e,column.id)}
              onDragLeave={()=>setDragOver(null)}
              className={`w-72 flex-shrink-0 rounded-2xl border ${column.color} transition-all duration-200 ${dragOver===column.id?"ring-2 ring-[#D4AF37]/40 scale-[1.01]":""}`}>

              <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${column.dot}`}/>
                  <h2 className={`text-xs font-bold uppercase tracking-wider ${column.text}`}>{column.label}</h2>
                </div>
                <span className="text-xs text-white/25 font-mono">{cards.filter(c=>c.status===column.id).length}</span>
              </div>

              <div className="px-3 pb-3 space-y-3">
                {loading ? <div className="h-24 rounded-xl bg-white/5 animate-pulse"/> :
                cards.filter(c=>c.status===column.id).sort(sortCards).map(card=>(
                  <div key={card.id} draggable onDragStart={()=>setDragId(card.id)}
                    className={`rounded-xl bg-[#06082E]/80 border border-white/8 hover:border-white/15 transition-all cursor-grab active:cursor-grabbing shadow-md group ${dragId===card.id?"opacity-30 scale-95":""} ${syncing===card.id?"opacity-60":""}`}>

                    <Link href={`/board/card/${card.id}`} onClick={e=>e.stopPropagation()}>
                      {card.cover_url ? (
                        <div className="h-32 rounded-t-xl overflow-hidden relative group/cover">
                          <img src={card.cover_url} alt={card.title} className="w-full h-full object-cover object-top transition-transform duration-300 group-hover/cover:scale-105"/>
                          <div className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                            <svg className="h-8 w-8 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </div>
                          {card.first_15_complete && (
                            <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow">
                              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                              15
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="h-16 rounded-t-xl bg-[#0A0D3A] flex items-center justify-center border-b border-white/5 hover:bg-[#0D1245] transition-colors">
                          <span className="text-xs text-white/20 flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                            Open details
                          </span>
                        </div>
                      )}
                    </Link>

                    <div className="p-3">
                      <p className="font-semibold text-sm text-white leading-snug">{card.title}</p>
                      {card.subtitle && <p className="text-[11px] text-white/40 mt-0.5">{card.subtitle}</p>}
                      {card.author && <p className="text-xs text-[#D4AF37]/80 mt-1 font-medium">{card.author}</p>}
                      {card.co_narrator && <p className="text-[10px] text-white/30 mt-0.5">with {(() => { try { const p = JSON.parse(card.co_narrator); return Array.isArray(p) ? p.join(", ") : card.co_narrator; } catch { return card.co_narrator; } })()}</p>}
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
                          <span className={`text-[10px] ${(() => { const [y,m,d] = card.deadline.split("-"); return new Date(+y,+m-1,+d) < new Date() && column.id !== "released"; })() ? "text-red-400" : "text-white/30"}`}>
                            Due: {(() => { const [y,m,d] = card.deadline.split("-"); return new Date(+y, +m-1, +d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); })()}
                          </span>
                        </div>
                      )}
                      {card.first15_due && (
                        <div className="flex items-center gap-1 mt-1">
                          <svg className="h-3 w-3 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.131a1 1 0 01-1.447.894L15 14M3 8h12a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 011-1z"/></svg>
                          <span className={`text-[10px] ${(() => { const [y,m,d] = card.first15_due.split("-"); return new Date(+y,+m-1,+d) < new Date() && column.id === "contracted"; })() ? "text-orange-400" : "text-white/30"}`}>
                            First 15: {(() => { const [y,m,d] = card.first15_due.split("-"); return new Date(+y, +m-1, +d).toLocaleDateString("en-US",{month:"short",day:"numeric"}); })()}
                          </span>
                        </div>
                      )}
                      {card.word_count > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] text-white/25">{card.word_count.toLocaleString()} words</span>
                          {card.pfh_rate > 0 && <span className="text-[10px] text-[#D4AF37]/50">· ${((card.word_count/9400)*card.pfh_rate).toFixed(0)} est.</span>}
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
                          className="text-[10px] bg-[#06082E] border border-white/10 rounded-lg px-2 py-1 text-white/50 appearance-none focus:outline-none hover:border-white/20 transition cursor-pointer">
                          {COLUMNS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>

                        <div className="flex items-center gap-2">
                          {/* First 15 toggle */}
                          <button type="button"
                            onClick={async e=>{
                              e.preventDefault(); e.stopPropagation();
                              const v=!card.first_15_complete;
                              setCards(p=>p.map(c=>c.id===card.id?{...c,first_15_complete:v}:c));
                              await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:card.id,first_15_complete:v})});
                            }}
                            title={card.first_15_complete?"First 15 complete":"Mark First 15 done"}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${
                              card.first_15_complete
                                ?"bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                :"text-white/30 border-white/10 hover:border-white/30 hover:text-white/60"
                            }`}>
                            {card.first_15_complete
                              ?<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                              :<span className="h-3 w-3 rounded-sm border border-current inline-block"/>
                            }
                            15
                          </button>

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
                  </div>
                ))}


              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
