import { message as bcText } from "../lib/i18n/source";
import { Localized } from "./localization";
import Link from "next/link";
import {
  Brain,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  MoveUpRight,
} from "lucide-react";
export function Brand() {
  return (
    <Localized>
      {
        <Link href="/" className="brand" aria-label={bcText("ui.ea9a15566f23f596")}>
          <span className="brand-icon">
            <Brain size={24} />
          </span>
          <span>{" " + bcText("ui.bbbf7a6412d6d3e8")}<span className="brand-light">{bcText("ui.c9dce81228649d0a")}</span>
            <span className="brand-dot">.</span>
          </span>
        </Link>
      }
    </Localized>
  );
}
export function AuthShell({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: string;
}) {
  const isSignup = mode === "signup" || mode === "complete-profile";
  return (
    <Localized>
      {
        <main className="auth-layout">
          <aside className="story-panel">
            <Brand />
            <div className="story-content">
              <div className="eyebrow">
                <span />{" " + bcText("ui.addd6246aae00e0c") + " "}</div>
              <h1>{" " + bcText("ui.936e05aaaaa11d29") + " "}<br />{bcText("ui.2564d272018f2771") + " "}<span>{bcText("ui.b22c720ddd46e6a2")}</span>
                <svg viewBox="0 0 250 16" aria-hidden="true">
                  <path d="M3 11 Q120 -3 245 8 M37 15 Q135 5 225 13" />
                </svg>
              </h1>
              <p>{" " + bcText("ui.a3e0b72dae31eb33") + " "}<br />{bcText("ui.084d3050bdcd459c") + " "}</p>
              <div className="campus-art" aria-hidden="true">
                <div className="art-orbit orbit-one" />
                <div className="art-orbit orbit-two" />
                <span className="art-star star-one">✳</span>
                <span className="art-star star-two">✧</span>
                <div className="note note-back">
                  <span className="note-label">{bcText("ui.995e78a23a4f9ee5")}</span>
                  <div className="doodle">
                    <svg viewBox="0 0 200 100">
                      <path d="M15 75 Q45 75 45 40 Q45 5 72 20 Q95 35 80 57 Q65 80 110 80 Q150 80 135 45 Q120 10 165 25 L190 5 M174 7 L190 5 L188 22" />
                    </svg>
                  </div>
                  <span className="note-hand">{bcText("ui.d6b8e046ad88cdfd")}</span>
                </div>
                <div className="note note-front">
                  <span className="note-label">{bcText("ui.ce35f251efbe43b8")}</span>
                  <div className="note-title">{" " + bcText("ui.ace3100c94995d87") + " "}<br />{" " + bcText("ui.58b4ea0604777d59") + " "}<span>
                      <ArrowUpRight size={40} />
                    </span>
                  </div>
                  <div className="note-bottom">
                    <span className="mini-brain">
                      <Brain size={22} />
                    </span>
                    <span>{bcText("ui.8cadfef7cefb8edc")}</span>
                    <span className="note-spark">✦</span>
                  </div>
                </div>
                <div className="floating-label">
                  <Sparkles size={15} />{" " + bcText("ui.bf54bfaa69de59a6") + " "}</div>
              </div>
              <div className="story-caption">
                <span className="caption-line" />{bcText("ui.db9f5c74182a4802") + " "}</div>
            </div>
            <div className="story-footer">
              <span>{bcText("ui.1907990fc1c35273")}</span>
              <ArrowUpRight size={18} />
            </div>
          </aside>
          <section className="form-panel">
            <header className="mobile-brand">
              <Brand />
            </header>
            <div className="top-navigation">
              <span>
                {isSignup
                  ? bcText("ui.bad6dcb605d4597f")
                  : bcText("ui.e4df9b126d0e3065")}
              </span>
              <Link href={isSignup ? "/login" : "/signup"}>
                {isSignup ? bcText("ui.bfd402b2f6f38125") : bcText("ui.86033f75a4c0876a")}
                <MoveUpRight size={14} />
              </Link>
            </div>
            <div className="form-content">{children}</div>
            <footer className="form-footer">
              <span>
                <ShieldCheck size={14} />{" " + bcText("ui.e88794233de1750f") + " "}</span>
              <span>© {new Date().getFullYear()}{" " + bcText("ui.b1ebb4e795a4b7a7")}</span>
            </footer>
          </section>
        </main>
      }
    </Localized>
  );
}
