"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useFormatLocale } from "./localization";
import { useEffect, useState } from "react";
import Link from "next/link";
import VerificationBadge, { PremiumBadge } from "./verification-badge";
import { api } from "./platform-client";
export default function CommunityFeed({
  kind,
}: {
  kind: "posts" | "messages" | "listings";
}) {
  const locale = useFormatLocale();
  const [items, setItems] = useState<any[]>([]),
    [body, setBody] = useState(""),
    [recipient, setRecipient] = useState(""),
    [title, setTitle] = useState(""),
    [price, setPrice] = useState("0.00"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [selling, setSelling] = useState(false);
  async function load() {
    const data = await api<{ items: any[] }>(kind);
    setItems(data.items);
    setLoaded(true);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    if (kind === "listings")
      api("features/selling")
        .then(() => setSelling(true))
        .catch(() => {});
  }, [kind]);
  return (
    <Localized>
      {
        <div>
          {error && (
            <p className="message error-message" role="alert">
              {error}
            </p>
          )}
          {kind !== "listings" || selling ? (
            <form
              className="panel compose-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const value = {
                    body,
                    ...(kind === "messages"
                      ? { recipient }
                      : kind === "listings"
                        ? { title, priceCents: Math.round(Number(price) * 100) }
                        : {}),
                  };
                  await api(kind, value);
                  setBody("");
                  setTitle("");
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>
                {kind === "posts"
                  ? bcText("ui.f9353b35740941ea")
                  : kind === "messages"
                    ? bcText("ui.56e541ad86e099c0")
                    : bcText("ui.9a697d39c1f46d3c")}
              </h2>
              {kind === "messages" && (
                <div className="field">
                  <label htmlFor="recipient">{bcText("ui.baa8fb181af286e9")}</label>
                  <input
                    id="recipient"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    required
                    maxLength={30}
                    disabled={busy}
                  />
                </div>
              )}
              {kind === "listings" && (
                <>
                  <div className="field">
                    <label htmlFor="listing-title">{bcText("ui.ba77096dda3de2f9")}</label>
                    <input
                      id="listing-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      maxLength={160}
                      disabled={busy}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="listing-price">{bcText("ui.28af28fcb2d80778")}</label>
                    <input
                      id="listing-price"
                      type="number"
                      min="0"
                      max="100000"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      disabled={busy}
                    />
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="content-body">
                  {kind === "listings" ? bcText("ui.526e0087cc3f254d") : bcText("ui.2f77668a9dfbf8d5")}
                </label>
                <textarea
                  id="content-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  maxLength={3000}
                  disabled={busy}
                />
              </div>
              <button className="primary-button" disabled={busy}>
                {busy
                  ? bcText("ui.23e39291d6135814")
                  : kind === "messages"
                    ? bcText("ui.93a26b1eaff99b3a")
                    : kind === "listings"
                      ? bcText("ui.9e7ea3f847f18c79")
                      : bcText("ui.2bbc9de21caa1f28")}
              </button>
            </form>
          ) : (
            <p className="local-note">{" " + bcText("ui.93a6c823385616a9")}{" "}
              <Link href="/school-verification">{bcText("ui.305f27dd747e82da")}</Link>
            </p>
          )}
          <div className="panel-heading">
            <h2>{kind === "messages" ? bcText("ui.903532e033973e3d") : bcText("ui.8730d3c2022abf1f")}</h2>
            <button
              className="text-button"
              onClick={() => {
                setError("");
                load().catch((e) => setError(e.message));
              }}
            >{" " + bcText("ui.0e91610117029a62") + " "}</button>
          </div>
          {!items.length && <p>{loaded ? bcText("ui.2de5247a982a1cd6") : bcText("ui.ba3bbbe10d8bef66")}</p>}
          <div className="feed-items">
            {items.map((item) => (
              <article className="panel feed-item" key={item.id}>
                <div className="author-line">
                  <Link data-no-translate href={`/profiles/${item.username}`}>
                    {item.first_name} {item.last_name}{" "}
                    <span>@{item.username}</span>
                  </Link>
                  <VerificationBadge role={item.badge} />
                  <PremiumBadge premium={item.premium} />
                </div>
                {item.recipient && (
                  <p className="verification-hint">{bcText("ui.55d8f7ffbfff516e")}{item.recipient}</p>
                )}
                {item.title && (
                  <h3>
                    {item.title} ·{" "}
                    {new Intl.NumberFormat(locale, {
                      style: "currency",
                      currency: "USD",
                    }).format(item.price_cents / 100)}
                  </h3>
                )}
                <p className="content-body">{item.body}</p>
                <time dateTime={item.created_at}>
                  {new Date(item.created_at).toLocaleString(locale)}
                </time>
              </article>
            ))}
          </div>
        </div>
      }
    </Localized>
  );
}
