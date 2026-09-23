import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const BASE_URL = "https://teatmik.haridus.ee";
const LIST_URL = `${BASE_URL}/koolid/`;
const OUTPUT_FILE = path.resolve("data/schools.json");

const MUNICIPAL_TERMS = [
  "munitsipaalomand",
  "munitsipaalkool",
  "tallinna linn",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeText(value = "") {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(url) {
  return new URL(url, BASE_URL).href;
}

async function fetchHtml(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Tallinna-Koolid/1.0 school-data-updater contact: GitHub raitelvak/Tallinna-Koolid",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "et-EE,et;q=0.9,en;q=0.7",
    },
    redirect: "follow",
  });

  const html = await response.text();

  console.log(
    `HTTP ${response.status}, ${html.length} märki, URL: ${response.url}`
  );

  if (!response.ok) {
    if (attempt < 4) {
      await sleep(attempt * 1500);
      return fetchHtml(url, attempt + 1);
    }

    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return {
    html,
    finalUrl: response.url,
    status: response.status,
  };
}

function findValueByLabel($, labels) {
  const wanted = labels.map((label) => label.toLowerCase());

  let result = "";

  $("dt, th, strong, b, .label, .field-label").each((_, element) => {
    if (result) return;

    const label = normalizeText($(element).text()).toLowerCase();

    if (!wanted.some((wantedLabel) => label.includes(wantedLabel))) {
      return;
    }

    const candidate =
      $(element).next("dd, td, .value, .field-value").first().text() ||
      $(element).parent().find("dd, td, .value, .field-value").first().text();

    result = normalizeText(candidate);
  });

  return result;
}

function parseSchoolPage(html, sourceUrl) {
  const $ = cheerio.load(html);

  const title = normalizeText(
    $("h1").first().text() ||
      $("main h2").first().text() ||
      $("title").first().text()
  );

  const bodyText = normalizeText($("body").text());

  const address =
    findValueByLabel($, ["aadress", "asukoht"]) ||
    normalizeText(
      $('[itemprop="streetAddress"]').first().text() ||
        $("address").first().text()
    );

  const ownership = findValueByLabel($, [
    "omandivorm",
    "omand",
    "pidaja",
  ]);

  const website =
    $('a[href^="http"]')
      .filter((_, element) => {
        const href = $(element).attr("href") || "";
        return (
          !href.includes("teatmik.haridus.ee") &&
          !href.includes("google.com/maps")
        );
      })
      .first()
      .attr("href") || "";

  const municipal =
    MUNICIPAL_TERMS.some((term) =>
      `${ownership} ${bodyText}`.toLowerCase().includes(term)
    ) ||
    bodyText.toLowerCase().includes("tallinna haridusamet");

  if (!title) {
    return {
      school: null,
      reason: "Kooli nime ei leitud",
    };
  }

  if (!address) {
    return {
      school: null,
      reason: `Aadressi ei leitud: ${title}`,
    };
  }

  if (!municipal) {
    return {
      school: null,
      reason: `Ei tuvastatud munitsipaalkoolina: ${title}`,
    };
  }

  return {
    school: {
      name: title,
      address,
      ownership: ownership || "Munitsipaalomand",
      website,
      sourceUrl,
    },
    reason: null,
  };
}
