import fs from "node:fs/promises";

const FILE = "src/data/schools.json";
const REPORT = "src/data/geocode-report.json";
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const WAIT_MS = 1200;
const MAX_ATTEMPTS = 4;
const TALLINN = { south: 59.30, north: 59.58, west: 24.47, east: 24.97 };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const inTallinn = (lat, lon) =>
  lat >= TALLINN.south && lat <= TALLINN.north &&
  lon >= TALLINN.west && lon <= TALLINN.east;

async function geocode(query) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "ee");
  url.searchParams.set("viewbox", "24.47,59.58,24.97,59.30");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("q", query);

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Tallinna-Koolid/1.0 (https://github.com/raitelvak/Tallinna-Koolid)",
          "Accept-Language": "et"
        },
        signal: AbortSignal.timeout(30000)
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Ajutine HTTP viga ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const results = await response.json();
      const match = results.find(item =>
        inTallinn(Number(item.lat), Number(item.lon))
      );

      if (!match) return null;
      return {
        lat: Number(match.lat),
        lon: Number(match.lon),
        displayName: match.display_name,
        osmType: match.osm_type,
        osmId: match.osm_id
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 3000);
    }
  }
  throw lastError;
}

const schools = JSON.parse(await fs.readFile(FILE, "utf8"));
if (!Array.isArray(schools) || schools.length !== 92) {
  throw new Error(`Oodati 92 kooli, failis on ${Array.isArray(schools) ? schools.length : "vale struktuur"}.`);
}

const report = { generatedAt: new Date().toISOString(), total: schools.length, existing: 0, matched: 0, unmatched: [], errors: [] };

for (let index = 0; index < schools.length; index += 1) {
  const school = schools[index];

  if (Number.isFinite(school.lat) && Number.isFinite(school.lon) && inTallinn(school.lat, school.lon)) {
    report.existing += 1;
    console.log(`${index + 1}/92 olemas: ${school.name}`);
    continue;
  }

  const queries = [
    school.mapQuery,
    school.address ? `${school.address}, Tallinn, Eesti` : null,
    school.name ? `${school.name}, Tallinn, Eesti` : null
  ].filter(Boolean);

  let result = null;
  try {
    for (const query of [...new Set(queries)]) {
      console.log(`${index + 1}/92 otsin: ${school.name} | ${query}`);
      result = await geocode(query);
      await sleep(WAIT_MS);
      if (result) break;
    }

    if (result) {
      school.lat = result.lat;
      school.lon = result.lon;
      school.geocodedAddress = result.displayName;
      school.geocoder = "OpenStreetMap Nominatim";
      school.osmType = result.osmType;
      school.osmId = result.osmId;
      report.matched += 1;
      console.log(`  OK ${result.lat}, ${result.lon}`);
    } else {
      school.lat = null;
      school.lon = null;
      report.unmatched.push({ id: school.id, name: school.name, query: school.mapQuery });
      console.warn(`  EI LEITUD: ${school.name}`);
    }
  } catch (error) {
    report.errors.push({ id: school.id, name: school.name, error: error.message });
    console.error(`  VIGA: ${school.name}: ${error.message}`);
  }
}

const located = schools.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon) && inTallinn(s.lat, s.lon));
report.located = located.length;
report.missing = schools.length - located.length;

// Kaitse: ära kirjuta põhifaili üle, kui tulemus on ilmselgelt puudulik.
if (located.length < 85) {
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2) + "\n", "utf8");
  throw new Error(`Leiti ainult ${located.length}/92 koordinaati. schools.json faili ei kirjutatud üle.`);
}

await fs.writeFile(FILE, JSON.stringify(schools, null, 2) + "\n", "utf8");
await fs.writeFile(REPORT, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`Valmis. Koordinaadid olemas ${located.length}/92 koolil.`);
