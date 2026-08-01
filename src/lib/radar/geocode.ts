/**
 * Headline gazetteer: radar events carry no coordinates, so the news layer
 * places a pin only when the headline (title + summary) names a place this
 * table knows. Three tiers, most-specific wins: cities/regions, then
 * countries, then demonyms ("Russian" → Russia). Within a tier the longest
 * name wins ("South Korea" before "Korea"). Whole-word, case-insensitive
 * matches only. No match = no pin (the caller counts it as unplottable —
 * surfaced, never silent). Extend by adding rows; nothing else to wire.
 */

export interface GeoHit {
  place: string;
  lat: number;
  lon: number;
}

export const LONDON: GeoHit = { place: "London", lat: 51.507, lon: -0.128 };

type Row = [name: string, lat: number, lon: number, canonical?: string];

const CITIES_AND_REGIONS: Row[] = [
  ["Kyiv", 50.45, 30.52], ["Kiev", 50.45, 30.52, "Kyiv"],
  ["Moscow", 55.76, 37.62], ["Odesa", 46.48, 30.72], ["Kharkiv", 49.99, 36.23],
  ["Donetsk", 48.0, 37.8], ["Crimea", 45.3, 34.5], ["Caspian", 41.0, 51.0],
  ["Gaza", 31.42, 34.37], ["West Bank", 31.9, 35.3], ["Jerusalem", 31.77, 35.21],
  ["Tel Aviv", 32.07, 34.78], ["Beirut", 33.89, 35.5], ["Damascus", 33.51, 36.29],
  ["Tehran", 35.69, 51.39], ["Strait of Hormuz", 26.6, 56.25], ["Red Sea", 19.0, 39.0],
  ["Baghdad", 33.32, 44.36], ["Riyadh", 24.69, 46.72], ["Kabul", 34.53, 69.17],
  ["Islamabad", 33.69, 73.06], ["Karachi", 24.86, 67.0], ["Delhi", 28.61, 77.21],
  ["Mumbai", 19.08, 72.88], ["Kashmir", 34.1, 74.8], ["Colombo", 6.93, 79.86],
  ["Dhaka", 23.81, 90.41], ["Yangon", 16.87, 96.2], ["Bangkok", 13.76, 100.5],
  ["Singapore", 1.35, 103.82], ["Jakarta", -6.21, 106.85], ["Manila", 14.6, 120.98],
  ["Hong Kong", 22.32, 114.17], ["Taipei", 25.03, 121.57],
  ["Taiwan Strait", 24.5, 119.5], ["South China Sea", 12.0, 113.0],
  ["Beijing", 39.9, 116.4], ["Shanghai", 31.23, 121.47], ["Seoul", 37.57, 126.98],
  ["Pyongyang", 39.03, 125.75], ["Tokyo", 35.68, 139.69], ["Okinawa", 26.33, 127.8],
  ["Sydney", -33.87, 151.21], ["Melbourne", -37.81, 144.96], ["Canberra", -35.28, 149.13],
  ["Auckland", -36.85, 174.76], ["Wellington", -41.29, 174.78],
  ["Cairo", 30.04, 31.24], ["Suez", 30.0, 32.55], ["Tripoli", 32.89, 13.19],
  ["Khartoum", 15.5, 32.56], ["Addis Ababa", 9.01, 38.75], ["Mogadishu", 2.05, 45.32],
  ["Nairobi", -1.29, 36.82], ["Lagos", 6.52, 3.38], ["Abuja", 9.06, 7.49],
  ["Kinshasa", -4.44, 15.27], ["Johannesburg", -26.2, 28.05], ["Cape Town", -33.92, 18.42],
  ["Sahel", 15.0, 0.0], ["Ceuta", 35.89, -5.32], ["Canary Islands", 28.3, -16.5],
  ["Gibraltar", 36.14, -5.35], ["Madrid", 40.42, -3.7], ["Barcelona", 41.39, 2.17],
  ["Lisbon", 38.72, -9.14], ["Paris", 48.86, 2.35], ["Marseille", 43.3, 5.37],
  ["Brussels", 50.85, 4.35], ["Amsterdam", 52.37, 4.9], ["Berlin", 52.52, 13.4],
  ["Munich", 48.14, 11.58], ["Vienna", 48.21, 16.37], ["Zurich", 47.38, 8.54],
  ["Geneva", 46.2, 6.14], ["Rome", 41.9, 12.5], ["Milan", 45.46, 9.19],
  ["Athens", 37.98, 23.73], ["Istanbul", 41.01, 28.98], ["Ankara", 39.93, 32.86],
  ["Warsaw", 52.23, 21.01], ["Prague", 50.09, 14.42], ["Budapest", 47.5, 19.04],
  ["Bucharest", 44.43, 26.1], ["Belgrade", 44.79, 20.45], ["Sarajevo", 43.86, 18.41],
  ["Stockholm", 59.33, 18.07], ["Oslo", 59.91, 10.75], ["Copenhagen", 55.68, 12.57],
  ["Helsinki", 60.17, 24.94], ["Reykjavik", 64.15, -21.94], ["Dublin", 53.35, -6.26],
  ["Belfast", 54.6, -5.93], ["Edinburgh", 55.95, -3.19], ["Glasgow", 55.86, -4.25],
  ["Manchester", 53.48, -2.24], ["Birmingham", 52.49, -1.89], ["Liverpool", 53.41, -2.98],
  ["Leeds", 53.8, -1.55], ["Cardiff", 51.48, -3.18],
  ["Washington", 38.91, -77.04], ["New York", 40.71, -74.01], ["Los Angeles", 34.05, -118.24],
  ["San Francisco", 37.77, -122.42], ["Chicago", 41.88, -87.63], ["Miami", 25.76, -80.19],
  ["Texas", 31.0, -99.0], ["California", 36.8, -119.4], ["Florida", 27.7, -81.5],
  ["Ottawa", 45.42, -75.7], ["Toronto", 43.65, -79.38], ["Vancouver", 49.28, -123.12],
  ["Mexico City", 19.43, -99.13], ["Havana", 23.11, -82.37], ["Port-au-Prince", 18.54, -72.34],
  ["Caracas", 10.48, -66.9], ["Bogota", 4.71, -74.07], ["Lima", -12.05, -77.04],
  ["Quito", -0.18, -78.47], ["Santiago", -33.45, -70.67], ["Buenos Aires", -34.6, -58.38],
  ["Brasilia", -15.79, -47.88], ["Sao Paulo", -23.55, -46.63], ["Rio de Janeiro", -22.91, -43.17],
  ["Amazon", -3.47, -62.37], ["Panama Canal", 9.08, -79.68],
];

const COUNTRIES: Row[] = [
  ["Ukraine", 49.0, 31.0], ["Russia", 61.5, 90.0], ["Belarus", 53.7, 27.95],
  ["Poland", 51.92, 19.15], ["Germany", 51.17, 10.45], ["France", 46.23, 2.21],
  ["Spain", 40.46, -3.75], ["Portugal", 39.4, -8.22], ["Italy", 41.87, 12.57],
  ["Greece", 39.07, 21.82], ["Turkey", 38.96, 35.24], ["United Kingdom", 52.5, -1.5],
  ["Britain", 52.5, -1.5, "United Kingdom"], ["England", 52.5, -1.5, "United Kingdom"],
  ["Scotland", 56.49, -4.2, "United Kingdom"], ["Wales", 52.13, -3.78, "United Kingdom"],
  ["Ireland", 53.14, -7.69], ["Netherlands", 52.13, 5.29], ["Belgium", 50.5, 4.47],
  ["Switzerland", 46.82, 8.23], ["Austria", 47.52, 14.55], ["Norway", 60.47, 8.47],
  ["Sweden", 60.13, 18.64], ["Finland", 61.92, 25.75], ["Denmark", 56.26, 9.5],
  ["Iceland", 64.96, -19.02], ["Czech Republic", 49.82, 15.47], ["Slovakia", 48.67, 19.7],
  ["Hungary", 47.16, 19.5], ["Romania", 45.94, 24.97], ["Bulgaria", 42.73, 25.49],
  ["Serbia", 44.02, 21.01], ["Croatia", 45.1, 15.2], ["Bosnia", 43.92, 17.68],
  ["Albania", 41.15, 20.17], ["Kosovo", 42.6, 20.9], ["Moldova", 47.41, 28.37],
  ["Georgia", 42.32, 43.36], ["Armenia", 40.07, 45.04], ["Azerbaijan", 40.14, 47.58],
  ["Kazakhstan", 48.02, 66.92], ["Uzbekistan", 41.38, 64.59], ["Turkmenistan", 38.97, 59.56],
  ["Afghanistan", 33.94, 67.71], ["Pakistan", 30.38, 69.35], ["India", 20.59, 78.96],
  ["Nepal", 28.39, 84.12], ["Bangladesh", 23.68, 90.36], ["Sri Lanka", 7.87, 80.77],
  ["Myanmar", 21.91, 95.96], ["Burma", 21.91, 95.96, "Myanmar"], ["Thailand", 15.87, 100.99],
  ["Vietnam", 14.06, 108.28], ["Cambodia", 12.57, 104.99], ["Laos", 19.86, 102.5],
  ["Malaysia", 4.21, 101.98], ["Indonesia", -0.79, 113.92], ["Philippines", 12.88, 121.77],
  ["China", 35.86, 104.2], ["Taiwan", 23.7, 120.96], ["Japan", 36.2, 138.25],
  ["North Korea", 40.34, 127.51], ["South Korea", 35.91, 127.77],
  ["Korea", 37.0, 127.5, "Korea"], ["Mongolia", 46.86, 103.85],
  ["Australia", -25.27, 133.78], ["New Zealand", -40.9, 174.89],
  ["Papua New Guinea", -6.31, 143.96], ["Fiji", -17.71, 178.07],
  ["Iran", 32.43, 53.69], ["Iraq", 33.22, 43.68], ["Syria", 34.8, 38.99],
  ["Lebanon", 33.85, 35.86], ["Israel", 31.05, 34.85], ["Palestine", 31.9, 35.2],
  ["Jordan", 30.59, 36.24], ["Saudi Arabia", 23.89, 45.08], ["Yemen", 15.55, 48.52],
  ["Oman", 21.51, 55.92], ["Qatar", 25.35, 51.18], ["Kuwait", 29.31, 47.48],
  ["Bahrain", 26.07, 50.56], ["United Arab Emirates", 23.42, 53.85],
  ["Dubai", 25.2, 55.27], ["Egypt", 26.82, 30.8], ["Libya", 26.34, 17.23],
  ["Tunisia", 33.89, 9.54], ["Algeria", 28.03, 1.66], ["Morocco", 31.79, -7.09],
  ["Sudan", 12.86, 30.22], ["South Sudan", 6.88, 31.31], ["Ethiopia", 9.15, 40.49],
  ["Eritrea", 15.18, 39.78], ["Somalia", 5.15, 46.2], ["Kenya", -0.02, 37.91],
  ["Tanzania", -6.37, 34.89], ["Uganda", 1.37, 32.29], ["Rwanda", -1.94, 29.87],
  ["Congo", -4.04, 21.76], ["Nigeria", 9.08, 8.68], ["Ghana", 7.95, -1.02],
  ["Ivory Coast", 7.54, -5.55], ["Senegal", 14.5, -14.45], ["Mali", 17.57, -4.0],
  ["Niger", 17.61, 8.08], ["Chad", 15.45, 18.73], ["Cameroon", 7.37, 12.35],
  ["Angola", -11.2, 17.87], ["Zambia", -13.13, 27.85], ["Zimbabwe", -19.02, 29.15],
  ["Mozambique", -18.67, 35.53], ["Madagascar", -18.77, 46.87],
  ["South Africa", -30.56, 22.94], ["Namibia", -22.96, 18.49], ["Botswana", -22.33, 24.68],
  ["United States", 39.83, -98.58], ["America", 39.83, -98.58, "United States"],
  ["Canada", 56.13, -106.35], ["Mexico", 23.63, -102.55], ["Guatemala", 15.78, -90.23],
  ["Honduras", 15.2, -86.24], ["Nicaragua", 12.87, -85.21], ["Panama", 8.54, -80.78],
  ["Cuba", 21.52, -77.78], ["Haiti", 18.97, -72.29], ["Jamaica", 18.11, -77.3],
  ["Dominican Republic", 18.74, -70.16], ["Venezuela", 6.42, -66.59],
  ["Colombia", 4.57, -74.3], ["Ecuador", -1.83, -78.18], ["Peru", -9.19, -75.02],
  ["Bolivia", -16.29, -63.59], ["Chile", -35.68, -71.54], ["Argentina", -38.42, -63.62],
  ["Uruguay", -32.52, -55.77], ["Paraguay", -23.44, -58.44], ["Brazil", -14.24, -51.93],
  ["Greenland", 71.71, -42.6], ["Antarctica", -82.86, 135.0],
];

/** Demonyms and adjectives — the last resort tier. */
const DEMONYMS: Row[] = [
  ["Russian", 61.5, 90.0, "Russia"], ["Ukrainian", 49.0, 31.0, "Ukraine"],
  ["Chinese", 35.86, 104.2, "China"], ["Japanese", 36.2, 138.25, "Japan"],
  ["Indian", 20.59, 78.96, "India"], ["Pakistani", 30.38, 69.35, "Pakistan"],
  ["Iranian", 32.43, 53.69, "Iran"], ["Israeli", 31.05, 34.85, "Israel"],
  ["Palestinian", 31.9, 35.2, "Palestine"], ["Saudi", 23.89, 45.08, "Saudi Arabia"],
  ["Turkish", 38.96, 35.24, "Turkey"], ["Egyptian", 26.82, 30.8, "Egypt"],
  ["Nigerian", 9.08, 8.68, "Nigeria"], ["Kenyan", -0.02, 37.91, "Kenya"],
  ["Ethiopian", 9.15, 40.49, "Ethiopia"], ["Sudanese", 12.86, 30.22, "Sudan"],
  ["American", 39.83, -98.58, "United States"], ["Mexican", 23.63, -102.55, "Mexico"],
  ["Canadian", 56.13, -106.35, "Canada"], ["Brazilian", -14.24, -51.93, "Brazil"],
  ["Peruvian", -9.19, -75.02, "Peru"], ["Chilean", -35.68, -71.54, "Chile"],
  ["Argentine", -38.42, -63.62, "Argentina"], ["Venezuelan", 6.42, -66.59, "Venezuela"],
  ["French", 46.23, 2.21, "France"], ["German", 51.17, 10.45, "Germany"],
  ["Spanish", 40.46, -3.75, "Spain"], ["Italian", 41.87, 12.57, "Italy"],
  ["Greek", 39.07, 21.82, "Greece"], ["Polish", 51.92, 19.15, "Poland"],
  ["Dutch", 52.13, 5.29, "Netherlands"], ["Swedish", 60.13, 18.64, "Sweden"],
  ["Norwegian", 60.47, 8.47, "Norway"], ["Finnish", 61.92, 25.75, "Finland"],
  ["Danish", 56.26, 9.5, "Denmark"], ["Irish", 53.14, -7.69, "Ireland"],
  ["British", 52.5, -1.5, "United Kingdom"], ["Scottish", 56.49, -4.2, "United Kingdom"],
  ["Welsh", 52.13, -3.78, "United Kingdom"], ["Australian", -25.27, 133.78, "Australia"],
  ["Indonesian", -0.79, 113.92, "Indonesia"], ["Filipino", 12.88, 121.77, "Philippines"],
  ["Vietnamese", 14.06, 108.28, "Vietnam"], ["Thai", 15.87, 100.99, "Thailand"],
  ["Afghan", 33.94, 67.71, "Afghanistan"], ["Iraqi", 33.22, 43.68, "Iraq"],
  ["Syrian", 34.8, 38.99, "Syria"], ["Lebanese", 33.85, 35.86, "Lebanon"],
  ["Yemeni", 15.55, 48.52, "Yemen"], ["Houthi", 15.55, 48.52, "Yemen"],
  ["Houthis", 15.55, 48.52, "Yemen"], ["Korean", 37.0, 127.5, "Korea"],
  ["Taiwanese", 23.7, 120.96, "Taiwan"], ["Cuban", 21.52, -77.78, "Cuba"],
  ["Haitian", 18.97, -72.29, "Haiti"], ["Colombian", 4.57, -74.3, "Colombia"],
  ["Somali", 5.15, 46.2, "Somalia"], ["Libyan", 26.34, 17.23, "Libya"],
  ["Moroccan", 31.79, -7.09, "Morocco"], ["Algerian", 28.03, 1.66, "Algeria"],
];

/** Every place this gazetteer knows, flattened — the reverse direction
 *  (coords -> nearest named place) reads this in src/lib/pulse/region.ts.
 *  Deduped by name: several rows are aliases of the same canonical place
 *  ("Kiev"/"Kyiv"), and a nearest-place search must not weigh one twice. */
export const GAZETTEER_PLACES: GeoHit[] = (() => {
  const byName = new Map<string, GeoHit>();
  for (const [name, lat, lon, canonical] of [...CITIES_AND_REGIONS, ...COUNTRIES]) {
    const place = canonical ?? name;
    if (!byName.has(place)) byName.set(place, { place, lat, lon });
  }
  return [...byName.values()];
})();

interface Compiled {
  re: RegExp;
  hit: GeoHit;
}

const compileTier = (rows: Row[]): Compiled[] =>
  rows
    .slice()
    .sort((a, b) => b[0].length - a[0].length)
    .map(([name, lat, lon, canonical]) => ({
      // Word-boundary match; names are plain ASCII words so \b is safe here.
      re: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
      hit: { place: canonical ?? name, lat, lon },
    }));

const TIERS: Compiled[][] = [
  compileTier(CITIES_AND_REGIONS),
  compileTier(COUNTRIES),
  compileTier(DEMONYMS),
];

/** First tier with a hit wins; within a tier, the longest name wins. */
export const geocodeHeadline = (text: string): GeoHit | null => {
  for (const tier of TIERS) {
    for (const { re, hit } of tier) {
      if (re.test(text)) return hit;
    }
  }
  return null;
};
