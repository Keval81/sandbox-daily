import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEonet, normalizeUsgs } from "./sources";

test("normalizeEonet maps a wildfire point event", () => {
  const data = {
    events: [
      {
        id: "EONET_1000",
        title: "Wildfire - Test County",
        link: "https://eonet.example/EONET_1000",
        categories: [{ id: "wildfires", title: "Wildfires" }],
        geometry: [
          {
            magnitudeValue: 45,
            magnitudeUnit: "MW",
            date: "2026-07-25T12:00:00Z",
            type: "Point",
            coordinates: [-120.5, 39.2],
          },
        ],
      },
    ],
  };
  const out = normalizeEonet(data);
  assert.equal(out.length, 1);
  const e = out[0];
  assert.equal(e.id, "eonet:EONET_1000");
  assert.equal(e.category, "wildfire");
  assert.equal(e.lon, -120.5);
  assert.equal(e.lat, 39.2);
  assert.equal(e.source, "EONET");
  assert.ok(e.severity > 0 && e.severity <= 1);
});

test("normalizeEonet averages a polygon into a centroid", () => {
  const data = {
    events: [
      {
        id: "EONET_2000",
        title: "Iceberg",
        categories: [{ id: "seaLakeIce", title: "Sea and Lake Ice" }],
        geometry: [
          {
            date: "2026-07-20T00:00:00Z",
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
              ],
            ],
          },
        ],
      },
    ],
  };
  const out = normalizeEonet(data);
  assert.equal(out.length, 1);
  assert.equal(out[0].category, "seaLakeIce");
  assert.equal(out[0].lon, 5);
  assert.equal(out[0].lat, 5);
});

test("normalizeEonet uses the most recent geometry", () => {
  const data = {
    events: [
      {
        id: "EONET_3000",
        title: "Tropical Storm",
        categories: [{ id: "severeStorms", title: "Severe Storms" }],
        geometry: [
          { date: "2026-07-24T00:00:00Z", type: "Point", coordinates: [100, 10] },
          { date: "2026-07-25T00:00:00Z", type: "Point", coordinates: [105, 15] },
        ],
      },
    ],
  };
  const out = normalizeEonet(data);
  assert.equal(out[0].lon, 105);
  assert.equal(out[0].lat, 15);
});

test("normalizeEonet skips events without usable geometry", () => {
  const data = {
    events: [
      { id: "X", title: "no geo", categories: [], geometry: [] },
      { id: "Y", title: "bad coords", categories: [], geometry: [{ coordinates: ["a", "b"] }] },
    ],
  };
  assert.equal(normalizeEonet(data).length, 0);
});

test("normalizeUsgs maps magnitude to 0..1 severity", () => {
  const data = {
    features: [
      {
        id: "us7000abcd",
        properties: {
          mag: 8,
          place: "offshore Testland",
          time: Date.parse("2026-07-26T00:00:00Z"),
          url: "https://usgs.example/us7000abcd",
        },
        geometry: { coordinates: [142.4, 38.3, 30] },
      },
      {
        id: "us7000efgh",
        properties: { mag: 2.5, place: "near Nowhere", time: 0 },
        geometry: { coordinates: [-1, -1, 5] },
      },
    ],
  };
  const out = normalizeUsgs(data);
  assert.equal(out.length, 2);
  assert.equal(out[0].category, "earthquake");
  assert.equal(out[0].id, "usgs:us7000abcd");
  assert.equal(out[0].severity, 1); // mag 8 → clamped 1
  assert.equal(out[1].severity, 0); // mag 2.5 → 0
  assert.match(out[0].magnitude!, /^M8\.0/);
});

test("normalizers tolerate malformed input", () => {
  assert.deepEqual(normalizeEonet(null), []);
  assert.deepEqual(normalizeEonet({}), []);
  assert.deepEqual(normalizeUsgs(undefined), []);
  assert.deepEqual(normalizeUsgs({ features: "nope" }), []);
});
