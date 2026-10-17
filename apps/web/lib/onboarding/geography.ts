import { allCountries } from "country-region-data";
// Bundled country/territory and region data. Manual entry remains available for omissions.
const records = allCountries.map((entry) => ({
  name: entry[0],
  isoCode: entry[1],
  regions: entry[2],
}));
export const Country = {
  getAllCountries: () =>
    records
      .map(({ name, isoCode }) => ({ name, isoCode }))
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
  getCountryByCode: (code: string) => records.find((c) => c.isoCode === code),
};
export const State = {
  getStatesOfCountry: (code: string) =>
    (Country.getCountryByCode(code)?.regions ?? []).map(([name, isoCode]) => ({
      name,
      isoCode,
    })),
  getStateByCodeAndCountry: (region: string, country: string) =>
    State.getStatesOfCountry(country).find((r) => r.isoCode === region),
};
