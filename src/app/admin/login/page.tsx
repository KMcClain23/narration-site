"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin Login Page component.
 * Provides a simple interface to enter the secret key for dashboard access.
 */
export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if password has been entered
    if (password.trim().length > 0) {
      // Redirect to the stats page with the key in the query string
      router.push(`/admin/stats?key=${encodeURIComponent(password)}`);
    } else {
      setError(true);
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
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Admin Key
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              className="w-full bg-[#050814] border border-[#1A2550] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70 transition"
              placeholder="••••••••"
              required
            />
            {error && (
              <p className="text-red-400 text-xs italic mt-2">
                Access key is required to enter.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-[#D4AF37] text-black font-bold py-3 rounded-lg hover:bg-[#E0C15A] transition active:scale-[0.98]"
          >
            Authenticate
          </button>
        </form>
        
        <p className="mt-8 text-center text-[10px] text-white/20 uppercase tracking-widest">
          Secure Access Only
        </p>
      </div>
    </main>
  );
}