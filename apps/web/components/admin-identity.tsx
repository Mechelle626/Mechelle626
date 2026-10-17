"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useFormatLocale } from "./localization";
import { useEffect, useState } from "react";
import { statusLabels } from "../lib/onboarding/contracts";
const typeLabels: Record<string, string> = {
  selfie: bcText("ui.7891f3b3726e9bf6"),
  institution_id: bcText("ui.efbfb468d4474144"),
  passport: bcText("ui.3173c1c8cfe02e32"),
  drivers_license: bcText("ui.8ce12e53f1eacff1"),
  national_id: bcText("ui.092bcd77169cb72e"),
  government_id: bcText("ui.fd979f8ee3a419d7"),
};
export default function AdminIdentity() {
  const locale = useFormatLocale();
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [status, setStatus] = useState("pending_review"),
    [page, setPage] = useState(1),
    [notes, setNotes] = useState(""),
    [affiliation, setAffiliation] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    const r = await fetch(
      `/api/onboarding/admin/identity?status=${status}&page=${page}`,
      { cache: "no-store" },
    );
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setRows(v.requests);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    setSelected(null);
  }, [status, page]);
  async function decide(decision: string) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/onboarding/admin/identity/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          decision,
          notes,
          approveAffiliation: decision === "verified" && affiliation,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setNotice(v.message);
      setSelected(null);
      setNotes("");
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
        <div>
          {error && (
            <p role="alert" className="message error-message">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="message success-message">
              {notice}
            </p>
          )}
          <section className="panel">
            <h2>{bcText("ui.c2ca552951d67b2a")}</h2>
            <div className="field">
              <label htmlFor="identity-filter">{bcText("ui.a410d70156a3a04c")}</label>
              <select
                id="identity-filter"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                {[
                  "pending_review",
                  "under_review",
                  "verified",
                  "additional_information_required",
                  "rejected",
                ].map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="text-button"
              onClick={() => load().catch((e) => setError(e.message))}
            >{" " + bcText("ui.00f4578fce01e1cd") + " "}</button>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      bcText("ui.dcd1d5223f73b3a9"),
                      bcText("ui.65a1553729e30faf"),
                      bcText("ui.14736a2eb9f4159f"),
                      bcText("ui.224caf4b993a612b"),
                      bcText("ui.920e413c7d411b61"),
                      bcText("ui.ff8059dc6752afdd"),
                    ].map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-no-translate>
                        {r.first_name} {r.last_name}
                        <small>@{r.username}</small>
                      </td>
                      <td data-no-translate>{r.institution_name}</td>
                      <td>{r.role}</td>
                      <td>
                        {new Date(r.submitted_at).toLocaleDateString(locale)}
                      </td>
                      <td>
                        {statusLabels[r.status]}
                        {r.alternative && (
                          <small>{bcText("ui.1f7c93c7f267e765")}</small>
                        )}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(r);
                            setNotes("");
                            setAffiliation(false);
                          }}
                        >{" " + bcText("ui.f50cbfbd4f3331b9") + " "}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && <p>{bcText("ui.5f01043489115142")}</p>}
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={page === 1 || busy}
                onClick={() => setPage((p) => p - 1)}
              >{" " + bcText("ui.a57b08a480b822a0") + " "}</button>
              <span>{bcText("ui.0a30a815d67d7dd2") + " "}{page}</span>
              <button
                className="secondary-button"
                disabled={rows.length < 50 || busy}
                onClick={() => setPage((p) => p + 1)}
              >{" " + bcText("ui.1ff57a29d7c9d11b") + " "}</button>
            </div>
          </section>
          {selected && (
            <section className="panel" aria-label={bcText("ui.99398ad54b9895da")}>
              <h2>{bcText("ui.ea0fef49167a57ac")}</h2>
              <p data-no-translate>
                @{selected.username} · {selected.institution_name}
              </p>
              <ul className="review-documents">
                {selected.documents.map((d: any) => (
                  <li key={d.id}>
                    <strong>{typeLabels[d.type]}</strong>
                    <span>{bcText("ui.c7cdd9c108c3f784") + " "}{d.scanStatus}</span>
                    {d.scanStatus === "clean" ? (
                      <a
                        href={`/api/onboarding/admin/document/${d.id}`}
                        className="secondary-button"
                      >{" " + bcText("ui.7e83fa976ea14fd6") + " "}</a>
                    ) : (
                      <span className="verification-hint">{" " + bcText("ui.a5fccc72795ea00d") + " "}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="field">
                <label htmlFor="identity-notes">{bcText("ui.7477f22800a26ab3")}</label>
                <textarea
                  id="identity-notes"
                  value={notes}
                  maxLength={1000}
                  minLength={5}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {!selected.alternative && selected.school_id && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={affiliation}
                    onChange={(e) => setAffiliation(e.target.checked)}
                  />{" " + bcText("ui.f533c42f6a58ab83") + " "}</label>
              )}
              <p className="verification-hint">{" " + bcText("ui.07383df5582b57ce") + " "}</p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={busy || notes.trim().length < 5}
                  onClick={() => decide("under_review")}
                >{" " + bcText("ui.4caf77a86e6fa375") + " "}</button>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    notes.trim().length < 5 ||
                    selected.documents.length !== 2 ||
                    selected.documents.some(
                      (d: any) => d.scanStatus !== "clean",
                    )
                  }
                  onClick={() => decide("verified")}
                >{" " + bcText("ui.2ab7c4faffe2026f") + " "}</button>
                <button
                  className="secondary-button"
                  disabled={busy || notes.trim().length < 5}
                  onClick={() => decide("additional_information_required")}
                >{" " + bcText("ui.53ced4d7b9b83ac0") + " "}</button>
                <button
                  className="secondary-button"
                  disabled={busy || notes.trim().length < 5}
                  onClick={() => decide("rejected")}
                >{" " + bcText("ui.6db1711e8630c00c") + " "}</button>
              </div>
            </section>
          )}
        </div>
      }
    </Localized>
  );
}
