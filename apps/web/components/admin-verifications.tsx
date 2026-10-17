"use client";
import { statusLabel } from "../lib/i18n/labels";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useFormatLocale } from "./localization";
import { useEffect, useState } from "react";
import { api } from "./platform-client";
export default function AdminVerifications() {
  const locale = useFormatLocale();
  const [rows, setRows] = useState<any[]>([]),
    [status, setStatus] = useState("pending_review"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<any>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [users, setUsers] = useState<any[]>([]);
  async function load() {
    setRows(
      (
        await api<{ requests: any[] }>(
          `admin/verifications?status=${status}&page=${page}`,
        )
      ).requests,
    );
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [status, page]);
  async function action(id: string, action: string) {
    if (reason.trim().length < 5) {
      setError(bcText("ui.d09a1344c3d52fb4"));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("admin/action", { id, action, reason });
      setNotice(bcText("ui.24b842abf3cd4d5c"));
      setSelected(null);
      setReason("");
      await load();
      if (users.length)
        setUsers(
          (
            await api<{ users: any[] }>(
              "admin/users?q=" + encodeURIComponent(query),
            )
          ).users,
        );
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
            <p className="message error-message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="message success-message" role="status">
              {notice}
            </p>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>{bcText("ui.d68ab308daf0fa8f")}</h2>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => load().catch((e) => setError(e.message))}
              >{" " + bcText("ui.0e91610117029a62") + " "}</button>
            </div>
            <div className="field">
              <label htmlFor="review-status">{bcText("ui.94d5a7703a8250de")}</label>
              <select
                id="review-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                  setSelected(null);
                }}
              >
                {[
                  "pending_review",
                  "needs_information",
                  "approved",
                  "rejected",
                  "awaiting_email",
                ].map((s) => (
                  <option value={s} key={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      bcText("ui.dcd1d5223f73b3a9"),
                      bcText("ui.6cd2e331855da821"),
                      bcText("ui.14736a2eb9f4159f"),
                      bcText("ui.52a0f9b65b278850"),
                      bcText("ui.9606f86cc41c4d9b"),
                      bcText("ui.920e413c7d411b61"),
                      bcText("ui.ff8059dc6752afdd"),
                    ].map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.first_name} {row.last_name}
                        <small>@{row.username}</small>
                      </td>
                      <td>{row.school}</td>
                      <td>{row.role}</td>
                      <td>{statusLabel(row.method)}</td>
                      <td>
                        {new Date(row.submitted_at).toLocaleDateString(locale)}
                      </td>
                      <td>
                        {statusLabel(row.status)}
                        <small>{" " + bcText("ui.f4df656e3663a698") + " "}{row.document_scan_status ?? bcText("ui.1bd86e06d9631209")}
                        </small>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            setSelected(row);
                            setReason("");
                            setError("");
                          }}
                        >{" " + bcText("ui.aff0766a5290e117") + " "}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && <p>{bcText("ui.dbf9eab46cc36bd3")}</p>}
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
            <section className="panel" aria-label={bcText("ui.dcea8abbdff03524")}>
              <h2>{bcText("ui.4d4aeadf704b98b7")}{selected.username}</h2>
              <p>
                {selected.school} · {selected.role} · {statusLabel(selected.method)}
              </p>
              <p>{" " + bcText("ui.c7cdd9c108c3f784")}{" "}
                {selected.document_scan_status ?? bcText("ui.5237c96ac1a23b98")}
              </p>
              {selected.document_scan_status === "clean" ? (
                <a
                  className="secondary-button"
                  href={`/api/platform/admin/document/${selected.id}`}
                >{" " + bcText("ui.7e83fa976ea14fd6") + " "}</a>
              ) : (
                selected.method !== "email" && (
                  <p className="local-note">{" " + bcText("ui.2772374d4340ccd8") + " "}</p>
                )
              )}
              <div className="field">
                <label htmlFor="review-reason">{bcText("ui.733f30ba30b55e4a")}</label>
                <textarea
                  id="review-reason"
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="button-row">
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    selected.document_scan_status !== "clean" ||
                    !["pending_review", "needs_information"].includes(
                      selected.status,
                    )
                  }
                  onClick={() => action(selected.id, "approve")}
                >{" " + bcText("ui.6007acbe30b2cd98") + " "}</button>
                <button
                  className="secondary-button"
                  disabled={
                    busy ||
                    !["pending_review", "needs_information"].includes(
                      selected.status,
                    )
                  }
                  onClick={() => action(selected.id, "reject")}
                >{" " + bcText("ui.ab604a360777735f") + " "}</button>
                <button
                  className="secondary-button"
                  disabled={
                    busy ||
                    !["pending_review", "needs_information"].includes(
                      selected.status,
                    )
                  }
                  onClick={() => action(selected.id, "needs_information")}
                >{" " + bcText("ui.e1a9ce3833b4bab4") + " "}</button>
              </div>
            </section>
          )}
          <section className="panel">
            <h2>{bcText("ui.639949d223440156")}</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                try {
                  setUsers(
                    (
                      await api<{ users: any[] }>(
                        "admin/users?q=" + encodeURIComponent(query),
                      )
                    ).users,
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <div className="field">
                <label htmlFor="admin-user-search">{bcText("ui.597c1cb8a6f76014")}</label>
                <input
                  id="admin-user-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={100}
                />
              </div>
              <button className="secondary-button">{bcText("ui.904f3f10724586de")}</button>
            </form>
            <div className="field">
              <label htmlFor="moderation-reason">{bcText("ui.81f3f0e758532447")}</label>
              <textarea
                id="moderation-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </div>
            {users.map((u) => (
              <div className="moderation-row" key={u.id}>
                <strong>@{u.username}</strong>
                <span>{u.account_status}</span>
                {!u.is_admin && (
                  <div className="button-row">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => action(u.id, "suspend")}
                    >{" " + bcText("ui.4948e134182f8420") + " "}</button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => action(u.id, "ban")}
                    >{" " + bcText("ui.520ed297c96f7b1a") + " "}</button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => action(u.id, "activate")}
                    >{" " + bcText("ui.db57822f2402c38e") + " "}</button>
                  </div>
                )}
              </div>
            ))}
            <p className="verification-hint">{" " + bcText("ui.f82d8d8565925ab0") + " "}</p>
          </section>
        </div>
      }
    </Localized>
  );
}
