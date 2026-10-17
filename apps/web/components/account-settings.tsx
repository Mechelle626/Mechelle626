"use client";
import { statusLabel } from "../lib/i18n/labels";
import { message as bcText } from "../lib/i18n/source";

import { Localized, useT } from "./localization";

import IdentitySettings from "./identity-settings";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import SessionManager from "./session-manager";
import { api } from "./platform-client";
import VerificationBadge from "./verification-badge";
type Settings = {
  username: string;
  email: string;
  bio: string;
  visibility: string;
  has_picture: boolean;
  has_banner: boolean;
  twofactorenabled?: boolean;
  badge?: string | null;
  twoFactorEnabled?: boolean;
};
export default function AccountSettings() {
  const t=useT();
  const [data, setData] = useState<Settings | null>(null),
    [bio, setBio] = useState(""),
    [visibility, setVisibility] = useState("public"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [code, setCode] = useState(""),
    [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null),
    [qr, setQr] = useState(""),
    [recovery, setRecovery] = useState<string[]>([]),
    [school, setSchool] = useState<any>(null),
    [friends, setFriends] = useState<any[]>([]),
    [friend, setFriend] = useState(""),
    [version, setVersion] = useState(0);
  async function load() {
    const value = await api<Settings>("settings");
    setData(value);
    setBio(value.bio);
    setVisibility(value.visibility);
    const [s, f] = await Promise.all([
      fetch("/api/school/status").then(async (r) => (r.ok ? r.json() : null)),
      api<{ friends: any[] }>("friends"),
    ]);
    setSchool(s);
    setFriends(f.friends);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let current = true;
    setQr("");
    if (setup)
      QRCode.toDataURL(setup.uri, { width: 220 })
        .then((value) => {
          if (current) setQr(value);
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [setup]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("settings/profile", { bio, visibility });
      setNotice(bcText("ui.97d01c0d368b063d"));
    });
  }
  async function image(kind: string, file: File) {
    await run(async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("image", file);
      const r = await fetch("/api/platform/settings/image", {
        method: "POST",
        body: form,
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setVersion((v) => v + 1);
      setNotice(bcText("ui.67b06e437c457129"));
    });
  }
  const enabled = Boolean(data?.twoFactorEnabled ?? data?.twofactorenabled);
  return (
    <Localized>
      {
        <div className="settings-sections">
          <IdentitySettings />
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
          {!data ? (
            <button className="text-button" onClick={() => run(load)}>{" " + bcText("ui.efe36c2b8d253380") + " "}</button>
          ) : (
            <>
              <section className="panel">
                <h2>{bcText("ui.d696a35bdd1883da")}</h2>
                <p>
                  @{data.username} · {data.email}
                </p>
                <div className="profile-media-grid">
                  {(["picture", "banner"] as const).map((kind) => (
                    <div key={kind} className="field">
                      <label htmlFor={kind}>
                        {kind === "picture"
                          ? bcText("ui.a7acc4ebae2c0014")
                          : bcText("ui.82d4157c10f50b63")}
                      </label>
                      {(kind === "picture"
                        ? data.has_picture
                        : data.has_banner) && (
                        <>
                          <img
                            className={
                              kind === "picture"
                                ? "settings-avatar"
                                : "settings-banner"
                            }
                            src={`/api/platform/media/${data.username}/${kind}?v=${version}`}
                            alt={bcText("ui.8387ab3d7fbd2f47", [kind])}
                          />
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await api("settings/remove-image", { kind });
                                await load();
                                setNotice(bcText("ui.92464a2da31cb515"));
                              })
                            }
                          >{" " + bcText("ui.c3812fc4acb861d5") + " "}{kind}
                          </button>
                        </>
                      )}
                      <input
                        id={kind}
                        type="file"
                        accept="image/png,image/jpeg"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void image(kind, file);
                          e.target.value = "";
                        }}
                      />
                      <span className="verification-hint">{" " + bcText("ui.59970759ccf03c40") + " "}</span>
                    </div>
                  ))}
                </div>
                <form onSubmit={save}>
                  <div className="field">
                    <label htmlFor="profile-bio">{bcText("ui.3933b1802161254f")}</label>
                    <textarea
                      id="profile-bio"
                      maxLength={1000}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <h3>{bcText("ui.54a57c3147c49f33")}</h3>
                  <div className="field">
                    <label htmlFor="profile-visibility">{" " + bcText("ui.3018adeb730d73c0") + " "}</label>
                    <select
                      id="profile-visibility"
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value)}
                      disabled={busy}
                    >
                      <option value="public">{bcText("ui.591935b15b1c88e2")}</option>
                      <option value="private">{bcText("ui.c63eb6720c6e8849")}</option>
                      <option value="friends">{bcText("ui.d6ebf1f9b7d7fc50")}</option>
                    </select>
                  </div>
                  <p className="verification-hint">{" " + bcText("ui.ccf51c6ce0e2aeeb") + " "}</p>
                  <button className="primary-button" disabled={busy}>{" " + bcText("ui.580355a8b706245a") + " "}</button>
                </form>
              </section>
              <section className="panel">
                <h2>{bcText("ui.8f6fb4eb7f42c0e2")}</h2>
                <p>{" " + bcText("ui.a836000967bb859b")}{" "}
                  <Link href="/forgot-password">{bcText("ui.bb42f8cd525dba08")}</Link>.
                </p>
                <div className="field">
                  <label htmlFor="current-password">{bcText("ui.72ed2bd767cef627")}</label>
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const result = await api("security/password", {
                        currentPassword: password,
                        password: newPassword,
                        code,
                      });
                      setPassword("");
                      setNewPassword("");
                      setCode("");
                      setNotice(result.message);
                    });
                  }}
                >
                  <div className="field">
                    <label htmlFor="new-password">{bcText("ui.3dd9df4441fb348f")}</label>
                    <input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      disabled={busy}
                    />
                  </div>
                  <p className="verification-hint">{" " + bcText("ui.896a50a46f67501a") + " "}</p>
                  {enabled && (
                    <p className="verification-hint">{" " + bcText("ui.99f2a9a27e78e193") + " "}</p>
                  )}
                  <button
                    className="secondary-button"
                    disabled={busy || !password}
                  >{" " + bcText("ui.3f9c991f63a9a376") + " "}</button>
                </form>
                <h3>{bcText("ui.b6824cc8a91e3b51")}</h3>
                <p>
                  {enabled
                    ? bcText("ui.185870557c23660f")
                    : bcText("ui.2b0e80483609c439")}
                </p>
                {!enabled && !setup && (
                  <button
                    className="secondary-button"
                    disabled={busy || !password}
                    onClick={() =>
                      run(async () => {
                        setRecovery([]);
                        setSetup(await api("security/mfa/setup", { password }));
                      })
                    }
                  >{" " + bcText("ui.93b1af094c2b701d") + " "}</button>
                )}
                {setup && (
                  <div className="mfa-setup">
                    <p>{" " + bcText("ui.839fe96a460afdfc") + " "}</p>
                    {qr && (
                      <img
                        src={qr}
                        width={220}
                        height={220}
                        alt={bcText("ui.5b4c9ddd5750c496")}
                      />
                    )}
                    <label>{" " + bcText("ui.a5aa5b030f5405ee") + " "}<code className="setup-secret">{setup.secret}</code>
                    </label>
                  </div>
                )}
                {(enabled || setup) && (
                  <div className="field">
                    <label htmlFor="security-code">{" " + bcText("ui.322eeecc352ded66") + " "}</label>
                    <input
                      id="security-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoComplete="one-time-code"
                      maxLength={40}
                      disabled={busy}
                    />
                  </div>
                )}
                {setup && !enabled && (
                  <button
                    className="primary-button"
                    disabled={busy || code.length < 6 || !password}
                    onClick={() =>
                      run(async () => {
                        const result = await api<{ recoveryCodes: string[] }>(
                          "security/mfa/enable",
                          { password, code },
                        );
                        setRecovery(result.recoveryCodes);
                        setSetup(null);
                        setPassword("");
                        setCode("");
                        await load();
                        setNotice(
                          bcText("ui.b61d3421e22c9d64"),
                        );
                      })
                    }
                  >{" " + bcText("ui.57fc147268922901") + " "}</button>
                )}
                {enabled && (
                  <button
                    className="text-button"
                    disabled={busy || !password || code.length < 6}
                    onClick={() =>
                      run(async () => {
                        const result = await api("security/mfa/disable", {
                          password,
                          code,
                        });
                        setPassword("");
                        setCode("");
                        setRecovery([]);
                        await load();
                        setNotice(result.message);
                      })
                    }
                  >{" " + bcText("ui.1c3193f3a0b8f68f") + " "}</button>
                )}
                {recovery.length > 0 && (
                  <div className="recovery-codes">
                    <h3>{bcText("ui.05b04668b25cfd70")}</h3>
                    <p>{" " + bcText("ui.9feca5a48f233da9") + " "}</p>
                    <pre>{recovery.join("\n")}</pre>
                    <button
                      className="text-button"
                      onClick={() => setRecovery([])}
                    >{" " + bcText("ui.2ea75b9b9c9866f1") + " "}</button>
                  </div>
                )}
              </section>
              <section className="panel">
                <SessionManager />
              </section>
              <section className="panel">
                <h2>{bcText("ui.7140f4f19dec5259")}</h2>
                <p>
                  {school?.schoolVerified
                    ? bcText("ui.57a4af8a1ef4b9d2")
                    : school?.request
                      ? bcText("ui.81d2de0c81414a56", [t(statusLabel(school.request.status))])
                      : bcText("ui.e988c06114dcabee")}
                </p>
                <VerificationBadge role={data.badge} />
                <Link className="secondary-button" href="/school-verification">{" " + bcText("ui.d14f6623e0e60752") + " "}</Link>
                <p className="verification-hint">{" " + bcText("ui.dc87909b4ebcb40e") + " "}</p>
              </section>
              <section className="panel">
                <h2>{bcText("ui.4999c6c6c7badf45")}</h2>
                <p>{bcText("ui.fa143f0033a49045")}</p>
                <Link href="/billing" className="secondary-button">{" " + bcText("ui.4afeed84b77f7977") + " "}</Link>
              </section>
              <section className="panel">
                <h2>{bcText("ui.bd104d1b98d03227")}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api("friends/request", { username: friend });
                      setFriend("");
                      await load();
                      setNotice(bcText("ui.e05e1bacada2a3ba"));
                    });
                  }}
                >
                  <div className="field">
                    <label htmlFor="friend-name">{bcText("ui.e3b89e9d33f88e52")}</label>
                    <input
                      id="friend-name"
                      value={friend}
                      onChange={(e) => setFriend(e.target.value)}
                      required
                      maxLength={30}
                    />
                  </div>
                  <button className="secondary-button" disabled={busy}>{" " + bcText("ui.a0383a957f518a46") + " "}</button>
                </form>
                {friends.length ? (
                  friends.map((f) => (
                    <div
                      key={f.requester_id + f.recipient_id}
                      className="friend-row"
                    >
                      <span>
                        @
                        {f.requester === data.username
                          ? f.recipient
                          : f.requester}{" "}
                        · {statusLabel(f.status)}
                      </span>
                      {f.status === "pending" &&
                        f.recipient === data.username && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await api("friends/respond", {
                                  requesterId: f.requester_id,
                                  accept: true,
                                });
                                await load();
                                setNotice(bcText("ui.cadb5497d6c3f032"));
                              })
                            }
                          >{" " + bcText("ui.89713b9c9c1b8f65") + " "}</button>
                        )}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api("friends/remove", {
                              userId:
                                f.requester === data.username
                                  ? f.recipient_id
                                  : f.requester_id,
                            });
                            await load();
                            setNotice(bcText("ui.ef3b6e7ad07f3c38"));
                          })
                        }
                      >{" " + bcText("ui.c3812fc4acb861d5") + " "}</button>
                    </div>
                  ))
                ) : (
                  <p>{bcText("ui.643013cde6f1dbcd")}</p>
                )}
              </section>
            </>
          )}
        </div>
      }
    </Localized>
  );
}
