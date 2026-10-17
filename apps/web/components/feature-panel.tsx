"use client";
import { message as bcText } from "../lib/i18n/source";

import { useFormatLocale } from "./localization";
import { Localized } from "./localization";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./platform-client";
import VerificationBadge from "./verification-badge";
export default function FeaturePanel({ feature }: { feature: string }) {
  const locale = useFormatLocale();
  const [value, setValue] = useState<any>(null),
    [error, setError] = useState(""),
    [theme, setTheme] = useState("classic"),
    [skin, setSkin] = useState("classic"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    api("features/" + feature)
      .then(setValue)
      .catch((e) => setError(e.message));
  }, [feature]);
  if (error)
    return (
      <Localized>
        {
          <p role="alert" className="message error-message">
            {error}
          </p>
        }
      </Localized>
    );
  if (!value) return <Localized>{<p>{bcText("ui.ba3bbbe10d8bef66")}</p>}</Localized>;
  if (feature === "themes" || feature === "study-buddies")
    return (
      <Localized>
        {
          <form
            className="panel"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setNotice("");
              try {
                await api("settings/appearance", { theme, skin });
                setNotice(bcText("ui.6120b7a343867e21"));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{bcText("ui.34ca8a4540f5238f")}</h2>
            <div className="field">
              <label htmlFor="theme">{bcText("ui.d62c58cba7fcd8fa")}</label>
              <select
                id="theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="classic">{bcText("ui.ae25d6481fc1741f")}</option>
                <option value="midnight">{bcText("ui.aa996cf21f0dbc61")}</option>
                <option value="lavender">{bcText("ui.60707cfeb40e2a66")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="skin">{bcText("ui.98b8aa68478715c7")}</label>
              <select
                id="skin"
                value={skin}
                onChange={(e) => setSkin(e.target.value)}
              >
                <option value="classic">{bcText("ui.ae25d6481fc1741f")}</option>
                <option value="fox">{bcText("ui.f55bd2cdfae79728")}</option>
                <option value="owl">{bcText("ui.72992b75e60c8806")}</option>
              </select>
            </div>
            <div className={bcText("ui.3669ead77a7ca40e", [theme])}>{" " + bcText("ui.a7d8836b08008016")}{" "}
              <span>
                {skin === "fox" ? "🦊" : skin === "owl" ? "🦉" : "🌱"}
              </span>
            </div>
            <button className="primary-button" disabled={busy}>{" " + bcText("ui.cf157e9d4ddd0865") + " "}</button>
            {notice && <p role="status">{notice}</p>}
            <Link href="/account">{bcText("ui.8640b50bdc74c2f7")}</Link>
          </form>
        }
      </Localized>
    );
  if (feature === "analytics")
    return (
      <Localized>
        {
          <div className="dashboard-cards">
            {Object.entries(value).map(([key, count]) => (
              <section className="panel" key={key}>
                <h2>{key}</h2>
                <strong className="plan-price">
                  {new Intl.NumberFormat(locale).format(Number(count))}
                </strong>
                <p>{bcText("ui.50f7587e563c73cc")}</p>
              </section>
            ))}
          </div>
        }
      </Localized>
    );
  return (
    <Localized>
      {
        <section className="panel">
          <h2>
            {feature === "tutors"
              ? bcText("ui.9d0262300dbe1fce")
              : bcText("ui.27808f9548624f7e")}
          </h2>
          <p className="verification-hint">{" " + bcText("ui.ac53e006ca364e2f") + " "}</p>
          {value.people?.length ? (
            value.people.map((person: any) => (
              <div className="friend-row" key={person.username}>
                <Link href={`/profiles/${person.username}`}>
                  {person.first_name} {person.last_name}
                </Link>
                <VerificationBadge role={person.badge} />
                <span>{person.school}</span>
              </div>
            ))
          ) : (
            <p>{bcText("ui.509dfc626c06b7b5")}</p>
          )}
        </section>
      }
    </Localized>
  );
}
