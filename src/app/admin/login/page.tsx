"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || data?.message || "Login failed.");
        setLoading(false);
        return;
      }

      // Success: cookie is set by the API route.
      router.push("/admin/stats");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050814] flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-md bg-[#0B1224] border border-[#1A2550] rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">Dean Miller Narration</h2>
          <p className="text-white/50 text-sm mt-2 uppercase tracking-widest font-semibold">
            Admin Dashboard Login
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Admin Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-[#050814] border border-[#1A2550] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70 transition"
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#D4AF37] text-black font-bold py-3 rounded-lg hover:bg-[#E0C15A] transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Authenticating..." : "Authenticate"}
          </button>
        </form>

        <p className="mt-8 text-center text-[10px] text-white/20 uppercase tracking-widest">
          Secure Access Only
        </p>
      </div>
    </main>
  );
}