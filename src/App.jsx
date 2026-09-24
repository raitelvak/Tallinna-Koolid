import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import schoolsData from "./data/schools.json";
import "./school-editor.css";

const STORAGE_KEY = "tallinn-schools-coordinate-edits-v1";
const TALLINN_BOUNDS = { south: 59.3, north: 59.58, west: 24.47, east: 24.97 };
const toRad = value => value * Math.PI / 180;
const hasCoordinates = school => Number.isFinite(school.lat) && Number.isFinite(school.lon);
const isInTallinn = (lat, lon) => lat >= TALLINN_BOUNDS.south && lat <= TALLINN_BOUNDS.north && lon >= TALLINN_BOUNDS.west && lon <= TALLINN_BOUNDS.east;
const markerColor = ownership => ownership === "Munitsipaalkool" ? "#005ca9" : ownership === "Riigikool" ? "#17365d" : "#7c3aed";
const formatDistance = value => value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1).replace(".", ",")} km`;

function airKm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function loadSchools() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return schoolsData;
    const edits = JSON.parse(saved);
    return schoolsData.map(school => edits?.[school.id] ? { ...school, ...edits[school.id] } : school);
  } catch { return schoolsData; }
}

function SchoolMap({ origin, items, selected, preview, onSelect, onMapClick }) {
  const elementRef = useRef(null), shellRef = useRef(null), mapRef = useRef(null), groupRef = useRef(null), previewRef = useRef(null), clickHandlerRef = useRef(onMapClick);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => { clickHandlerRef.current = onMapClick; }, [onMapClick]);

  useEffect(() => {
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Powered by Esri | Sources: Esri, Maxar, Earthstar Geographics" });
    const map = L.map(elementRef.current, { layers: [street] }).setView([59.437, 24.7536], 11);
    L.control.layers({ "Tänavakaart": street, "Satelliit": satellite }, null, { position: "topright", collapsed: false }).addTo(map);
    groupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("click", event => clickHandlerRef.current?.(event.latlng));
    const syncFullscreen = () => { setIsFullscreen(document.fullscreenElement === shellRef.current); setTimeout(() => map.invalidateSize(), 100); };
    document.addEventListener("fullscreenchange", syncFullscreen);
    setTimeout(() => map.invalidateSize(), 100);
    return () => { document.removeEventListener("fullscreenchange", syncFullscreen); map.remove(); };
  }, []);

  useEffect(() => {
    if (!groupRef.current || !mapRef.current) return;
    groupRef.current.clearLayers();
    const points = [];
    if (origin) {
      L.circleMarker([origin.lat, origin.lon], { radius: 10, color: "#fff", weight: 3, fillColor: "#e11d48", fillOpacity: 1 }).bindPopup("Sisestatud aadress").addTo(groupRef.current);
      points.push([origin.lat, origin.lon]);
    }
    items.forEach((school, index) => {
      if (!hasCoordinates(school)) return;
      const active = school.id === selected;
      L.circleMarker([school.lat, school.lon], { radius: active ? 14 : 11, color: "#fff", weight: 3, fillColor: active ? "#0f172a" : markerColor(school.ownership), fillOpacity: 1 })
        .bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "marker-number" })
        .bindPopup(`<b>${school.name}</b><br>${school.ownership}<br>${school.language || "Õppekeel määramata"}<br>${school.address}, Tallinn`)
        .on("click", () => onSelect(school.id)).addTo(groupRef.current);
      points.push([school.lat, school.lon]);
    });
    if (points.length > 1) mapRef.current.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    else if (points.length === 1) mapRef.current.setView(points[0], 16);
  }, [origin, items, selected, onSelect]);

  useEffect(() => {
    if (!mapRef.current) return;
    previewRef.current?.remove();
    previewRef.current = null;
    if (!preview || !Number.isFinite(preview.lat) || !Number.isFinite(preview.lon)) return;
    previewRef.current = L.circleMarker([preview.lat, preview.lon], { radius: 13, color: "#fff", weight: 3, fillColor: "#e11d48", fillOpacity: 1 }).bindPopup("Uus asukoht").addTo(mapRef.current).openPopup();
    mapRef.current.setView([preview.lat, preview.lon], 18);
  }, [preview]);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await shellRef.current?.requestFullscreen?.();
    else await document.exitFullscreen?.();
  }

  return <div ref={shellRef} className="map-shell"><div ref={elementRef} className="map" /><button className="fullscreen-button" onClick={toggleFullscreen}>{isFullscreen ? "Välju täisekraanist" : "Täisekraan"}</button></div>;
}

function CoordinateEditorPanel({ school, draft, error, onChange, onClose, onPreview, onSave }) {
  return <aside className="coordinate-panel"><div className="coordinate-panel-header"><div><small>KOORDINAATIDE MUUTMINE</small><h3>{school.name}</h3></div><button className="icon-button" onClick={onClose}>×</button></div><div className="coordinate-panel-body">
    <div className="coordinate-info"><span>Aadress</span><strong>{school.address}</strong></div>
    <div className="coordinate-info"><span>Omandivorm</span><strong>{school.ownership}</strong></div>
    <div className="coordinate-info"><span>Õppekeel</span><strong>{school.language || "Määramata"}</strong></div>
    <div className="coordinate-fields"><label>Laiuskraad (lat)<input value={draft.lat} onChange={e => onChange({ ...draft, lat: e.target.value })} inputMode="decimal" /></label><label>Pikkuskraad (lon)<input value={draft.lon} onChange={e => onChange({ ...draft, lon: e.target.value })} inputMode="decimal" /></label></div>
    <div className="map-click-hint"><strong>Lihtsaim viis:</strong><span>klõpsa kaardil koolihoone õigel kohal.</span></div>{error && <div className="error">{error}</div>}
    <div className="coordinate-panel-actions"><button className="secondary" onClick={onPreview}>Näita kaardil</button><button className="primary" onClick={onSave}>Salvesta muudatus</button></div><button className="back-to-list" onClick={onClose}>← Tagasi koolide nimekirja</button>
  </div></aside>;
}

export default function App() {
  const [schools, setSchools] = useState(loadSchools), [address, setAddress] = useState(""), [suggestions, setSuggestions] = useState([]), [chosen, setChosen] = useState(null), [origin, setOrigin] = useState(null), [nearest, setNearest] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState(""), [mode, setMode] = useState("all"), [nearestCount, setNearestCount] = useState(3), [ownership, setOwnership] = useState("Kõik omandivormid"), [district, setDistrict] = useState("Kõik linnaosad"), [level, setLevel] = useState("Kõik kooliastmed"), [language, setLanguage] = useState("Kõik õppekeeled"), [query, setQuery] = useState(""), [selected, setSelected] = useState(null), [editingSchool, setEditingSchool] = useState(null), [editingDraft, setEditingDraft] = useState({ lat: "", lon: "" }), [editorError, setEditorError] = useState(""), [preview, setPreview] = useState(null), [notice, setNotice] = useState("");
  const timer = useRef();
  const valid = useMemo(() => schools.filter(hasCoordinates), [schools]);
  const districts = useMemo(() => ["Kõik linnaosad", ...new Set(schools.map(s => s.district).filter(Boolean))], [schools]);
  const levels = useMemo(() => ["Kõik kooliastmed", ...new Set(schools.map(s => s.type).filter(Boolean))], [schools]);
  const languages = useMemo(() => ["Kõik õppekeeled", ...new Set(schools.map(s => s.language).filter(Boolean))], [schools]);
  const matchesFilters = school => (ownership === "Kõik omandivormid" || school.ownership === ownership) && (district === "Kõik linnaosad" || school.district === district) && (level === "Kõik kooliastmed" || school.type === level) && (language === "Kõik õppekeeled" || school.language === language);
  const filtered = useMemo(() => (mode === "nearest" && nearest.length ? nearest : schools).filter(s => matchesFilters(s) && `${s.name} ${s.address}`.toLowerCase().includes(query.toLowerCase())), [mode, nearest, schools, ownership, district, level, language, query]);
  const mapItems = useMemo(() => filtered.filter(hasCoordinates), [filtered]);

  function typeAddress(value) { setAddress(value); setChosen(null); clearTimeout(timer.current); if (value.trim().length < 3) return setSuggestions([]); timer.current = setTimeout(async () => { try { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&countrycodes=ee&viewbox=24.47,59.58,24.97,59.30&bounded=1&q=${encodeURIComponent(`${value}, Tallinn`)}`, { headers: { "Accept-Language": "et" } }); setSuggestions(await response.json()); } catch { setSuggestions([]); } }, 400); }
  function choose(item) { const road = item.address?.road || item.name || item.display_name.split(",")[0]; setAddress([road, item.address?.house_number].filter(Boolean).join(" ")); setChosen({ lat: Number(item.lat), lon: Number(item.lon) }); setSuggestions([]); }
  async function route(point, school) { try { const payload = { locations: [point, { lat: school.lat, lon: school.lon }], costing: "pedestrian", units: "kilometers" }; const response = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(payload))}`); if (!response.ok) throw new Error(); const data = await response.json(); return { ...school, distance: data.trip.summary.length, minutes: Math.max(1, Math.round(data.trip.summary.time / 60)) }; } catch { const distance = airKm(point, school) * 1.22; return { ...school, distance, minutes: Math.max(1, Math.round(distance / 4.8 * 60)) }; } }

  async function findNearest(count = nearestCount) {
    if (!address.trim()) return setError("Sisesta Tallinna aadress.");
    setNearestCount(count); setLoading(true); setError("");
    try {
      let point = chosen;
      if (!point) { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ee&viewbox=24.47,59.58,24.97,59.30&bounded=1&q=${encodeURIComponent(`${address}, Tallinn`)}`); const data = await response.json(); if (!data.length) throw new Error("Aadressi ei leitud."); point = { lat: Number(data[0].lat), lon: Number(data[0].lon) }; }
      setOrigin(point);
      const pool = valid.filter(matchesFilters);
      const candidates = [...pool].sort((a, b) => airKm(point, a) - airKm(point, b)).slice(0, Math.max(12, count * 3));
      const top = (await Promise.all(candidates.map(s => route(point, s)))).sort((a, b) => a.distance - b.distance).slice(0, count);
      setNearest(top); setMode("nearest"); setSelected(top[0]?.id || null);
    } catch (err) { setError(err.message || "Otsing ebaõnnestus."); } finally { setLoading(false); }
  }

  function openEditor(school) { setEditingSchool(school); setEditingDraft({ lat: String(school.lat ?? ""), lon: String(school.lon ?? "") }); setSelected(school.id); setPreview(hasCoordinates(school) ? { lat: school.lat, lon: school.lon } : null); setEditorError(""); setNotice(""); }
  function closeEditor() { setEditingSchool(null); setEditingDraft({ lat: "", lon: "" }); setEditorError(""); setPreview(null); }
  function validatedDraft() { const lat = Number(String(editingDraft.lat).replace(",", ".")), lon = Number(String(editingDraft.lon).replace(",", ".")); if (!Number.isFinite(lat) || !Number.isFinite(lon)) { setEditorError("Koordinaadid peavad olema numbrid."); return null; } if (!isInTallinn(lat, lon)) { setEditorError("Koordinaadid ei jää Tallinna piirkonda."); return null; } setEditorError(""); return { lat, lon }; }
  function saveCoordinates() { const point = validatedDraft(); if (!point || !editingSchool) return; setSchools(current => current.map(s => s.id === editingSchool.id ? { ...s, ...point, coordinateSource: "Manually verified in map editor" } : s)); const edits = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); edits[editingSchool.id] = { ...point, coordinateSource: "Manually verified in map editor" }; localStorage.setItem(STORAGE_KEY, JSON.stringify(edits)); setNotice(`${editingSchool.name}: koordinaadid salvestatud.`); closeEditor(); }
  function handleMapClick(latlng) { if (!editingSchool) return; const point = { lat: Number(latlng.lat.toFixed(7)), lon: Number(latlng.lng.toFixed(7)) }; setEditingDraft({ lat: String(point.lat), lon: String(point.lon) }); setPreview(point); setEditorError(""); }
  function downloadSchoolsJson() { const blob = new Blob([`${JSON.stringify(schools, null, 2)}\n`], { type: "application/json;charset=utf-8" }); const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "schools.json"; link.click(); URL.revokeObjectURL(url); }
  function resetLocalEdits() { localStorage.removeItem(STORAGE_KEY); setSchools(schoolsData); closeEditor(); setNotice("Kohalikud parandused eemaldatud."); }

  return <><header className="header"><div className="header-inner"><div className="brand"><img src={`${import.meta.env.BASE_URL}haridusamet-logo.svg`} className="logo" alt="Tallinna Haridusamet" /><div><div className="kicker">TALLINNA KOOLIDE KAART</div><h1>Lähima kooli otsing</h1><p>Munitsipaal-, riigi- ja erakoolid</p></div></div></div></header>
    <main className="container"><section className="hero"><div><span className="pill">Kõik Tallinna koolid</span><h2>Leia lähim kool<br /><span className="accent">omandivormi järgi</span></h2><p className="lead">Vali filtrid ja sisesta Tallinna aadress.</p>
      <div className="tabs ownership-tabs">{["Kõik omandivormid", "Munitsipaalkool", "Riigikool", "Erakool"].map(item => <button key={item} className={`tab ${ownership === item ? "active" : ""}`} onClick={() => { setOwnership(item); setMode("all"); }}>{item}</button>)}</div>
      <div className="search-filter-row"><select value={language} onChange={e => setLanguage(e.target.value)}>{languages.map(item => <option key={item}>{item}</option>)}</select><select value={level} onChange={e => setLevel(e.target.value)}>{levels.map(item => <option key={item}>{item}</option>)}</select></div>
      <div className="search-card"><div className="search-row"><div className="input-wrap"><input className="input" value={address} onChange={e => typeAddress(e.target.value)} onKeyDown={e => e.key === "Enter" && findNearest(3)} placeholder="Näiteks Tartu mnt 18" />{suggestions.length > 0 && <div className="suggestions">{suggestions.map(item => <button className="suggestion" key={item.place_id} onClick={() => choose(item)}>{item.display_name}</button>)}</div>}</div><button className="primary" onClick={() => findNearest(3)}>{loading && nearestCount === 3 ? "Arvutan..." : "Leia 3 lähimat"}</button><button className="primary five-button" onClick={() => findNearest(5)}>{loading && nearestCount === 5 ? "Arvutan..." : "Leia 5 lähimat"}</button></div>{error && <div className="error">{error}</div>}</div>
    </div><div className="results"><small>TULEMUSED</small><h2>Lähimad koolid</h2>{!nearest.length ? <div className="empty">Vali filtrid ja sisesta aadress</div> : nearest.map((s, i) => <div className="result" key={s.id}><div className="result-top"><div className="number" style={{ background: markerColor(s.ownership) }}>{i + 1}</div><div><b>{s.name}</b><div className="meta">{s.ownership} · {s.language} · {s.type}</div><span className="distance">{formatDistance(s.distance)}</span> · u {s.minutes} min</div></div></div>)}</div></section>

    <div className="section-heading-row"><h2 className="section-title">Kõik koolid kaardil</h2><div className="data-actions"><button className="secondary" onClick={downloadSchoolsJson}>Laadi schools.json alla</button><button className="secondary danger-text" onClick={resetLocalEdits}>Taasta algandmed</button></div></div>{notice && <div className="notice">{notice}</div>}
    <div className="legend"><span><i style={{ background: "#005ca9" }} />Munitsipaalkool</span><span><i style={{ background: "#17365d" }} />Riigikool</span><span><i style={{ background: "#7c3aed" }} />Erakool</span><strong>{filtered.length} kooli</strong></div>
    <div className="map-card"><div className="toolbar"><div className="tabs"><button className={`tab ${mode === "nearest" && nearestCount === 3 ? "active" : ""}`} disabled={!nearest.length} onClick={() => { setNearestCount(3); setNearest(nearest.slice(0, 3)); setMode("nearest"); }}>3 lähimat</button><button className={`tab ${mode === "nearest" && nearestCount === 5 ? "active" : ""}`} disabled={!nearest.length} onClick={() => { setNearestCount(5); setMode("nearest"); }}>5 lähimat</button><button className={`tab ${mode === "all" ? "active" : ""}`} onClick={() => setMode("all")}>Kõik koolid</button></div>
      <div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kooli nimi või aadress" /><select value={ownership} onChange={e => setOwnership(e.target.value)}><option>Kõik omandivormid</option><option>Munitsipaalkool</option><option>Riigikool</option><option>Erakool</option></select><select value={district} onChange={e => setDistrict(e.target.value)}>{districts.map(item => <option key={item}>{item}</option>)}</select><select value={level} onChange={e => setLevel(e.target.value)}>{levels.map(item => <option key={item}>{item}</option>)}</select><select value={language} onChange={e => setLanguage(e.target.value)}>{languages.map(item => <option key={item}>{item}</option>)}</select></div></div>
      <div className={`map-grid ${editingSchool ? "editing" : ""}`}><SchoolMap origin={origin} items={mapItems} selected={selected} preview={preview} onSelect={setSelected} onMapClick={handleMapClick} />{editingSchool ? <CoordinateEditorPanel school={editingSchool} draft={editingDraft} error={editorError} onChange={setEditingDraft} onClose={closeEditor} onPreview={() => { const p = validatedDraft(); if (p) setPreview(p); }} onSave={saveCoordinates} /> : <aside className="school-list"><div className="list-head">Koolide nimekiri ({filtered.length})</div>{filtered.map((s, i) => <div className={`school-item ${selected === s.id ? "active" : ""}`} key={s.id} onClick={() => setSelected(s.id)}><div className="school-item-main"><strong><i className="dot" style={{ background: markerColor(s.ownership) }} />{i + 1}. {s.name}</strong><span>{s.ownership} · {s.language} · {s.type}</span><span>{s.address} · {s.district}</span><code>{hasCoordinates(s) ? `${s.lat}, ${s.lon}` : "Koordinaadid puuduvad"}</code></div><button className="edit-button" onClick={e => { e.stopPropagation(); openEditor(s); }}>Muuda</button></div>)}</aside>}</div></div>
    <footer className="footer">Andmeallikas: Tallinna Haridusameti teatmik. Kaart: OpenStreetMap. Satelliit: Esri.</footer></main></>;
}
