import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import schoolsData from "./data/schools.json";
import "./school-editor.css";

const STORAGE_KEY = "tallinn-schools-coordinate-edits-v1";
const TALLINN_BOUNDS = { south: 59.3, north: 59.58, west: 24.47, east: 24.97 };

const toRad = value => value * Math.PI / 180;
const hasCoordinates = school => Number.isFinite(school.lat) && Number.isFinite(school.lon);
const isInTallinn = (lat, lon) =>
  lat >= TALLINN_BOUNDS.south && lat <= TALLINN_BOUNDS.north &&
  lon >= TALLINN_BOUNDS.west && lon <= TALLINN_BOUNDS.east;

function airKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const q = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

const formatDistance = value =>
  value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1).replace(".", ",")} km`;

const markerColor = ownership =>
  ownership === "Munitsipaalkool" ? "#005ca9" :
  ownership === "Riigikool" ? "#17365d" : "#7c3aed";

function loadSchools() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return schoolsData;
    const edits = JSON.parse(saved);
    if (!edits || typeof edits !== "object") return schoolsData;
    return schoolsData.map(school => edits[school.id] ? { ...school, ...edits[school.id] } : school);
  } catch {
    return schoolsData;
  }
}

function SchoolMap({ origin, items, selected, preview, onSelect, onMapClick }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const groupRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    const map = L.map(elementRef.current).setView([59.437, 24.7536], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);
    groupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("click", event => onMapClick?.(event.latlng));
    setTimeout(() => map.invalidateSize(), 100);
    return () => map.remove();
  }, [onMapClick]);

  useEffect(() => {
    if (!groupRef.current || !mapRef.current) return;
    groupRef.current.clearLayers();
    const points = [];

    if (origin) {
      L.circleMarker([origin.lat, origin.lon], {
        radius: 10, color: "#fff", weight: 3, fillColor: "#e11d48", fillOpacity: 1
      }).bindPopup("Sisestatud aadress").addTo(groupRef.current);
      points.push([origin.lat, origin.lon]);
    }

    items.forEach((school, index) => {
      if (!hasCoordinates(school)) return;
      const active = school.id === selected;
      L.circleMarker([school.lat, school.lon], {
        radius: active ? 14 : 11,
        color: "#fff",
        weight: 3,
        fillColor: active ? "#0f172a" : markerColor(school.ownership),
        fillOpacity: 1
      })
        .bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "marker-number" })
        .bindPopup(`<b>${school.name}</b><br>${school.ownership}<br>${school.address}, Tallinn`)
        .on("click", () => onSelect(school.id))
        .addTo(groupRef.current);
      points.push([school.lat, school.lon]);
    });

    if (points.length > 1) mapRef.current.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    else if (points.length === 1) mapRef.current.setView(points[0], 16);
  }, [origin, items, selected, onSelect]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (previewRef.current) {
      previewRef.current.remove();
      previewRef.current = null;
    }
    if (!preview || !Number.isFinite(preview.lat) || !Number.isFinite(preview.lon)) return;
    previewRef.current = L.circleMarker([preview.lat, preview.lon], {
      radius: 12, color: "#fff", weight: 3, fillColor: "#e11d48", fillOpacity: 1
    }).bindPopup("Eelvaade: uus asukoht").addTo(mapRef.current).openPopup();
    mapRef.current.setView([preview.lat, preview.lon], 18);
  }, [preview]);

  return <div ref={elementRef} className="map" />;
}

function CoordinateEditor({ school, onClose, onSave, onPreview }) {
  const [lat, setLat] = useState(String(school.lat ?? ""));
  const [lon, setLon] = useState(String(school.lon ?? ""));
  const [error, setError] = useState("");

  useEffect(() => {
    setLat(String(school.lat ?? ""));
    setLon(String(school.lon ?? ""));
    setError("");
  }, [school]);

  function validate() {
    const latitude = Number(lat.replace(",", "."));
    const longitude = Number(lon.replace(",", "."));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError("Laius- ja pikkuskraad peavad olema numbrid.");
      return null;
    }
    if (!isInTallinn(latitude, longitude)) {
      setError("Koordinaadid ei jää Tallinna piirkonda.");
      return null;
    }
    setError("");
    return { lat: latitude, lon: longitude };
  }

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Koordinaatide muutmine">
      <div className="editor-dialog">
        <div className="editor-title-row">
          <div>
            <small>KOORDINAATIDE MUUTMINE</small>
            <h3>{school.name}</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Sulge">×</button>
        </div>
        <p className="editor-address">{school.address}</p>
        <div className="coordinate-fields">
          <label>
            Laiuskraad (lat)
            <input value={lat} onChange={event => setLat(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Pikkuskraad (lon)
            <input value={lon} onChange={event => setLon(event.target.value)} inputMode="decimal" />
          </label>
        </div>
        <p className="editor-help">Võid sisestada väärtused või klõpsata kaardil soovitud koolihoone asukohal.</p>
        {error && <div className="error">{error}</div>}
        <div className="editor-actions">
          <button className="secondary" onClick={() => {
            const point = validate();
            if (point) onPreview(point);
          }}>Vaata kaardil</button>
          <button className="primary" onClick={() => {
            const point = validate();
            if (point) onSave(point);
          }}>Salvesta muudatus</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [schools, setSchools] = useState(loadSchools);
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [nearest, setNearest] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("all");
  const [ownership, setOwnership] = useState("Kõik omandivormid");
  const [district, setDistrict] = useState("Kõik linnaosad");
  const [level, setLevel] = useState("Kõik kooliastmed");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState("");
  const timer = useRef();

  const valid = useMemo(() => schools.filter(hasCoordinates), [schools]);
  const districts = useMemo(() => ["Kõik linnaosad", ...new Set(schools.map(s => s.district).filter(Boolean))], [schools]);
  const levels = useMemo(() => ["Kõik kooliastmed", ...new Set(schools.map(s => s.type).filter(Boolean))], [schools]);
  const filtered = useMemo(() => {
    const base = mode === "nearest" && nearest.length ? nearest : schools;
    return base.filter(school =>
      (ownership === "Kõik omandivormid" || school.ownership === ownership) &&
      (district === "Kõik linnaosad" || school.district === district) &&
      (level === "Kõik kooliastmed" || school.type === level) &&
      `${school.name} ${school.address}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [mode, nearest, schools, ownership, district, level, query]);

  const mapItems = useMemo(() => filtered.filter(hasCoordinates), [filtered]);

  function typeAddress(value) {
    setAddress(value);
    setChosen(null);
    clearTimeout(timer.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&countrycodes=ee&viewbox=24.47,59.58,24.97,59.30&bounded=1&q=${encodeURIComponent(`${value}, Tallinn`)}`;
        const response = await fetch(url, { headers: { "Accept-Language": "et" } });
        setSuggestions(await response.json());
      } catch {
        setSuggestions([]);
      }
    }, 400);
  }

  function choose(item) {
    const road = item.address?.road || item.name || item.display_name.split(",")[0];
    setAddress([road, item.address?.house_number].filter(Boolean).join(" "));
    setChosen({ lat: Number(item.lat), lon: Number(item.lon), label: item.display_name });
    setSuggestions([]);
  }

  async function route(point, school) {
    try {
      const payload = { locations: [point, { lat: school.lat, lon: school.lon }], costing: "pedestrian", units: "kilometers" };
      const response = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(payload))}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      return { ...school, distance: data.trip.summary.length, minutes: Math.max(1, Math.round(data.trip.summary.time / 60)) };
    } catch {
      const distance = airKm(point, school) * 1.22;
      return { ...school, distance, minutes: Math.max(1, Math.round(distance / 4.8 * 60)) };
    }
  }

  async function findNearest() {
    if (!address.trim()) {
      setError("Sisesta Tallinna aadress.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let point = chosen;
      if (!point) {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ee&viewbox=24.47,59.58,24.97,59.30&bounded=1&q=${encodeURIComponent(`${address}, Tallinn`)}`);
        const data = await response.json();
        if (!data.length) throw new Error("Aadressi ei leitud.");
        point = { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name };
      }
      setOrigin(point);
      const pool = valid.filter(school => ownership === "Kõik omandivormid" || school.ownership === ownership);
      const candidates = [...pool].sort((a, b) => airKm(point, a) - airKm(point, b)).slice(0, 10);
      const top = (await Promise.all(candidates.map(school => route(point, school))))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
      setNearest(top);
      setMode("nearest");
      setSelected(top[0]?.id || null);
    } catch (err) {
      setError(err.message || "Otsing ebaõnnestus.");
    } finally {
      setLoading(false);
    }
  }

  function openEditor(school) {
    setEditingSchool(school);
    setSelected(school.id);
    setPreview(hasCoordinates(school) ? { lat: school.lat, lon: school.lon } : null);
    setEditorOpen(true);
    setNotice("");
  }

  function saveCoordinates(point) {
    setSchools(current => {
      const updated = current.map(school => school.id === editingSchool.id ? {
        ...school,
        ...point,
        coordinateSource: "Manually verified in map editor"
      } : school);
      const edits = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      edits[editingSchool.id] = { ...point, coordinateSource: "Manually verified in map editor" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
      return updated;
    });
    setPreview(point);
    setEditingSchool(current => ({ ...current, ...point }));
    setNotice(`${editingSchool.name}: koordinaadid salvestatud selles brauseris.`);
    setEditorOpen(false);
  }

  function handleMapClick(latlng) {
    if (!editorOpen || !editingSchool) return;
    const point = { lat: Number(latlng.lat.toFixed(7)), lon: Number(latlng.lng.toFixed(7)) };
    setPreview(point);
    setEditingSchool(current => ({ ...current, ...point }));
  }

  function downloadSchoolsJson() {
    const blob = new Blob([`${JSON.stringify(schools, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "schools.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetLocalEdits() {
    localStorage.removeItem(STORAGE_KEY);
    setSchools(schoolsData);
    setPreview(null);
    setNotice("Kohalikud koordinaadiparandused eemaldatud.");
  }

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <img src={`${import.meta.env.BASE_URL}haridusamet-logo.svg`} className="logo" alt="Tallinna Haridusamet" />
            <div><div className="kicker">TALLINNA KOOLIDE KAART</div><h1>Lähima kooli otsing</h1><p>Munitsipaal-, riigi- ja erakoolid</p></div>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div>
            <span className="pill">Kõik Tallinna koolid</span>
            <h2>Leia lähim kool<br /><span className="accent">omandivormi järgi</span></h2>
            <p className="lead">Vali kooli omandivorm ja sisesta Tallinna aadress.</p>
            <div className="tabs ownership-tabs">
              {["Kõik omandivormid", "Munitsipaalkool", "Riigikool", "Erakool"].map(item =>
                <button key={item} className={`tab ${ownership === item ? "active" : ""}`} onClick={() => { setOwnership(item); setMode("all"); }}>{item}</button>
              )}
            </div>
            <div className="search-card">
              <div className="search-row">
                <div className="input-wrap">
                  <input className="input" value={address} onChange={event => typeAddress(event.target.value)} onKeyDown={event => event.key === "Enter" && findNearest()} placeholder="Näiteks Tartu mnt 18" />
                  {suggestions.length > 0 && <div className="suggestions">{suggestions.map(item => <button className="suggestion" key={item.place_id} onClick={() => choose(item)}>{item.display_name}</button>)}</div>}
                </div>
                <button className="primary" onClick={findNearest}>{loading ? "Arvutan..." : "Leia 3 lähimat"}</button>
              </div>
              {error && <div className="error">{error}</div>}
            </div>
          </div>
          <div className="results">
            <small>TULEMUSED</small><h2>Lähimad koolid</h2>
            {!nearest.length ? <div className="empty">Vali omandivorm ja sisesta aadress</div> : nearest.map((school, index) =>
              <div className="result" key={school.id}><div className="result-top"><div className="number" style={{ background: markerColor(school.ownership) }}>{index + 1}</div><div><b>{school.name}</b><div className="meta">{school.ownership} · {school.address} · {school.district}</div><span className="distance">{formatDistance(school.distance)}</span> · u {school.minutes} min</div></div></div>
            )}
          </div>
        </section>

        <div className="section-heading-row">
          <h2 className="section-title">Kõik koolid kaardil</h2>
          <div className="data-actions">
            <button className="secondary" onClick={downloadSchoolsJson}>Laadi schools.json alla</button>
            <button className="secondary danger-text" onClick={resetLocalEdits}>Taasta algandmed</button>
          </div>
        </div>
        {notice && <div className="notice">{notice}</div>}
        <div className="legend"><span><i style={{ background: "#005ca9" }} />Munitsipaalkool</span><span><i style={{ background: "#17365d" }} />Riigikool</span><span><i style={{ background: "#7c3aed" }} />Erakool</span><strong>{filtered.length} kooli</strong></div>

        <div className="map-card">
          <div className="toolbar">
            <div className="tabs"><button className={`tab ${mode === "nearest" ? "active" : ""}`} disabled={!nearest.length} onClick={() => setMode("nearest")}>3 lähimat</button><button className={`tab ${mode === "all" ? "active" : ""}`} onClick={() => setMode("all")}>Kõik koolid</button></div>
            <div className="filters"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Kooli nimi või aadress" /><select value={ownership} onChange={event => setOwnership(event.target.value)}><option>Kõik omandivormid</option><option>Munitsipaalkool</option><option>Riigikool</option><option>Erakool</option></select><select value={district} onChange={event => setDistrict(event.target.value)}>{districts.map(item => <option key={item}>{item}</option>)}</select><select value={level} onChange={event => setLevel(event.target.value)}>{levels.map(item => <option key={item}>{item}</option>)}</select></div>
          </div>
          <div className="map-grid">
            <SchoolMap origin={origin} items={mapItems} selected={selected} preview={preview} onSelect={setSelected} onMapClick={handleMapClick} />
            <aside className="school-list">
              <div className="list-head">Koolide nimekiri ({filtered.length})</div>
              {filtered.map((school, index) =>
                <div className={`school-item ${selected === school.id ? "active" : ""}`} key={school.id} onClick={() => setSelected(school.id)}>
                  <div className="school-item-main"><strong><i className="dot" style={{ background: markerColor(school.ownership) }} />{index + 1}. {school.name}</strong><span>{school.ownership} · {school.address} · {school.district}</span><code>{hasCoordinates(school) ? `${school.lat}, ${school.lon}` : "Koordinaadid puuduvad"}</code></div>
                  <button className="edit-button" onClick={event => { event.stopPropagation(); openEditor(school); }}>Muuda</button>
                </div>
              )}
            </aside>
          </div>
        </div>

        <footer className="footer">Andmeallikas: Tallinna Haridusameti teatmik. Kaart: OpenStreetMap.</footer>
      </main>

      {editorOpen && editingSchool && <CoordinateEditor school={editingSchool} onClose={() => { setEditorOpen(false); setPreview(null); }} onPreview={point => setPreview(point)} onSave={saveCoordinates} />}
    </>
  );
}
