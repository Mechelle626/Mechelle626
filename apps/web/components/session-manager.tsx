"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useFormatLocale } from "./localization";
import { useState, useEffect } from "react";
import { MonitorSmartphone, LogOut, LoaderCircle } from "lucide-react";
type Session = {
  id: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  remember: boolean;
  current: boolean;
};
export function LogoutButton() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Localized>
      {
        <div>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth/logout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (!r.ok) throw new Error(bcText("ui.c4eb2c87c1d2c541"));
                window.location.assign("/login");
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <LogOut size={14} />
            {busy ? bcText("ui.08c6bd357b7d7b81") : bcText("ui.48f0d3d397d49f13")}
          </button>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </div>
      }
    </Localized>
  );
}
export default function SessionManager() {
  const locale = useFormatLocale();
  const [sessions, setSessions] = useState<Session[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    const r = await fetch("/api/auth/sessions");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setSessions(d.sessions);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function revoke(id?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(
        `/api/auth/${id ? "revoke-session" : "revoke-other-sessions"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id ? { id } : {}),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.current) {
        window.location.assign("/login");
        return;
      }
      setNotice(d.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Localized>
      {
        <>
          <h2>{bcText("ui.ae54860b4078a98a")}</h2>
          <p>{" " + bcText("ui.d04184d8471529aa") + " "}</p>
          {error && (
            <p className="message error-message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="message success-message" role="status">
              {notice}
            </p>
          )}
          {loading ? (
            <p className="empty-state">
              <LoaderCircle size={18} className="spin" />{" " + bcText("ui.c4141f554a0c3146") + " "}</p>
          ) : (
            sessions.map((s) => (
              <div className="session-row" key={s.id}>
                <MonitorSmartphone size={21} />
                <div className="session-detail">
                  <strong>
                    {s.current ? bcText("ui.101f4d95374ac70f") : bcText("ui.ccf3756dcb8c0349")}
                  </strong>
                  <p>{s.user_agent.slice(0, 100)}</p>
                  <p>{" " + bcText("ui.ecbc89cd37a03734") + " "}{new Date(s.created_at).toLocaleDateString(locale)}{" "}
                    · {s.remember ? bcText("ui.a913983316ada7af") : bcText("ui.ef6691545d2c5523")}{" " + bcText("ui.3f3af1ecebbd1410") + " "}</p>
                  {s.current && (
                    <span className="current-session">{bcText("ui.01e3fecd5bfbb4c1")}</span>
                  )}
                </div>
                <button
                  disabled={busy}
                  onClick={() => revoke(s.id)}
                  aria-label={
                    s.current
                      ? bcText("ui.e6e2e83972714838")
                      : bcText("ui.af825536e4abfc45")
                  }
                >
                  {s.current ? bcText("ui.48f0d3d397d49f13") : bcText("ui.87e6d00bbf53ec5a")}
                </button>
              </div>
            ))
          )}
          <div className="sessions-footer">
            <button
              className="text-button"
              disabled={busy || loading || sessions.length < 2}
              onClick={() => revoke()}
            >
              <LogOut size={14} />{" " + bcText("ui.8cafb0d4bb3e7a22") + " "}</button>
          </div>
        </>
      }
    </Localized>
  );
}
