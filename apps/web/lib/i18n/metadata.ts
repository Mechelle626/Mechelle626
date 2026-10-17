import type { Metadata } from "next";
import { requestLocale, loadCatalog } from "./server";
import { translate } from "./translate";
export async function localizedMetadata(source: Metadata): Promise<Metadata> {
  const catalog = await loadCatalog(await requestLocale());
  return {
    ...source,
    title:
      typeof source.title === "string"
        ? translate(source.title, catalog)
        : source.title &&
            typeof source.title === "object" &&
            "default" in source.title
          ? {
              ...source.title,
              default: translate(source.title.default, catalog),
              ...("template" in source.title && source.title.template
                ? { template: translate(source.title.template, catalog) }
                : {}),
            }
          : source.title,
    description: source.description
      ? translate(source.description, catalog)
      : source.description,
  };
}
