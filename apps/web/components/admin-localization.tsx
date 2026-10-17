"use client";
import { message as bcText } from "../lib/i18n/source";

import { useEffect, useState } from "react";
import { Localized, useFormatLocale, useT } from "./localization";
const statuses = [
  bcText("ui.ebf12ef47cf575b3"),
  bcText("ui.d18b8649c77f6280"),
  bcText("ui.fad6057bb5403e59"),
  bcText("ui.87b42e40c2a290e0"),
];
async function api(path: string, body?: unknown) {
  const r = await fetch(
    "/api/localization/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const b = await r.json();
  if (!r.ok) throw new Error(b.error);
  return b;
}
function Entry({
  row,
  language,
  onSave,
}: {
  row: any;
  language: string;
  onSave: () => void;
}) {
  const [value, setValue] = useState(row.translation_value ?? ""),
    [status, setStatus] = useState(row.review_status),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const locale = useFormatLocale(),
    t = useT();
  return (
    <Localized>
      <article className="settings-section">
        <code>{row.translation_key}</code>
        <p data-no-translate>{row.english_source}</p>
        <label>
          {bcText("ui.2ff80152790c8a60")}
          <textarea
            aria-label={bcText("ui.2ff80152790c8a60")}
            dir="auto"
            maxLength={12000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          {bcText("ui.23a9a1e5a6a621c8")}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <p>
          {t(bcText("ui.36853f8b8a432b26"))}:{" "}
          {row.updated_at
            ? new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(row.updated_at))
            : t(bcText("ui.4a9054fea97a5032"))}
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("translations", {
                language,
                key: row.translation_key,
                value,
                status,
                updatedAt: row.updated_at,
              });
              onSave();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {bcText("ui.1d9eb7b9db2ca330")}
        </button>
        {error && <p role="alert">{error}</p>}
      </article>
    </Localized>
  );
}
export default function AdminLocalization() {
  const [coverage, setCoverage] = useState<any[]>([]),
    [languages, setLanguages] = useState<any[]>([]),
    [rows, setRows] = useState<any[]>([]),
    [reports, setReports] = useState<any[]>([]);
  const [language, setLanguage] = useState("fr"),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [missing, setMissing] = useState(false),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState("");
  const locale = useFormatLocale();
  const [definition, setDefinition] = useState({
    code: "",
    name: "",
    nativeName: "",
    direction: "ltr",
    enabled: true,
  });
  useEffect(() => {
    let active = true;
    Promise.all([api("coverage"), api("reports")])
      .then(([c, r]) => {
        if (active) {
          setCoverage(c.coverage);
          setLanguages(c.languages);
          setReports(r.reports);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        api(
          "translations?" +
            new URLSearchParams({
              language,
              q,
              status,
              missing: String(missing),
              page: String(page),
            }),
        )
          .then((b) => active && setRows(b.translations))
          .catch((e) => active && setError(e.message)),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [language, q, status, missing, page, revision]);
  const refresh = () => setRevision((x) => x + 1);
  return (
    <Localized>
      <div>
        {error && <p role="alert">{error}</p>}
        <h2>{bcText("ui.c41c8f97790a4e1a")}</h2>
        <p>{bcText("ui.26994b1f02ee7263")}</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  bcText("ui.a4fe65264ef7dbb3"),
                  bcText("ui.a7b29d5c9377d392"),
                  bcText("ui.227f99183f89b6ee"),
                  bcText("ui.2748e74d7b00c136"),
                  bcText("ui.cf811f6b671f8559"),
                  bcText("ui.87b42e40c2a290e0"),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.code}>
                  <td>
                    <button
                      onClick={() => {
                        setLanguage(c.code);
                        setPage(1);
                      }}
                    >
                      {c.native_name} ({c.code})
                    </button>
                  </td>
                  <td>{c.total_keys}</td>
                  <td>{c.translated_keys}</td>
                  <td>{c.missing_keys}</td>
                  <td>
                    {new Intl.NumberFormat(locale, {
                      style: "percent",
                      maximumFractionDigits: 1,
                    }).format(c.percentage_complete / 100)}
                  </td>
                  <td>{c.approved_keys}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>{bcText("ui.266a41b90d4f831e")}</h2>
        <div className="localization-filters">
          <label>
            {bcText("ui.a4fe65264ef7dbb3")}
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setPage(1);
              }}
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            {bcText("ui.6203a27624863cb5")}
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            {bcText("ui.23a9a1e5a6a621c8")}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{bcText("ui.1a1c1b95fb76fc37")}</option>
              {statuses.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={missing}
              onChange={(e) => {
                setMissing(e.target.checked);
                setPage(1);
              }}
            />
            {bcText("ui.3c8515a345430d2d")}
          </label>
        </div>
        {rows.map((r) => (
          <Entry
            key={language + r.translation_key + r.updated_at}
            language={language}
            row={r}
            onSave={refresh}
          />
        ))}
        {!rows.length && <p>{bcText("ui.dfd7d751162e5826")}</p>}
        <div className="form-actions">
          <button disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
            {bcText("ui.1208ec01f223c616")}
          </button>
          <span>{page}</span>
          <button
            disabled={!rows.length || page * 30 >= (rows[0]?.total ?? 0)}
            onClick={() => setPage((x) => x + 1)}
          >
            {bcText("ui.c08ac736a5e29c29")}
          </button>
        </div>
        <h2>{bcText("ui.35d1b0acc5bbbe04")}</h2>
        <p>{bcText("ui.7e9cc69d1d40e2c3")}</p>
        <form
          className="settings-section"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("languages", definition);
              refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            {bcText("ui.75759e49ef1477de")}
            <select
              value=""
              onChange={(e) => {
                const l = languages.find((l) => l.code === e.target.value);
                if (l) setDefinition(l);
              }}
            >
              <option value="">{bcText("ui.b443ca6ec044ede8")}</option>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {(["code", "name", "nativeName"] as const).map((k) => (
            <label key={k}>
              {
                {
                  code: bcText("ui.26dec0a3e684adcf"),
                  name: bcText("ui.a17512ad55d416c8"),
                  nativeName: bcText("ui.6fabde2e45d95823"),
                }[k]
              }
              <input
                required
                maxLength={k === "code" ? 60 : 100}
                value={definition[k]}
                onChange={(e) =>
                  setDefinition({ ...definition, [k]: e.target.value })
                }
              />
            </label>
          ))}
          <label>
            {bcText("ui.4044b7181a29ecb8")}
            <select
              value={definition.direction}
              onChange={(e) =>
                setDefinition({ ...definition, direction: e.target.value })
              }
            >
              <option value="ltr">{bcText("ui.d6c332630f19797f")}</option>
              <option value="rtl">{bcText("ui.909fb836633bf6b4")}</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={definition.enabled}
              onChange={(e) =>
                setDefinition({ ...definition, enabled: e.target.checked })
              }
            />
            {bcText("ui.92c1cdfdf4cb9cf6")}
          </label>
          <button>{bcText("ui.e80e0bd0b6264088")}</button>
        </form>
        <h2>{bcText("ui.e37848566ac69a22")}</h2>
        {reports.map((r) => (
          <article className="settings-section" key={r.id}>
            <code>{r.translation_key}</code>
            <p>
              {r.code} — {r.report_type}
            </p>
            <p data-no-translate>{r.english_source}</p>
            <p data-no-translate>{r.notes}</p>
            {[bcText("ui.5be3c2c8354e1eb9"), bcText("ui.9d74727714dba768")].map(
              (s) => (
                <button
                  key={s}
                  onClick={async () => {
                    try {
                      await api("reports/review", { id: r.id, status: s });
                      refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {s}
                </button>
              ),
            )}
          </article>
        ))}
        {!reports.length && <p>{bcText("ui.9ec8b87898696ebc")}</p>}
      </div>
    </Localized>
  );
}
