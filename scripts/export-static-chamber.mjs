import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import {
  normaliseMemberApiRows,
  clean as cleanFromJoins,
} from "../src/lib/joins.js";

const ROOT = process.cwd();

const PATHS = {
  svg: path.join(ROOT, "src/data/chamber.svg"),
  seatingCsv: path.join(ROOT, "public/seatAssignmentsHistory.csv"),
  membersJson: path.join(ROOT, "src/data/members.json"),
  partiesPaletteJs: path.join(ROOT, "src/data/partiesPalette.js"),
  outputDir: path.join(ROOT, "output"),
  outputHtml: path.join(ROOT, "output/seanad-chamber-static.html"),
};

function clean(value) {
  if (typeof cleanFromJoins === "function") return cleanFromJoins(value);
  return String(value ?? "").trim();
}

function buildMemberUrl(memberCode) {
  if (!memberCode) return "";
  return `https://www.oireachtas.ie/en/members/member/${memberCode}/`;
}

function buildImageUrl(memberCode) {
  if (!memberCode) return "";
  return `https://data.oireachtas.ie/ie/oireachtas/member/id/${memberCode}/image/large`;
}

function loadCsvRows(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    console.warn("CSV parse warnings:", parsed.errors);
  }

  return parsed.data;
}

async function loadPartyPalette() {
  const mod = await import(`file://${PATHS.partiesPaletteJs}`);
  const palette = mod.partiesPalette ?? [];

  return Object.fromEntries(
    palette.map((d) => [d.name, d.value || d.color || "#d6d3d1"]),
  );
}

function buildSeatData(seatingRows, members) {
  const membersByCode = new Map(
    members.map((m) => [clean(m.Code ?? m.memberCode), m]),
  );

  const seatData = {};

  for (const row of seatingRows) {
    const seatLabel = clean(row.seat_label);
    const memberCode = clean(row.member_code ?? row.memberCode);

    if (!seatLabel) continue;

    const member = membersByCode.get(memberCode) || null;

    seatData[seatLabel] = {
      seat_label: seatLabel,
      memberCode,
      name: clean(member?.Deputy ?? row.member_name ?? row.member),
      party: clean(member?.Party ?? row.party ?? row.Party),
      constituency: clean(
        member?.Constituency ?? row.constituency ?? row.Constituency,
      ),
      image: buildImageUrl(memberCode),
      url: buildMemberUrl(memberCode),
    };
  }

  return seatData;
}

function addEmptySeatsFromSvg(seatData, svgMarkup) {
  const seatRegex = /data-seat="([^"]+)"/g;
  const allSeatLabels = new Set();

  let match;
  while ((match = seatRegex.exec(svgMarkup)) !== null) {
    allSeatLabels.add(clean(match[1]));
  }

  for (const seatLabel of allSeatLabels) {
    if (!seatLabel || seatData[seatLabel]) continue;

    seatData[seatLabel] = {
      seat_label: seatLabel,
      memberCode: "",
      name: "",
      party: "",
      constituency: "",
      image: "",
      url: "",
    };
  }

  return seatData;
}

function buildHtml({ svgMarkup, seatData, partyColorMap }) {
  const seatDataJson = JSON.stringify(seatData, null, 2);
  const partyMapJson = JSON.stringify(partyColorMap, null, 2);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Interactive Seanad chamber</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap");

    :root {
      --bg: #f4f2ea;
      --panel: #ffffff;
      --border: #e7e5e4;
      --text: #1c1917;
      --muted: #57534e;
      --muted-2: #78716c;
      --seat-default: #d6d3d1;
    }

    * { box-sizing: border-box; }
    body { margin: 0; font-family: "IBM Plex Sans", system-ui, sans-serif; color: var(--text); background: transparent; }
    .page { width: 100%; margin: 0; padding: 0; }
    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 12px; }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
    .summary__item { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #ece7dc; border-radius: 999px; background: #fafaf9; font-size: 0.92rem; line-height: 1; }
    .summary__dot { width: 10px; height: 10px; border-radius: 999px; flex: 0 0 auto; }
    .summary__name { font-weight: 500; }
    .summary__count { color: var(--muted); font-variant-numeric: tabular-nums; }
    .map-wrap { width: 100%; padding: 12px; border-radius: 4px; background: #fafaf9; position: relative; overflow: visible; }
    .map-frame { border-radius: 4px; overflow: hidden; }
    .map-frame svg { display: block; width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="page">
    <div class="panel">
      <div class="summary" id="summary"></div>
      <div class="map-wrap">
        <div class="map-frame">${svgMarkup}</div>
      </div>
    </div>
  </div>
  <script>
    window.SEAT_DATA = ${seatDataJson};
    window.PARTY_COLOR_MAP = ${partyMapJson};
  </script>
</body>
</html>`;
}

async function main() {
  const svgMarkup = fs.readFileSync(PATHS.svg, "utf8");
  const seatingRowsRaw = loadCsvRows(fs.readFileSync(PATHS.seatingCsv, "utf8"));
  const seatingRows = seatingRowsRaw.map((row) => ({
    ...row,
    seat_label: clean(row.seat_label),
    member_code: clean(row.memberCode),
    member_name: clean(row.member),
  }));
  const members = normaliseMemberApiRows(
    JSON.parse(fs.readFileSync(PATHS.membersJson, "utf8")),
  );
  const partyColorMap = await loadPartyPalette();

  const seatData = addEmptySeatsFromSvg(
    buildSeatData(seatingRows, members),
    svgMarkup,
  );

  fs.mkdirSync(PATHS.outputDir, { recursive: true });
  fs.writeFileSync(
    PATHS.outputHtml,
    buildHtml({ svgMarkup, seatData, partyColorMap }),
    "utf8",
  );

  console.log(`Wrote ${PATHS.outputHtml}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
