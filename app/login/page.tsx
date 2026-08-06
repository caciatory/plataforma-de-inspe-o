"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setLoading(false);
      setError("Email ou palavra-passe inválidos.");
      return;
    }

    const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).single();
    setLoading(false);

    router.push(profile?.role === "admin" ? "/admin" : "/inspections");
    router.refresh();
  }

  return (
    <main className="login-screen">
      <form onSubmit={handleSubmit} className="panel login-card">
        <h1>Check Auto</h1>
        <div className="field">
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password" className="label">
            Palavra-passe
          </label>
          <input
            id="password"
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary login-card__submit" disabled={loading}>
          {loading ? "A entrar..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
