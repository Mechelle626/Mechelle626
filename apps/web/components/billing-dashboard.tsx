"use client";
import { statusLabel } from "../lib/i18n/labels";
import { message as bcText } from "../lib/i18n/source";

import { Localized, useT } from "./localization";

import { useFormatLocale } from "./localization";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./platform-client";
type Billing = {
  configured: boolean;
  plan: string;
  subscription: {
    status: string;
    periodEnd: string;
    cancelAtPeriodEnd: boolean;
    cycle: string;
  } | null;
  paymentMethod: {
    type: string;
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
  } | null;
  hasCustomer: boolean;
  invoices: {
    id: string;
    number: string | null;
    status: string | null;
    date: number;
    total: number;
    currency: string;
    downloadable: boolean;
  }[];
};
export default function BillingDashboard() {
  const locale = useFormatLocale(), t=useT();
  const [data, setData] = useState<Billing | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    setError("");
    try {
      setData(await api<Billing>("billing"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ url?: string; message?: string }>(
        "billing/" + path,
        body,
      );
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      setNotice(result.message ?? bcText("ui.c890307de9b706a9"));
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
          {!data ? (
            <button onClick={load} className="text-button">
              {error ? bcText("ui.ea903878f3e77859") : bcText("ui.2c8af4d4106d408c")}
            </button>
          ) : (
            <>
              {!data.configured && (
                <p className="local-note">{" " + bcText("ui.921d31fae22629de") + " "}</p>
              )}
              <div className="dashboard-cards">
                <section className="panel">
                  <h2>{bcText("ui.37ca715f53b6bb83")}</h2>
                  <strong className="plan-price">{data.plan}</strong>
                  <p>
                    {data.subscription
                      ? `${t(statusLabel(data.subscription.cycle))} · ${t(statusLabel(data.subscription.status))}`
                      : bcText("ui.758d7d3cd6e56224")}
                  </p>
                  <p>
                    {data.subscription
                      ? `${data.subscription.cancelAtPeriodEnd ? bcText("ui.5bfa3156924f476c") : bcText("ui.94263864e7ff5f3a")}: ${new Date(data.subscription.periodEnd).toLocaleDateString(locale)}`
                      : bcText("ui.6d349c4d65688816")}
                  </p>
                  <div className="button-row">
                    <Link href="/subscription" className="secondary-button">
                      {data.plan === bcText("ui.f411a1fb62758b4c") ? bcText("ui.39b7ec1e84022198") : bcText("ui.a72e2bd3e148c05e")}
                    </Link>
                    {data.hasCustomer && (
                      <button
                        disabled={busy}
                        className="secondary-button"
                        onClick={() => action("portal")}
                      >{" " + bcText("ui.4afeed84b77f7977") + " "}</button>
                    )}
                  </div>
                  {data.subscription &&
                    ["active", "past_due"].includes(
                      data.subscription.status,
                    ) && (
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={() =>
                          action(
                            data.subscription!.cancelAtPeriodEnd
                              ? "renew"
                              : "cancel",
                          )
                        }
                      >
                        {data.subscription.cancelAtPeriodEnd
                          ? bcText("ui.cb7dfcc7ed2693d0")
                          : bcText("ui.f81cb4c49c4f2a03")}
                      </button>
                    )}
                  <p className="verification-hint">{" " + bcText("ui.ed342ca87dbcfcd9") + " "}</p>
                </section>
                <section className="panel">
                  <h2>{bcText("ui.b948ac04b854394f")}</h2>
                  <p>
                    {data.paymentMethod
                      ? data.paymentMethod.last4
                        ? bcText("ui.cf5e520b6e469d2e", [data.paymentMethod.brand, data.paymentMethod.last4, data.paymentMethod.expMonth, data.paymentMethod.expYear])
                        : data.paymentMethod.type
                      : bcText("ui.c0bf78172ada2365")}
                  </p>
                  {data.hasCustomer && (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => action("portal")}
                    >{" " + bcText("ui.fa7bfb3b7bd8232e") + " "}</button>
                  )}
                  <p className="verification-hint">{" " + bcText("ui.2b8b6772923d1eb7") + " "}</p>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>{bcText("ui.9aa99a0fb494e1a8")}</h2>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={load}
                  >{" " + bcText("ui.bdb64a9f7e2332f4") + " "}</button>
                </div>
                {data.invoices.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{bcText("ui.b832002da297545f")}</th>
                          <th>{bcText("ui.99c40ab405926cb5")}</th>
                          <th>{bcText("ui.49e96d7cdf58069c")}</th>
                          <th>{bcText("ui.920e413c7d411b61")}</th>
                          <th>{bcText("ui.dad5a969231390f5")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invoices.map((i) => (
                          <tr key={i.id}>
                            <td>{i.number ?? i.id}</td>
                            <td>
                              {new Date(i.date * 1000).toLocaleDateString(
                                locale,
                              )}
                            </td>
                            <td>
                              {new Intl.NumberFormat(locale, {
                                style: "currency",
                                currency: i.currency,
                              }).format(i.total / 100)}
                            </td>
                            <td>{statusLabel(i.status)}</td>
                            <td>
                              {i.downloadable && (
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    action("invoice", { id: i.id })
                                  }
                                >{" " + bcText("ui.4f67fd09c36c3802") + " "}</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>{bcText("ui.bf2a7fa157a0423a")}</p>
                )}
                <p className="verification-hint">{" " + bcText("ui.109fb7fd0e2701f0") + " "}</p>
              </section>
            </>
          )}
        </div>
      }
    </Localized>
  );
}
