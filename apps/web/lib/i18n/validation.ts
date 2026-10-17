import type { ZodError } from "zod";
import { z } from "zod";
import english from "../../messages/en.json" with { type: "json" };
// Generated library diagnostics are not platform copy. Keep explicit catalog
// messages and use a catalog-backed field message for other validation failures.
const sources = new Set(Object.values(english));
export function validationFields(error: ZodError) {
  return Object.fromEntries(
    Object.entries(z.flattenError(error).fieldErrors as Record<string,string[]|undefined>).map(([key, values]) => [
      key,
      values?.map((value) =>
        sources.has(value) ? value : english["validation.invalid"],
      ),
    ]),
  );
}
