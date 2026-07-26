import type { HazardCategory } from "./types";

export interface CategoryMeta {
  key: HazardCategory;
  label: string;
  /** Marker / accent colour (hex). */
  color: string;
  /** Short glyph used in the legend and list. */
  glyph: string;
}

// Colour language: warm hazards (fire/volcano/heat) run orange→red, water
// hazards run blue→cyan, ground hazards amber, atmospheric violet. Chosen for
// contrast against the dark globe and to read at a glance.
export const CATEGORIES: Record<HazardCategory, CategoryMeta> = {
  wildfire:    { key: "wildfire",    label: "Wildfire",        color: "#ff5a1f", glyph: "▲" },
  volcano:     { key: "volcano",     label: "Volcano",         color: "#ff2d55", glyph: "⬢" },
  earthquake:  { key: "earthquake",  label: "Earthquake",      color: "#ffd60a", glyph: "◆" },
  severeStorm: { key: "severeStorm", label: "Severe Storm",    color: "#5ac8fa", glyph: "✳" },
  flood:       { key: "flood",       label: "Flood",           color: "#0a84ff", glyph: "≈" },
  drought:     { key: "drought",     label: "Drought",         color: "#c99a2e", glyph: "◇" },
  seaLakeIce:  { key: "seaLakeIce",  label: "Sea & Lake Ice",  color: "#a0e9ff", glyph: "❄" },
  landslide:   { key: "landslide",   label: "Landslide",       color: "#bf8a5a", glyph: "⬒" },
  snow:        { key: "snow",        label: "Snow",            color: "#e8f4ff", glyph: "✻" },
  dustHaze:    { key: "dustHaze",    label: "Dust & Haze",     color: "#d9a066", glyph: "░" },
  manmade:     { key: "manmade",     label: "Manmade",         color: "#8e8e93", glyph: "■" },
  waterColor:  { key: "waterColor",  label: "Water Colour",    color: "#2dd4bf", glyph: "●" },
  tempExtreme: { key: "tempExtreme", label: "Temp Extreme",    color: "#ff9f0a", glyph: "☀" },
  other:       { key: "other",       label: "Other",           color: "#98989d", glyph: "•" },
};

export const CATEGORY_ORDER: HazardCategory[] = [
  "wildfire",
  "volcano",
  "earthquake",
  "severeStorm",
  "flood",
  "drought",
  "landslide",
  "seaLakeIce",
  "snow",
  "dustHaze",
  "tempExtreme",
  "waterColor",
  "manmade",
  "other",
];

export function categoryColor(cat: HazardCategory): string {
  return (CATEGORIES[cat] ?? CATEGORIES.other).color;
}

// Map EONET's category ids / titles onto our internal taxonomy.
const EONET_MAP: Record<string, HazardCategory> = {
  wildfires: "wildfire",
  volcanoes: "volcano",
  severeStorms: "severeStorm",
  floods: "flood",
  drought: "drought",
  seaLakeIce: "seaLakeIce",
  landslides: "landslide",
  snow: "snow",
  dustHaze: "dustHaze",
  manmade: "manmade",
  waterColor: "waterColor",
  tempExtremes: "tempExtreme",
  earthquakes: "earthquake",
};

export function mapEonetCategory(id?: string, title?: string): HazardCategory {
  if (id && EONET_MAP[id]) return EONET_MAP[id];
  const t = (title ?? "").toLowerCase();
  if (t.includes("wildfire") || t.includes("fire")) return "wildfire";
  if (t.includes("volcan")) return "volcano";
  if (t.includes("storm") || t.includes("cyclone") || t.includes("typhoon") || t.includes("hurricane")) return "severeStorm";
  if (t.includes("flood")) return "flood";
  if (t.includes("ice")) return "seaLakeIce";
  return "other";
}
