"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useId, useRef, useState } from "react";
import { Search, ChevronDown, LoaderCircle } from "lucide-react";
import type { SchoolOption } from "../lib/school/contracts";
export default function SchoolSearch({
  value,
  onChange,
}: {
  value: SchoolOption | null;
  onChange: (school: SchoolOption | null) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.name ?? ""),
    [options, setOptions] = useState<SchoolOption[]>([]),
    [open, setOpen] = useState(false),
    [index, setIndex] = useState(-1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value?.id]);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(`/api/school/schools?q=${encodeURIComponent(query)}`, {
        signal: abort.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              data.error ?? bcText("ui.b4900e6b555914da"),
            );
          if (!abort.signal.aborted) {
            setOptions(data.schools);
            setIndex(-1);
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timeout);
      abort.abort();
    };
  }, [query, open]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (open && index >= 0)
      document
        .getElementById(`${id}-option-${index}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, index, id]);
  function select(school: SchoolOption) {
    onChange(school);
    setQuery(school.name);
    setOpen(false);
    setIndex(-1);
  }
  return (
    <Localized>
      {
        <div className="field school-combobox" ref={root}>
          <label htmlFor={`${id}-input`}>{bcText("ui.6cd2e331855da821")}</label>
          <div className="school-search-input">
            <Search size={16} />
            <input
              id={`${id}-input`}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={`${id}-options`}
              aria-activedescendant={
                index >= 0 ? `${id}-option-${index}` : undefined
              }
              autoComplete="off"
              placeholder={bcText("ui.1f6280b3c88378f4")}
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                if (value) onChange(null);
                setOpen(true);
                setIndex(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === bcText("ui.9660fb862202c3be")) {
                  e.preventDefault();
                  setOpen(true);
                  setIndex((i) => Math.min(i + 1, options.length - 1));
                }
                if (e.key === bcText("ui.12204d1d8ab89f8a")) {
                  e.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                }
                if (e.key === bcText("ui.dc8659db6d416dc3") && open && index >= 0 && options[index]) {
                  e.preventDefault();
                  select(options[index]);
                }
                if (e.key === bcText("ui.037c968467aa3fd7")) setOpen(false);
                if (e.key === bcText("ui.90ddf1963abb36c9")) setOpen(false);
              }}
            />
            <ChevronDown size={14} />
          </div>
          {open && (
            <div className="school-search-results">
              <ul id={`${id}-options`} role="listbox" aria-label={bcText("ui.af2e91296939b127")}>
                {options.map((school, i) => (
                  <li
                    id={`${id}-option-${i}`}
                    role="option"
                    data-no-translate
                    key={school.id}
                    aria-selected={value?.id === school.id}
                    className={index === i ? "highlighted" : ""}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => select(school)}
                  >
                    {school.name}
                  </li>
                ))}
              </ul>
              {loading && (
                <p className="school-search-feedback">
                  <LoaderCircle size={13} className="spin" />{" " + bcText("ui.c31723ab330289fe") + " "}</p>
              )}
              {error && (
                <p className="school-search-feedback" role="alert">
                  {error}
                </p>
              )}
              {!loading && !error && options.length === 0 && (
                <p className="school-search-feedback">{" " + bcText("ui.593aa735f0b77893") + " "}</p>
              )}
            </div>
          )}
          <span className="verification-hint">{" " + bcText("ui.dabc27d771618976") + " "}</span>
        </div>
      }
    </Localized>
  );
}
