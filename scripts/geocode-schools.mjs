import fs from "node:fs/promises";

const schools = JSON.parse(
  await fs.readFile("src/data/schools.json", "utf8")
);

const sleep = (ms) =>
  new Promise(resolve => setTimeout(resolve, ms));

async function geocode(query) {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=jsonv2" +
    "&limit=1" +
    "&countrycodes=ee" +
    "&q=" +
    encodeURIComponent(query);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Tallinna-Koolid"
    }
  });

  const data = await response.json();

  if (!data.length) {
    return {
      lat: null,
      lon: null
    };
  }

  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon)
  };
}

for (const school of schools) {
  console.log(school.name);

  const coords = await geocode(
    school.mapQuery
  );

  school.lat = coords.lat;
  school.lon = coords.lon;

  await sleep(1100);
}

await fs.writeFile(
  "src/data/schools.json",
  JSON.stringify(schools, null, 2)
);

console.log("Valmis");
