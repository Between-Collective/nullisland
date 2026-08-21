import { FORMATS } from "./formats/index";
import { CATEGORY_LABELS, CATEGORY_ORDER, PROBLEMS } from "./problems";
import { FAMILIES, PROFILES, profileShape } from "./profiles/index";
import { Rng } from "./rng";
import { PLACES } from "./search/places";
import { getSubject } from "./search/phrasing";
import { QUIRK_CATEGORY_LABELS, QUIRK_CATEGORY_ORDER, QUIRKS } from "./search/quirks";
import { TERM_FORMATS } from "./search/write";
import { SITE_URL } from "./site";

/**
 * Everything this tool knows about, as one document.
 *
 * The generators each expose their own slice — `--list types`, `--list quirks`
 * — which is right for choosing an id. This is for the other job: working out
 * what a user meant. A classifier deciding whether "planes over Lisbon" is
 * about flight data needs to know that `flight-adsb` exists, that its own word
 * is "aircraft", and that planes, jets, flights and aviation all point at it.
 * That mapping was only ever inside the generator, where nothing else could
 * read it.
 *
 * Built from the same catalogues the generators read, so it cannot drift from
 * what they will actually accept.
 */

export interface CatalogueDataType {
  id: string;
  label: string;
  family: string;
  blurb: string;
  /** The geometry this data really comes in. */
  shape: string;
  /** The schema's own word for one of them, and for several. */
  singular: string;
  plural: string;
  /**
   * Every other word people use for it. The point of the whole document: these
   * are what arrives in a search box, and none of them is the schema's word.
   */
  aliases: string[];
  columns: string[];
  typicalProblems: string[];
}

export interface Catalogue {
  generator: string;
  url: string;
  /** What each section is for, so the file explains itself. */
  about: Record<string, string>;
  families: Array<{ id: string; label: string }>;
  dataTypes: CatalogueDataType[];
  quirks: Array<{
    id: string;
    label: string;
    blurb: string;
    category: string;
    categoryLabel: string;
    phase: string;
    needs: string;
    example: string;
  }>;
  problems: Array<{
    id: string;
    label: string;
    blurb: string;
    category: string;
    categoryLabel: string;
    formats: string[];
    dataTypes: string[] | "all";
  }>;
  places: Array<{
    id: string;
    name: string;
    kind: string;
    lon: number;
    lat: number;
    bbox: [number, number, number, number];
    country: string;
    within: string | null;
    aliases: Array<{ name: string; kind: string }>;
    ambiguousWith: string[];
    population: number | null;
    note: string | null;
  }>;
  fileFormats: Array<{ id: string; label: string; ext: string; mime: string; binary: boolean }>;
  termFormats: Array<{ id: string; label: string; ext: string; mime: string; groundTruth: boolean }>;
}

export function buildCatalogue(): Catalogue {
  return {
    generator: "Null Island",
    url: SITE_URL,
    about: {
      dataTypes:
        "Every kind of thing a fixture or a query can be about. `plural` is the schema's own word; " +
        "`aliases` are the words people actually type for it, which is what a classifier has to map from.",
      quirks: "What is hard about a search term. `needs` is what a query must already contain before the entry means anything.",
      problems: "What can be wrong with a file. `formats` and `dataTypes` are where each one can exist.",
      places: "The gazetteer queries resolve against. `ambiguousWith` is every other place answering to the same name.",
    },
    families: FAMILIES.map((f) => ({ id: f.id, label: f.label })),

    dataTypes: PROFILES.map((profile) => {
      const subject = getSubject(profile.id);
      return {
        id: profile.id,
        label: profile.label,
        family: profile.family,
        blurb: profile.blurb,
        shape: profileShape(profile),
        singular: subject.singular,
        plural: subject.plural,
        aliases: [...(subject.aliases ?? [])],
        // The generic export builds its properties outright rather than from a
        // field list, so its columns are read off one sample — an empty array
        // would read as "no attributes", which is not true of it.
        columns: profile.fields?.length
          ? profile.fields.map((f) => f.name)
          : profile.build
            ? Object.keys(profile.build(new Rng("catalogue"), 0))
            : [],
        typicalProblems: profile.apt,
      };
    }),

    quirks: QUIRKS.map((q) => ({
      id: q.id,
      label: q.label,
      blurb: q.blurb,
      category: q.category,
      categoryLabel: QUIRK_CATEGORY_LABELS[q.category],
      phase: q.phase,
      needs: q.needs,
      example: q.example,
    })),

    problems: PROBLEMS.map((p) => ({
      id: p.id,
      label: p.label,
      blurb: p.blurb,
      category: p.category,
      categoryLabel: CATEGORY_LABELS[p.category],
      // Spelled out rather than omitted, so a reader never has to know that a
      // missing key meant "all of them".
      formats: p.appliesTo ?? FORMATS.map((f) => f.id),
      dataTypes: p.profiles ?? "all",
    })),

    places: PLACES.map((place) => ({
      id: place.id,
      name: place.name,
      kind: place.kind,
      lon: place.lon,
      lat: place.lat,
      bbox: place.bbox,
      country: place.country,
      within: place.within ?? null,
      aliases: (place.aliases ?? []).map((a) => ({ name: a.name, kind: a.kind })),
      ambiguousWith: place.ambiguousWith ?? [],
      population: place.population ?? null,
      note: place.note ?? null,
    })),

    fileFormats: FORMATS.map((f) => ({
      id: f.id,
      label: f.label,
      ext: f.ext,
      mime: f.mime,
      binary: f.binary,
    })),
    termFormats: TERM_FORMATS.map((f) => ({
      id: f.id,
      label: f.label,
      ext: f.ext,
      mime: f.mime,
      groundTruth: f.groundTruth,
    })),
  };
}

/** The catalogue as a file, ready to hand to whatever is going to read it. */
export function writeCatalogue(): { filename: string; mime: string; data: string } {
  const data = `${JSON.stringify(buildCatalogue(), null, 2)}\n`;
  return { filename: "nullisland-catalogue.json", mime: "application/json", data };
}

export { CATEGORY_ORDER, QUIRK_CATEGORY_ORDER };
