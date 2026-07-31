"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EMPLOYEE_LABELS, Role } from "@/lib/types";

const ROLES: { role: Role; label: string; color: string }[] = [
  { role: "hila", label: EMPLOYEE_LABELS.hila, color: "bg-hila" },
  { role: "yaara", label: EMPLOYEE_LABELS.yaara, color: "bg-yaara" },
  { role: "omer", label: EMPLOYEE_LABELS.omer, color: "bg-omer" },
  { role: "admin", label: "מנהל", color: "bg-slate-700" },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRole) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה, נסי שוב.");
        setLoading(false);
        return;
      }
      if (selectedRole === "admin") {
        router.push("/admin");
      } else {
        router.push("/week/current");
      }
    } catch {
      setError("שגיאת רשת. נסי שוב.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">שיבוץ שבועי</h1>
        <p className="mt-1 text-sm text-slate-500">בחרי משתמש כדי להמשיך</p>
      </div>

      {!selectedRole ? (
        <div className="grid w-full grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <button
              key={r.role}
              onClick={() => {
                setSelectedRole(r.role);
                setError(null);
                setPin("");
              }}
              className={`${r.color} rounded-2xl px-4 py-6 text-lg font-semibold text-white shadow-sm transition active:scale-95`}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={handleLogin} className="w-full space-y-4">
          <div className="text-center text-lg font-medium">
            שלום {ROLES.find((r) => r.role === selectedRole)?.label}
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="קוד PIN"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-xl tracking-widest focus:border-slate-500 focus:outline-none"
          />
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || pin.length === 0}
            className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold text-white shadow-sm transition disabled:opacity-50"
          >
            {loading ? "מתחברת..." : "כניסה"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole(null);
              setPin("");
              setError(null);
            }}
            className="w-full text-center text-sm text-slate-500 underline"
          >
            חזרה לבחירת משתמש
          </button>
        </form>
      )}
    </main>
  );
}
