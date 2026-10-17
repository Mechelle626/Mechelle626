"use client";
import { message as bcText } from "../lib/i18n/source";

import { useEffect, useState } from "react";
import { Localized, useFormatLocale, useT } from "./localization";
import { api } from "./platform-client";
import { statusLabel } from "../lib/i18n/labels";
const labels: Record<string, string> = {
  users: bcText("ui.8a7c8b67fe8bde8b"),
  suspended: bcText("ui.1819c4bcc0076801"),
  pending_identity_reviews: bcText("ui.1ff18cdd9901a413"),
  active_subscriptions: bcText("ui.df0a5aac1933a9f8"),
  posts: bcText("ui.a80811cf68891506"),
  messages: bcText("ui.04d7b48339271ea6"),
  listings: bcText("ui.62f0fd3209cbdf35"),
  queued_emails: bcText("ui.58747413bbf7153c"),
  exhausted_emails: bcText("ui.f4eef9fdddb403ca"),
};
export default function AdminOverview() {
  const [value, setValue] = useState<any>(null),
    [rows, setRows] = useState<any[]>([]),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const locale = useFormatLocale(),
    t = useT();
  useEffect(() => {
    let active = true;
    api("admin/overview")
      .then((v) => active && setValue(v))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        api(
          "admin/subscriptions?" +
            new URLSearchParams({ q, status, page: String(page) }),
        )
          .then((v) => active && setRows(v.subscriptions))
          .catch((e) => active && setError(e.message)),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, status, page]);
  return (
    <Localized>
      <div>
        {error && <p role="alert">{error}</p>}
        <h2>{bcText("ui.1911a6821ddbbe5c")}</h2>
        <p>{bcText("ui.31890f66c558c476")}</p>
        <div className="admin-metrics">
          {value &&
            Object.entries(value.counts).map(([k, n]) => (
              <article className="panel" key={k}>
                <h3>{labels[k]}</h3>
                <strong>
                  {new Intl.NumberFormat(locale).format(Number(n))}
                </strong>
              </article>
            ))}
        </div>
        <h2>{bcText("ui.7050d29283f81cc6")}</h2>
        <p>{bcText("ui.87702f3fee61bbf3")}</p>
        {value && (
          <section className="panel">
            <p>
              {value.readiness.mailMode === "development-outbox"
                ? bcText("ui.040c3b929191f71b")
                : bcText("ui.45104ca5474d20cf")}
            </p>
            <p>
              {value.readiness.publicHttps
                ? "A public HTTPS application URL is configured."
                : "A public HTTPS application URL is not configured."}
            </p>
            <p>
              {value.readiness.encryptedStorageConfigured
                ? bcText("ui.b394ca6e8ebcc7c9")
                : bcText("ui.88de66ce6b036cfb")}
            </p>
            <p>
              {value.readiness.scanner.executablePresent
                ? bcText("ui.8b4529ca122f2a93")
                : bcText("ui.0b79a6dbf1bbc8bc")}
            </p>
            {Object.entries(value.readiness.services).map(
              ([name, v]: [string, any]) => (
                <div className="service-status" key={name}>
                  <strong data-no-translate>{name}</strong>
                  <p>
                    {v.configured
                      ? "Configured; live operation unverified."
                      : bcText("ui.8cb087079b91201d")}
                  </p>
                  {v.missing.length > 0 && <code>{v.missing.join(", ")}</code>}
                </div>
              ),
            )}
          </section>
        )}
        <h2>{bcText("ui.a151f2e912fe8d5b")}</h2>
        <div className="localization-filters">
          <label>
            {bcText("ui.0391aaacf846022e")}
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            {bcText("ui.f0723c4e4a4e1e8a")}
            <select
              aria-label={bcText("ui.f0723c4e4a4e1e8a")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{bcText("ui.1818ef926fd4cc59")}</option>
              {[
                "active",
                "trialing",
                "past_due",
                "canceled",
                "unpaid",
                "incomplete",
                "incomplete_expired",
                "paused",
              ].map((s) => (
                <option key={s} value={s}>
                  {t(statusLabel(s))}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  bcText("ui.7e1b0d5641f2640c"),
                  bcText("ui.920e413c7d411b61"),
                  bcText("ui.d69f731e32331266"),
                  bcText("ui.eeae9fdd63e0d512"),
                  bcText("ui.89ceeaf45f99bf71"),
                ].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.username}>
                  <td data-no-translate>{r.username}</td>
                  <td>{statusLabel(r.status)}</td>
                  <td>{statusLabel(r.cycle)}</td>
                  <td>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                    }).format(new Date(r.period_end))}
                  </td>
                  <td>
                    {r.cancel_at_period_end
                      ? bcText("ui.85a39ab345d672ff")
                      : bcText("ui.1ea442a134b2a184")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p>{bcText("ui.fb73ee7cd936c00e")}</p>}
        <div className="button-row">
          <button disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
            {bcText("ui.1208ec01f223c616")}
          </button>
          <span>{page}</span>
          <button
            disabled={!rows.length || page * 30 >= rows[0]?.total}
            onClick={() => setPage((x) => x + 1)}
          >
            {bcText("ui.c08ac736a5e29c29")}
          </button>
        </div>
      </div>
    </Localized>
  );
}
