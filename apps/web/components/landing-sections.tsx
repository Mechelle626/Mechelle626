"use client";
import { message as bcText } from "../lib/i18n/source";

import Link from "next/link";
import Pricing from "./pricing";
import { Localized } from "./localization";
export default function LandingSections() {
  return (
    <Localized>
      <section className="landing-section" aria-labelledby="landing-plans">
        <h2 id="landing-plans">{bcText("ui.016e816297ab23f8")}</h2>
        <p>{bcText("ui.b955bb69b2b673d5")}</p>
        <Pricing />
      </section>
      <section
        className="landing-section landing-overview"
        aria-label={bcText("ui.9b0b59485955e823")}
      >
        <article className="panel">
          <h2>{bcText("ui.cf4f1f5b92f2b9f5")}</h2>
          <p>{bcText("ui.7e157bf6a8606ebc")}</p>
          <p>{bcText("ui.026d6756b6ad94df")}</p>
          <Link href="/signup">{bcText("ui.f6cfd3bc8153637b")}</Link>
        </article>
        <article className="panel">
          <h2>{bcText("ui.fcc61ff90aea04a7")}</h2>
          <div
            className="landing-buddy"
            aria-label={bcText("ui.9d6290ffb5497648")}
          >
            🌱
          </div>
          <p>{bcText("ui.5e29bf6e5203a6bd")}</p>
          <p>{bcText("ui.256d5c32a1d3825f")}</p>
        </article>
      </section>
      <section className="landing-section panel" aria-labelledby="landing-faq">
        <h2 id="landing-faq">{bcText("ui.e956a9404b467e6b")}</h2>
        <details>
          <summary>{bcText("ui.a93daffb39bd12e4")}</summary>
          <p>{bcText("ui.ddc810e946e8c0e5")}</p>
        </details>
        <details>
          <summary>{bcText("ui.d4506701199c3433")}</summary>
          <p>{bcText("ui.29ced487e51667b4")}</p>
        </details>
        <details>
          <summary>{bcText("ui.c93a7eac05fe78eb")}</summary>
          <p>{bcText("ui.bbb4d402eb9fc2cf")}</p>
        </details>
        <details>
          <summary>{bcText("ui.3e3a569a0415205a")}</summary>
          <p>{bcText("ui.c4cd8222937c7475")}</p>
        </details>
        <details>
          <summary>{bcText("ui.bad132a35c7ec024")}</summary>
          <p>{bcText("ui.97d082b138041bdd")}</p>
        </details>
      </section>
      <footer
        className="landing-section landing-footer"
        aria-label={bcText("ui.f8ce9963dd54726d")}
      >
        <strong>{bcText("ui.b1ebb4e795a4b7a7")}</strong>
        <nav aria-label={bcText("ui.af034eca695190bc")}>
          <Link href="/pricing">{bcText("ui.a5518d3c7a8d6f90")}</Link>
          <Link href="/login">{bcText("ui.c189840cf7e2d6f6")}</Link>
          <Link href="/signup">{bcText("ui.fc22ae6f6720bb19")}</Link>
        </nav>
        <p>{bcText("ui.ef4763558ea7a2cb")}</p>
      </footer>
    </Localized>
  );
}
