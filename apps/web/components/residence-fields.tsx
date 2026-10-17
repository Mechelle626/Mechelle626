"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useState } from "react";
import LocationSearch from "./location-search";
import { useLocale } from "./localization";
export default function ResidenceFields() {
  const [country, setCountry] = useState(""),
    [institution, setInstitution] = useState(""),
    [alternate, setAlternate] = useState(false);
  const locale = useLocale();
  return (
    <Localized>
      {
        <div className="residence-fields">
          <input type="hidden" name="preferredLanguage" value={locale} />
          <input type="hidden" name="school" value={institution} />
          <LocationSearch
            kind="countries"
            label={bcText("ui.a61f6d07876b9429")}
            name="country"
            codeName="countryCode"
            onSelect={(v) => setCountry(v?.code ?? "")}
          />
          <LocationSearch
            kind="regions"
            label={bcText("ui.649f1b05b87c8cf5")}
            name="region"
            codeName="regionCode"
            country={country}
          />
          <LocationSearch
            kind="institutions"
            label={bcText("ui.6f7119cbb4952a62")}
            name="institutionName"
            codeName="institutionId"
            onSelect={(_, text) => setInstitution(text)}
          />
          <div className="field">
            <label htmlFor="institution-email">{" " + bcText("ui.3bf75907f2b65f57") + " "}</label>
            <input
              id="institution-email"
              name="institutionEmail"
              type="email"
              autoComplete="email"
              maxLength={254}
              required={!alternate}
              disabled={alternate}
            />
            <span className="verification-hint">{" " + bcText("ui.074ee6ad1392ee26") + " "}</span>
          </div>
          <label className="checkbox-label alternate-email">
            <input
              type="checkbox"
              name="noEducationalEmail"
              checked={alternate}
              onChange={(e) => setAlternate(e.target.checked)}
            />{" " + bcText("ui.897299dcb20243b0") + " "}</label>
          {alternate && (
            <p className="verification-hint">{" " + bcText("ui.eca47cd01724c5d6") + " "}</p>
          )}
        </div>
      }
    </Localized>
  );
}
