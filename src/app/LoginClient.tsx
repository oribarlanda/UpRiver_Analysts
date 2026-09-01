"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppBrand from "@/components/AppBrand";
import { getRoleLandingPath } from "@/lib/roleRouting";
import { EMPLOYEE_LABELS, Role } from "@/lib/types";

const ROLES: { role: Role; label: string; color: string }[] = [
  { role: "hila", label: EMPLOYEE_LABELS.hila, color: "bg-hila" },
  { role: "yaara", label: EMPLOYEE_LABELS.yaara, color: "bg-yaara" },
  { role: "omer", label: EMPLOYEE_LABELS.omer, color: "bg-omer" },
  { role: "admin", label: "מנהל", color: "bg-slate-700" },
];

export default function LoginClient() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedRole) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole, pin }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "שגיאה, נסי שוב.");
        setLoading(false);
        return;
      }

      router.push(getRoleLandingPath(selectedRole));
    } catch {
      setError("שגיאת רשת. נסי שוב.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-5 px-4 py-8">
      <AppBrand />

      {!selectedRole ? (
        <div className="grid w-full grid-cols-2 gap-3">
          {ROLES.map((item) => (
            <button
              key={item.role}
              type="button"
              onClick={() => {
                setSelectedRole(item.role);
                setError(null);
                setPin("");
              }}
              className={`${item.color} rounded-2xl px-4 py-5 text-lg font-semibold text-white shadow-sm transition active:scale-95`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={handleLogin} className="w-full space-y-4">
          <div className="text-center text-lg font-medium">
            שלום {ROLES.find((item) => item.role === selectedRole)?.label}
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="קוד PIN"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-xl tracking-widest focus:border-slate-500 focus:outline-none"
          />
          {error && (
            <p className="text-center text-sm text-red-600">{error}</p>
          )}
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
