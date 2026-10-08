"use client";

import { useEffect, useState } from "react";
import { AFFILIATE } from "@/lib/brand";
import { formatBytes, formatUsd } from "@/lib/shared";

export default function SettingsPage() {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [openRouterConfigured, setOpenRouterConfigured] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [spendCap, setSpendCap] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [stats, setStats] = useState<{ diskBytes: number; outputs: number; allTime: { usd: number } } | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, st] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/stats", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setKeyId(s.keyId ?? "");
      setHasSecret(Boolean(s.hasSecret));
      setOpenRouterConfigured(Boolean(s.openRouterConfigured));
      setSource(s.source ?? null);
      setMaxConcurrent(s.maxConcurrent ?? 4);
      setSpendCap(s.spendCap ?? "");
      setStats(st);
    })();
  }, []);

  async function save() {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId, keySecret, maxConcurrent, spendCap }),
    });
    if (!response.ok) { const data = await response.json().catch(()=>({})); setSaveError(data.error ?? 'Could not save settings.'); setSaved(false); return; }
    setSaveError('');
    if (keySecret.trim()) {
      setHasSecret(true);
      setSource("database");
    }
    setKeySecret("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex h-[68px] items-center border-b border-edge-soft px-7">
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="mx-auto max-w-2xl space-y-7 px-6 py-7">
        <section className="space-y-2 rounded-xl border border-edge-soft bg-panel p-5">
          <h2 className="text-base font-semibold">OpenRouter</h2>
          <p className="text-sm text-muted">{openRouterConfigured ? "API key loaded from the server environment." : "Add OPENROUTER_API_KEY to .env and restart the server."}</p>
          <p className="text-xs text-faint">Seedance 2.5 sources and results stay in this project's local storage. Image and audio references are sent with the generation request; no Higgsfield storage key is needed in local inline mode. Estimates exclude platform fees and taxes; completed jobs record the API usage cost.</p>
        </section>
        <section className="space-y-4 rounded-xl border border-edge-soft bg-panel p-5">
          <div>
            <h2 className="text-base font-semibold">Higgsfield API key</h2>
            <p className="mt-1 text-xs leading-relaxed text-faint">
              A key has two parts. Create one in the{" "}
              <a
                href={AFFILIATE.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline decoration-dotted underline-offset-2 hover:text-text"
              >
                Higgsfield Console
              </a>
              , then paste both here. They are stored in this machine&apos;s local database,
              and the secret is never sent to the browser.
            </p>
          </div>

          {source === "environment" && (
            <p className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5 text-xs leading-relaxed text-muted">
              A key is already loaded from <code className="text-text">.env.local</code>, so
              there is nothing to do here. Entering one below overrides it for this machine.
            </p>
          )}

          <Field label="Key ID">
            <input
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent/50"
            />
          </Field>

          <Field label="Key secret">
            <input
              type="password"
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
              placeholder={hasSecret ? "•••••••• (saved — leave blank to keep)" : "64-character secret"}
              className="w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent/50"
            />
          </Field>
        </section>

        <section className="space-y-4 rounded-xl border border-edge-soft bg-panel p-5">
          <h2 className="text-base font-semibold">Limits</h2>

          <Field
            label="Concurrent requests"
            hint="Higgsfield rejects requests beyond your account's limit — 4 by default. Extra jobs queue locally instead of failing."
          >
            <input
              type="number"
              min={1}
              max={16}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              className="w-28 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
            />
          </Field>

          <Field
            label="Spend cap (USD per 30 days)"
            hint="Blocks new generations once estimated spend passes this. Leave empty for no cap."
          >
            <input
              type="number"
              min={0}
              step="0.01"
              value={spendCap}
              onChange={(e) => setSpendCap(e.target.value)}
              placeholder="no cap"
              className="w-36 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
            />
          </Field>
        </section>

        <section className="rounded-xl border border-edge-soft bg-panel p-5">
          <h2 className="text-base font-semibold">Storage</h2>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Higgsfield deletes generated files after about seven days, so every output is
            downloaded to <code className="text-muted">storage/media</code> in this project and
            served from there.
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-edge-soft pt-3 text-xs">
            <div>
              <dt className="text-faint">Files</dt>
              <dd className="mt-0.5 font-mono text-text">{stats?.outputs ?? 0}</dd>
            </div>
            <div>
              <dt className="text-faint">On disk</dt>
              <dd className="mt-0.5 font-mono text-text">{formatBytes(stats?.diskBytes ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-faint">Spent all time</dt>
              <dd className="mt-0.5 font-mono text-text">{formatUsd(stats?.allTime.usd ?? 0)}</dd>
            </div>
          </dl>
        </section>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="rounded-lg bg-accent px-5 py-2.5 text-base font-bold text-accent-ink transition-opacity hover:opacity-90"
          >
            Save
          </button>
          {saved && <span className="text-sm text-accent">Saved</span>}
        </div>
        {saveError && <p role="alert" className="text-sm text-muted">{saveError}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}
