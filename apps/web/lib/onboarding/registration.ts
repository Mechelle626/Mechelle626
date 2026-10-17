import { message as bcText } from "../i18n/source";
import { z } from "zod";
import { Country, State } from "./geography";
import { assertLocale } from "../i18n/store";
import { db } from "../auth/db";
import { AuthError } from "../auth/security";
export const residenceSchema = z
  .object({
    country: z.string().trim().min(2).max(160),
    countryCode: z.string().length(2).optional(),
    region: z.string().trim().min(1).max(160),
    regionCode: z.string().max(12).optional(),
    institutionName: z.string().trim().min(2).max(160),
    institutionId: z.uuid().optional(),
    institutionEmail: z
      .union([z.string().trim().toLowerCase().email().max(254), z.literal("")])
      .default(""),
    noEducationalEmail: z.boolean(),
    preferredLanguage: z.string().min(2).max(60),
  })
  .superRefine((v, c) => {
    if (!v.noEducationalEmail && !v.institutionEmail)
      c.addIssue({
        code: "custom",
        path: ["institutionEmail"],
        message:
          bcText("ui.75e0d80e8cf39d5a"),
      });
    if (v.noEducationalEmail && v.institutionEmail)
      c.addIssue({
        code: "custom",
        path: ["institutionEmail"],
        message:
          bcText("ui.ad668ab1b4b92e1d"),
      });
  });
export type Residence = z.infer<typeof residenceSchema>;
export async function validateResidence(input: Residence) {
  input.preferredLanguage = await assertLocale(input.preferredLanguage);
  if (input.countryCode) {
    const c = Country.getCountryByCode(input.countryCode);
    if (!c || c.name !== input.country)
      throw new AuthError(400, bcText("ui.1aee5accf352f119"));
  }
  if (input.regionCode) {
    if (!input.countryCode)
      throw new AuthError(400, bcText("ui.4b7b2564aec8587a"));
    const s = State.getStateByCodeAndCountry(
      input.regionCode,
      input.countryCode,
    );
    if (!s || s.name !== input.region)
      throw new AuthError(400, bcText("ui.2ca43cc30c5ddb1a"));
  }
  if (input.institutionId) {
    const school = (
      await db.query(
        "SELECT name FROM braincraze.schools WHERE id=$1 AND active",
        [input.institutionId],
      )
    ).rows[0];
    if (!school || school.name !== input.institutionName)
      throw new AuthError(
        400,
        bcText("ui.a724e8b329ae1f2a"),
      );
  }
}
export async function applyResidence(
  id: string,
  input: Residence,
  client: Pick<import("pg").PoolClient, "query"> = db,
) {
  await client.query(
    `UPDATE braincraze.users SET country=$2,country_code=$3,region=$4,region_code=$5,institution_name=$6,institution_email=$7,institution_id=$8,preferred_language=$9,onboarding_required=true,school=$6 WHERE id=$1`,
    [
      id,
      input.country,
      input.countryCode ?? null,
      input.region,
      input.regionCode ?? null,
      input.institutionName,
      input.institutionEmail || null,
      input.institutionId ?? null,
      input.preferredLanguage,
    ],
  );
}
