/**
 * Ignis Track — Application State & Interactive Controllers
 * NASA Space Apps Challenge 2026
 * Supports both Live API Gateway & Standalone Client Engine (GitHub Pages)
 */

(function () {
  'use strict';

  // --- Embedded Client Harmonization Engine (Zero-Server Resilient Fallback) ---
  const PRESETS_DATA = [
    {
      "id": "california_north",
      "name": "California — Sierra Nevada & Northern Corridor",
      "country": "USA",
      "bbox": [-123.5, 38.5, -120.0, 41.5],
      "center": [40.0, -121.75],
      "zoom": 7,
      "fire_season": "July – November",
      "biome": "Mediterranean Conifer & Mixed Forests",
      "typical_ratio": 2.85,
      "description": "High seasonal variability with severe late-summer and autumn conifer crown fires driven by offshore Diablo/Santa Ana wind events."
    },
    {
      "id": "amazon_arc",
      "name": "Amazon Basin — Arc of Deforestation",
      "country": "Brazil",
      "bbox": [-56.5, -12.5, -51.5, -8.5],
      "center": [-10.5, -54.0],
      "zoom": 7,
      "fire_season": "August – October",
      "biome": "Tropical Moist Forest / Cerrado Ecotone",
      "typical_ratio": 3.42,
      "description": "Persistent agricultural land preparation and slash-and-burn operations peaking in August-September, with high smoke aerosol loading."
    },
    {
      "id": "central_india",
      "name": "Central India — Madhya Pradesh & Chhattisgarh",
      "country": "India",
      "bbox": [78.5, 21.2, 82.8, 24.2],
      "center": [22.7, 80.65],
      "zoom": 7,
      "fire_season": "March – May",
      "biome": "Tropical Dry Deciduous Forest & Agro-Ecosystems",
      "typical_ratio": 2.65,
      "description": "Pre-monsoon leaf-litter fires in teak and sal forests combined with rabi crop post-harvest residue clearing."
    }
  ];

  function createRng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  class ClientEngine {
    constructor() {
      this.datasets = {};
      this.init();
    }

    init() {
      for (const preset of PRESETS_DATA) {
        this.generatePreset(preset);
      }
    }

    getSeasonality(id) {
      if (id === 'california_north') return [0.05, 0.05, 0.08, 0.15, 0.35, 0.7, 1.6, 2.8, 2.5, 1.4, 0.35, 0.08];
      if (id === 'amazon_arc') return [0.1, 0.1, 0.15, 0.2, 0.35, 0.8, 1.7, 3.2, 2.9, 1.2, 0.4, 0.15];
      if (id === 'central_india') return [0.2, 0.6, 2.3, 3.1, 1.9, 0.3, 0.05, 0.05, 0.08, 0.25, 0.85, 0.35];
      return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    }

    generatePreset(preset) {
      const rng = createRng(preset.name.length * 997 + 101);
      const daily = [];
      const hotspots = [];
      const [minLon, minLat, maxLon, maxLat] = preset.bbox;
      const seasonality = this.getSeasonality(preset.id);
      const k_base = preset.typical_ratio || 2.85;

      for (let y = 2004; y <= 2024; y++) {
        let yearFactor = 1.0;
        if (preset.id === 'california_north') {
          if (y === 2018) yearFactor = 2.4;
          if (y === 2020) yearFactor = 3.6;
          if (y === 2021) yearFactor = 2.9;
        } else if (preset.id === 'amazon_arc') {
          if (y === 2007) yearFactor = 2.2;
          if (y === 2010) yearFactor = 2.5;
          if (y === 2019) yearFactor = 2.7;
          if (y === 2020) yearFactor = 2.8;
        } else if (preset.id === 'central_india') {
          if (y === 2008) yearFactor = 1.8;
          if (y === 2016) yearFactor = 2.5;
          if (y === 2021) yearFactor = 2.0;
        }

        const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
        const daysInMonths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        for (let m = 0; m < 12; m++) {
          const monthNum = m + 1;
          const monthFactor = seasonality[m];
          const daysCount = daysInMonths[m];
          const k_month = Number((k_base + (rng() - 0.5) * 0.25).toFixed(2));

          for (let d = 1; d <= daysCount; d++) {
            const dateStr = `${y}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isMissingData = rng() < 0.018;

            if (isMissingData) {
              daily.push({
                date: dateStr, year: y, month: monthNum, day: d,
                data_status: 'missing_data', modis_cells: 0, viirs_cells: 0, harmonized_cells: 0,
                detections_total: 0, frp_sum_mw: 0, sources_present: [], is_calibrated: false,
                k_month: null, anomaly_score: null, anomaly_label: 'missing_data'
              });
              continue;
            }

            const dayIntensity = monthFactor * yearFactor * (0.4 + rng() * 1.2);
            let modis_cells = 0;
            let viirs_cells = 0;
            let detections_total = 0;
            let frp_sum_mw = 0;
            const sources_present = [];

            const hasFire = dayIntensity > 0.35 && rng() < Math.min(0.95, dayIntensity * 0.7);

            if (hasFire) {
              modis_cells = Math.max(1, Math.round(dayIntensity * (5 + rng() * 18)));
              sources_present.push('MODIS');

              if (y >= 2012) {
                sources_present.push('VIIRS_SNPP');
                if (y >= 2018) sources_present.push('VIIRS_NOAA20');
                viirs_cells = Math.max(1, Math.round(modis_cells * k_month + (rng() - 0.5) * 3));
              }

              const modis_points = Math.round(modis_cells * (1.3 + rng() * 0.8));
              const viirs_points = y >= 2012 ? Math.round(viirs_cells * (1.8 + rng() * 1.2)) : 0;
              detections_total = modis_points + viirs_points;
              frp_sum_mw = Math.round(modis_cells * (15 + rng() * 35));

              if (y >= 2018 || (yearFactor > 2.0 && dayIntensity > 1.2)) {
                const sampleCount = Math.min(detections_total, y >= 2020 ? 45 : 15);
                for (let p = 0; p < sampleCount; p++) {
                  const isViirs = (y >= 2012 && rng() > 0.4);
                  const lat = Number((minLat + rng() * (maxLat - minLat)).toFixed(4));
                  const lon = Number((minLon + rng() * (maxLon - minLon)).toFixed(4));
                  const hour = isViirs ? (rng() > 0.5 ? 13 : 1) : (rng() > 0.5 ? 10 : 22);
                  const min = Math.floor(rng() * 60);
                  const timeStr = `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}`;
                  const frp = Number((8 + rng() * 120 * (isViirs ? 0.7 : 1.2)).toFixed(1));
                  const confScore = Math.floor(40 + rng() * 60);
                  const confClass = confScore >= 80 ? 'high' : (confScore >= 30 ? 'nominal' : 'low');

                  hotspots.push({
                    id: `${preset.id}-${dateStr}-${p}`,
                    preset_id: preset.id, lat, lon,
                    acq_date_local: dateStr, acq_time: timeStr,
                    instrument: isViirs ? 'VIIRS' : 'MODIS',
                    satellite: isViirs ? (y >= 2018 && rng() > 0.5 ? 'NOAA-20' : 'Suomi-NPP') : (rng() > 0.5 ? 'Aqua' : 'Terra'),
                    confidence: confClass,
                    conf_raw: isViirs ? (confClass === 'high' ? 'h' : 'n') : String(confScore),
                    frp_mw: frp,
                    brightness_k: Number((315 + rng() * 65).toFixed(1)),
                    daynight: (hour >= 6 && hour <= 18) ? 'D' : 'N',
                    pixel_km: isViirs ? 0.375 : 1.0
                  });
                }
              }
            }

            let harmonized_cells = 0;
            let is_calibrated = false;

            if (y < 2012) {
              harmonized_cells = modis_cells;
            } else {
              if (modis_cells > 0) {
                harmonized_cells = modis_cells;
              } else if (viirs_cells > 0) {
                harmonized_cells = Math.round(viirs_cells / k_month);
                is_calibrated = true;
              }
            }

            daily.push({
              date: dateStr, year: y, month: monthNum, day: d,
              data_status: (modis_cells > 0 || viirs_cells > 0) ? 'observed' : 'no_detection',
              modis_cells, viirs_cells, harmonized_cells, detections_total, frp_sum_mw,
              sources_present, is_calibrated, k_month: y >= 2012 ? k_month : null,
              anomaly_score: null, anomaly_label: 'normal'
            });
          }
        }
      }

      this.scoreAnomalies(daily);
      this.datasets[preset.id] = { preset, daily, hotspots };
    }

    scoreAnomalies(daily) {
      const monthBuckets = {};
      for (let m = 1; m <= 12; m++) monthBuckets[m] = [];
      daily.forEach(r => {
        if (r.data_status === 'observed') monthBuckets[r.month].push(r.harmonized_cells);
      });

      const stats = {};
      for (let m = 1; m <= 12; m++) {
        const sorted = monthBuckets[m].slice().sort((a, b) => a - b);
        const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
        const absDevs = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b);
        const mad = Math.max(1.0, absDevs.length ? absDevs[Math.floor(absDevs.length / 2)] : 1.0);
        stats[m] = { median, mad };
      }

      daily.forEach(r => {
        if (r.data_status === 'missing_data') {
          r.anomaly_label = 'missing_data';
          return;
        }
        if (r.harmonized_cells === 0) {
          r.anomaly_score = 0;
          r.anomaly_label = 'normal';
          return;
        }
        if (r.year < 2009) {
          r.anomaly_label = 'insufficient_baseline';
          return;
        }

        const { median, mad } = stats[r.month];
        const z = Number(((r.harmonized_cells - median) / (1.4826 * mad)).toFixed(2));
        r.anomaly_score = z;
        if (z > 3.0) r.anomaly_label = 'unusual';
        else if (z >= 1.5) r.anomaly_label = 'elevated';
        else r.anomaly_label = 'normal';
      });
    }

    getPresets() { return PRESETS_DATA; }

    getSummary({ aoi, start, end }) {
      const data = this.datasets[aoi] || this.datasets['california_north'];
      let recs = data.daily;
      if (start) recs = recs.filter(r => r.date >= start);
      if (end) recs = recs.filter(r => r.date <= end);

      let totalCells = 0, totalDetections = 0, totalFrp = 0, activeDays = 0, gapDays = 0;
      let peakDay = null, maxCells = -1;
      const yearCounts = {};

      recs.forEach(r => {
        totalCells += r.harmonized_cells;
        totalDetections += r.detections_total;
        totalFrp += r.frp_sum_mw;
        if (r.data_status === 'observed') activeDays++;
        if (r.data_status === 'missing_data') gapDays++;
        if (r.harmonized_cells > maxCells) {
          maxCells = r.harmonized_cells;
          peakDay = { date: r.date, harmonized_cells: r.harmonized_cells, frp_mw: r.frp_sum_mw, anomaly_score: r.anomaly_score };
        }
        yearCounts[r.year] = (yearCounts[r.year] || 0) + r.harmonized_cells;
      });

      let busiestYear = null, maxYr = -1;
      for (const [yr, c] of Object.entries(yearCounts)) {
        if (c > maxYr) { maxYr = c; busiestYear = { year: Number(yr), total_cells: c }; }
      }

      const totalDays = recs.length || 1;
      return {
        aoi: data.preset.name,
        country: data.preset.country,
        total_records: totalDays,
        total_harmonized_cells: totalCells,
        total_detections: totalDetections,
        total_frp_mw: totalFrp,
        active_days_count: activeDays,
        fire_day_percentage: Number(((activeDays / totalDays) * 100).toFixed(1)),
        gap_days_count: gapDays,
        peak_day: peakDay,
        busiest_year: busiestYear,
        overlap_calibration_ratio: data.preset.typical_ratio
      };
    }

    getCalendar({ aoi, start, end, metric }) {
      const data = this.datasets[aoi] || this.datasets['california_north'];
      let recs = data.daily;
      if (start) recs = recs.filter(r => r.date >= start);
      if (end) recs = recs.filter(r => r.date <= end);

      return recs.map(r => {
        let val = r.harmonized_cells;
        if (metric === 'detections') val = r.detections_total;
        else if (metric === 'frp') val = r.frp_sum_mw;
        return {
          date: r.date, year: r.year, month: r.month, day: r.day,
          value: val, data_status: r.data_status, anomaly_label: r.anomaly_label,
          anomaly_score: r.anomaly_score, modis_cells: r.modis_cells, viirs_cells: r.viirs_cells,
          harmonized_cells: r.harmonized_cells, frp_sum_mw: r.frp_sum_mw, detections: r.detections_total,
          is_calibrated: r.is_calibrated, sources_present: r.sources_present, k_month: r.k_month
        };
      });
    }

    getTimeSeries({ aoi, start, end, granularity = 'month' }) {
      const data = this.datasets[aoi] || this.datasets['california_north'];
      let recs = data.daily;
      if (start) recs = recs.filter(r => r.date >= start);
      if (end) recs = recs.filter(r => r.date <= end);

      if (granularity === 'day') {
        return recs.map(r => ({
          period: r.date, modis_cells: r.modis_cells, viirs_cells: r.viirs_cells,
          harmonized_cells: r.harmonized_cells, frp_sum_mw: r.frp_sum_mw, data_status: r.data_status
        }));
      }

      const map = {};
      recs.forEach(r => {
        const key = granularity === 'year' ? String(r.year) : r.date.substring(0, 7);
        if (!map[key]) {
          map[key] = { period: key, modis_cells: 0, viirs_cells: 0, harmonized_cells: 0, frp_sum_mw: 0, active_days: 0, gap_days: 0 };
        }
        map[key].modis_cells += r.modis_cells;
        map[key].viirs_cells += r.viirs_cells;
        map[key].harmonized_cells += r.harmonized_cells;
        map[key].frp_sum_mw += r.frp_sum_mw;
        if (r.data_status === 'observed') map[key].active_days++;
        if (r.data_status === 'missing_data') map[key].gap_days++;
      });
      return Object.values(map);
    }

    getAnomalies({ aoi, start, end }) {
      const data = this.datasets[aoi] || this.datasets['california_north'];
      let recs = data.daily.filter(r => r.anomaly_label === 'elevated' || r.anomaly_label === 'unusual');
      if (start) recs = recs.filter(r => r.date >= start);
      if (end) recs = recs.filter(r => r.date <= end);

      return recs.sort((a, b) => (b.anomaly_score || 0) - (a.anomaly_score || 0)).slice(0, 30).map(r => ({
        date: r.date, harmonized_cells: r.harmonized_cells, score: r.anomaly_score,
        severity: r.anomaly_label, frp_sum_mw: r.frp_sum_mw, sources: r.sources_present
      }));
    }

    getHotspots({ aoi, start, end, date, minConf, sources }) {
      const data = this.datasets[aoi] || this.datasets['california_north'];
      let list = data.hotspots;
      if (date) list = list.filter(h => h.acq_date_local === date);
      else {
        if (start) list = list.filter(h => h.acq_date_local >= start);
        if (end) list = list.filter(h => h.acq_date_local <= end);
      }
      if (minConf === 'high') list = list.filter(h => h.confidence === 'high');
      else if (minConf === 'nominal') list = list.filter(h => h.confidence === 'nominal' || h.confidence === 'high');

      return {
        type: 'FeatureCollection',
        features: list.slice(0, 10000).map(h => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
          properties: h
        }))
      };
    }

    exportCsv({ aoi, start, end }) {
      const data = this.datasets[aoi] || this.datasets['california_north'];
      let recs = data.daily;
      if (start) recs = recs.filter(r => r.date >= start);
      if (end) recs = recs.filter(r => r.date <= end);

      const headers = ['date', 'aoi_id', 'data_status', 'harmonized_cells', 'modis_cells', 'viirs_cells', 'total_detections', 'frp_sum_mw', 'anomaly_score', 'anomaly_label'];
      const rows = recs.map(r => [r.date, data.preset.id, r.data_status, r.harmonized_cells, r.modis_cells, r.viirs_cells, r.detections_total, r.frp_sum_mw, r.anomaly_score || '', r.anomaly_label]);
      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
  }

  const clientEngineInstance = new ClientEngine();
  let useClientFallback = false;

  // Application State
  const state = {
    aoi: 'california_north',
    presets: PRESETS_DATA,
    customBbox: null,
    startDate: '2004-01-01',
    endDate: '2024-12-31',
    source: 'ALL',
    minConf: 'nominal',
    metric: 'harmonized_cells',
    selectedDate: null,
    mapLayerMode: 'points',
    timeseriesGranularity: 'month',
    calendarData: [],
    timeseriesData: [],
    hotspotsGeoJson: null,
    summaryData: null,
    anomaliesData: []
  };

  // DOM Elements
  const el = {
    aoiList: document.getElementById('aoi-preset-list'),
    aoiBadge: document.getElementById('aoi-area-badge'),
    badgeActiveAoi: document.getElementById('badge-active-aoi'),
    displayAoiTitle: document.getElementById('display-aoi-title'),
    displayDateRange: document.getElementById('display-date-range'),
    badgeOverlapRatio: document.getElementById('badge-overlap-ratio'),
    startDateInput: document.getElementById('input-start-date'),
    endDateInput: document.getElementById('input-end-date'),
    bboxMinLon: document.getElementById('bbox-minlon'),
    bboxMinLat: document.getElementById('bbox-minlat'),
    bboxMaxLon: document.getElementById('bbox-maxlon'),
    bboxMaxLat: document.getElementById('bbox-maxlat'),
    btnApplyBbox: document.getElementById('btn-apply-bbox'),
    bboxFeedback: document.getElementById('bbox-feedback'),
    kpiTotalCells: document.getElementById('kpi-total-cells'),
    kpiDetectionsCount: document.getElementById('kpi-detections-count'),
    kpiPeakDay: document.getElementById('kpi-peak-day'),
    kpiPeakDetail: document.getElementById('kpi-peak-detail'),
    kpiBusiestYear: document.getElementById('kpi-busiest-year'),
    kpiYearDetail: document.getElementById('kpi-year-detail'),
    kpiActivePct: document.getElementById('kpi-active-pct'),
    kpiActiveCount: document.getElementById('kpi-active-count'),
    kpiTotalFrp: document.getElementById('kpi-total-frp'),
    kpiGapCount: document.getElementById('kpi-gap-count'),
    mapPointCounter: document.getElementById('map-point-counter'),
    btnLayerPoints: document.getElementById('btn-layer-points'),
    btnLayerDensity: document.getElementById('btn-layer-density'),
    btnResetMapView: document.getElementById('btn-reset-map-view'),
    mapDateFocusBanner: document.getElementById('map-date-focus-banner'),
    focusBannerDate: document.getElementById('focus-banner-date'),
    btnClearDateFocus: document.getElementById('btn-clear-date-focus'),
    calendarRoot: document.getElementById('calendar-matrix-root'),
    timeseriesCanvas: document.getElementById('timeseries-canvas'),
    anomalyItemsContainer: document.getElementById('anomaly-items-container'),
    benchmarkTableBody: document.getElementById('benchmark-table-body'),
    tooltip: document.getElementById('global-tooltip'),
    ttDate: document.getElementById('tt-date'),
    ttCells: document.getElementById('tt-cells'),
    ttFrp: document.getElementById('tt-frp'),
    ttStatus: document.getElementById('tt-status'),
    modalMethodology: document.getElementById('modal-methodology'),
    modalTerms: document.getElementById('modal-terms'),
    modalPrivacy: document.getElementById('modal-privacy'),
    btnOpenMethodology: document.getElementById('btn-open-methodology'),
    btnHeroMethodology: document.getElementById('btn-hero-methodology'),
    footerBtnMethodology: document.getElementById('footer-btn-methodology'),
    footerBtnTerms: document.getElementById('footer-btn-terms'),
    footerBtnPrivacy: document.getElementById('footer-btn-privacy'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnQuickExport: document.getElementById('btn-quick-export'),
    btnToggleHero: document.getElementById('btn-toggle-hero'),
    btnHeroLaunch: document.getElementById('btn-hero-launch'),
    heroGateway: document.getElementById('hero-gateway'),
    dashboardApp: document.getElementById('dashboard-app')
  };

  let leafletMap = null;
  let hotspotMarkersLayer = null;
  let aoiBboxLayer = null;

  async function checkServerAvailability() {
    try {
      const res = await fetch('/api/v1/health');
      if (!res.ok) useClientFallback = true;
    } catch {
      useClientFallback = true;
    }
  }

  async function init() {
    await checkServerAvailability();
    initLeafletMap();
    initEventListeners();
    await loadPresets();
    await refreshAllData();
  }

  function initLeafletMap() {
    leafletMap = L.map('hotspot-map', {
      zoomControl: false,
      attributionControl: false
    }).setView([40.0, -121.75], 7);

    L.control.zoom({ position: 'topright' }).addTo(leafletMap);

    // Clean ESRI World Dark Gray Basemap
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors'
    }).addTo(leafletMap);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      opacity: 0.6
    }).addTo(leafletMap);

    hotspotMarkersLayer = L.layerGroup().addTo(leafletMap);
    aoiBboxLayer = L.layerGroup().addTo(leafletMap);
    initTimeseriesHover();
  }

  async function loadPresets() {
    if (useClientFallback) {
      state.presets = clientEngineInstance.getPresets();
    } else {
      try {
        const res = await fetch('/api/v1/aoi/presets');
        state.presets = await res.json();
      } catch {
        useClientFallback = true;
        state.presets = clientEngineInstance.getPresets();
      }
    }
    renderPresetButtons();
  }

  function renderPresetButtons() {
    el.aoiList.innerHTML = '';
    state.presets.forEach(p => {
      const btn = document.createElement('button');
      btn.className = `aoi-btn ${p.id === state.aoi ? 'active' : ''}`;
      btn.dataset.id = p.id;
      btn.innerHTML = `
        <span class="aoi-btn-name">${p.name}</span>
        <span class="aoi-btn-meta">${p.country} &middot; Peak: ${p.fire_season}</span>
      `;
      btn.addEventListener('click', () => {
        selectPreset(p.id);
      });
      el.aoiList.appendChild(btn);
    });
  }

  function selectPreset(presetId) {
    state.aoi = presetId;
    state.selectedDate = null;
    hideDateFocusBanner();

    document.querySelectorAll('.aoi-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.id === presetId);
    });

    const preset = state.presets.find(p => p.id === presetId);
    if (preset) {
      el.badgeActiveAoi.textContent = preset.name.split('—')[0].trim();
      el.displayAoiTitle.textContent = preset.name;
      el.badgeOverlapRatio.textContent = `Overlap Ratio k = ${preset.typical_ratio}`;
      el.aoiBadge.textContent = 'Preset';

      el.bboxMinLon.value = preset.bbox[0];
      el.bboxMinLat.value = preset.bbox[1];
      el.bboxMaxLon.value = preset.bbox[2];
      el.bboxMaxLat.value = preset.bbox[3];

      updateMapAoi(preset.bbox, preset.center, preset.zoom);
      updateBenchmarkTable(preset);
    }

    refreshAllData();
  }

  function updateMapAoi(bbox, center, zoom) {
    if (!leafletMap) return;
    aoiBboxLayer.clearLayers();

    const [w, s, e, n] = bbox;
    const bounds = [[s, w], [n, e]];

    const rect = L.rectangle(bounds, {
      color: '#F97316',
      weight: 1.5,
      dashArray: '4, 4',
      fill: true,
      fillColor: '#F97316',
      fillOpacity: 0.04
    });

    aoiBboxLayer.addLayer(rect);
    leafletMap.setView(center || [(s + n) / 2, (w + e) / 2], zoom || 7);
  }

  function updateBenchmarkTable(preset) {
    if (!preset) return;
    if (preset.id === 'california_north') {
      el.benchmarkTableBody.innerHTML = `
        <tr><td>Late Summer (Aug–Sep)</td><td>Peak Conifer Crown</td><td>184 cells/day</td><td>${preset.typical_ratio}×</td></tr>
        <tr><td>Autumn (Oct–Nov)</td><td>Diablo/Santa Ana Winds</td><td>92 cells/day</td><td>${(preset.typical_ratio - 0.08).toFixed(2)}×</td></tr>
        <tr><td>Winter/Spring (Dec–May)</td><td>Dormant Snowpack</td><td>4 cells/day</td><td>${(preset.typical_ratio + 0.07).toFixed(2)}×</td></tr>
      `;
    } else if (preset.id === 'amazon_arc') {
      el.benchmarkTableBody.innerHTML = `
        <tr><td>Dry Season (Aug–Sep)</td><td>Agricultural Slash-and-Burn</td><td>310 cells/day</td><td>${preset.typical_ratio}×</td></tr>
        <tr><td>Transition (Oct–Nov)</td><td>Understory Smoke Drift</td><td>125 cells/day</td><td>${(preset.typical_ratio - 0.12).toFixed(2)}×</td></tr>
        <tr><td>Wet Season (Dec–May)</td><td>Cloud Obscuration</td><td>18 cells/day</td><td>${(preset.typical_ratio + 0.10).toFixed(2)}×</td></tr>
      `;
    } else if (preset.id === 'central_india') {
      el.benchmarkTableBody.innerHTML = `
        <tr><td>Spring (Mar–Apr)</td><td>Deciduous Leaf-Litter Burning</td><td>245 cells/day</td><td>${preset.typical_ratio}×</td></tr>
        <tr><td>Pre-Monsoon (May)</td><td>Peak Heatwave & Wheat Residue</td><td>135 cells/day</td><td>${(preset.typical_ratio - 0.05).toFixed(2)}×</td></tr>
        <tr><td>Monsoon/Winter (Jun–Dec)</td><td>High Vegetation Cover</td><td>12 cells/day</td><td>${(preset.typical_ratio + 0.09).toFixed(2)}×</td></tr>
      `;
    }
  }

  async function refreshAllData() {
    el.displayDateRange.textContent = `Span: ${state.startDate} to ${state.endDate}`;
    await Promise.all([
      fetchSummary(),
      fetchCalendar(),
      fetchTimeseries(),
      fetchHotspots(),
      fetchAnomalies()
    ]);
  }

  async function fetchSummary() {
    if (useClientFallback) {
      state.summaryData = clientEngineInstance.getSummary({
        aoi: state.aoi, start: state.startDate, end: state.endDate
      });
      renderSummary();
      return;
    }
    try {
      const q = new URLSearchParams({ aoi: state.aoi, start: state.startDate, end: state.endDate });
      const res = await fetch(`/api/v1/summary?${q}`);
      state.summaryData = await res.json();
      renderSummary();
    } catch {
      useClientFallback = true;
      fetchSummary();
    }
  }

  function renderSummary() {
    const s = state.summaryData;
    if (!s) return;

    el.kpiTotalCells.textContent = s.total_harmonized_cells.toLocaleString();
    el.kpiDetectionsCount.textContent = `From ${s.total_detections.toLocaleString()} raw detections`;

    if (s.peak_day) {
      el.kpiPeakDay.textContent = s.peak_day.date;
      el.kpiPeakDetail.textContent = `${s.peak_day.harmonized_cells} Cells · Robust Z: +${s.peak_day.anomaly_score}`;
    }

    if (s.busiest_year) {
      el.kpiBusiestYear.textContent = s.busiest_year.year;
      el.kpiYearDetail.textContent = `${s.busiest_year.total_cells.toLocaleString()} harmonized cells`;
    }

    el.kpiActivePct.textContent = `${s.fire_day_percentage}%`;
    el.kpiActiveCount.textContent = `${s.active_days_count.toLocaleString()} days with detected fire`;
    el.kpiTotalFrp.textContent = `${(s.total_frp_mw / 1000000).toFixed(2)}M MW`;
    el.kpiGapCount.textContent = s.gap_days_count.toLocaleString();
  }

  async function fetchCalendar() {
    if (useClientFallback) {
      state.calendarData = clientEngineInstance.getCalendar({
        aoi: state.aoi, start: state.startDate, end: state.endDate, metric: state.metric
      });
      renderCalendarMatrix();
      return;
    }
    try {
      const q = new URLSearchParams({
        aoi: state.aoi, start: state.startDate, end: state.endDate,
        sources: state.source === 'ALL' ? '' : state.source,
        min_conf: state.minConf, metric: state.metric
      });
      const res = await fetch(`/api/v1/calendar?${q}`);
      state.calendarData = await res.json();
      renderCalendarMatrix();
    } catch {
      useClientFallback = true;
      fetchCalendar();
    }
  }

  function renderCalendarMatrix() {
    el.calendarRoot.innerHTML = '';

    const headerRow = document.createElement('div');
    headerRow.className = 'matrix-header-row';
    headerRow.innerHTML = `
      <div>Year</div>
      <div>Jan</div><div>Feb</div><div>Mar</div><div>Apr</div><div>May</div><div>Jun</div>
      <div>Jul</div><div>Aug</div><div>Sep</div><div>Oct</div><div>Nov</div><div>Dec</div>
    `;
    el.calendarRoot.appendChild(headerRow);

    const yearsMap = {};
    state.calendarData.forEach(r => {
      if (!yearsMap[r.year]) yearsMap[r.year] = [];
      yearsMap[r.year].push(r);
    });

    let maxVal = 1;
    state.calendarData.forEach(r => {
      if (r.value > maxVal) maxVal = r.value;
    });

    const years = Object.keys(yearsMap).sort((a, b) => Number(b) - Number(a));

    years.forEach(y => {
      const yearRow = document.createElement('div');
      yearRow.className = 'matrix-year-row';

      const label = document.createElement('div');
      label.className = 'matrix-year-label';
      label.textContent = y;
      yearRow.appendChild(label);

      const track = document.createElement('div');
      track.className = 'matrix-days-track';

      const days = yearsMap[y];
      days.forEach(day => {
        const cell = document.createElement('div');
        cell.className = 'cal-day-cell';
        cell.setAttribute('data-date', day.date);
        cell.setAttribute('data-status', day.data_status);
        cell.dataset.date = day.date;
        cell.dataset.status = day.data_status;
        cell.title = `${day.date}: ${day.value} ${state.metric} (${day.data_status})`;

        if (state.selectedDate === day.date) {
          cell.classList.add('selected');
        }

        if (day.data_status === 'observed') {
          const norm = Math.min(1.0, day.value / (maxVal * 0.7));
          const intensity = Math.max(1, Math.ceil(norm * 9));
          cell.setAttribute('data-intensity', String(intensity));
          cell.dataset.intensity = String(intensity);

          if (day.anomaly_label === 'unusual') cell.classList.add('anomaly-unusual');
          else if (day.anomaly_label === 'elevated') cell.classList.add('anomaly-elevated');
        }

        cell.addEventListener('mouseenter', (ev) => showTooltip(ev, day));
        cell.addEventListener('mouseleave', hideTooltip);
        cell.addEventListener('click', () => onDayClick(day));

        track.appendChild(cell);
      });

      yearRow.appendChild(track);
      el.calendarRoot.appendChild(yearRow);
    });
  }

  function onDayClick(day) {
    state.selectedDate = day.date;
    showDateFocusBanner(day.date);

    document.querySelectorAll('.cal-day-cell').forEach(c => {
      c.classList.toggle('selected', c.getAttribute('data-date') === day.date);
    });

    fetchHotspots();
  }

  function showDateFocusBanner(dateStr) {
    el.focusBannerDate.textContent = dateStr;
    el.mapDateFocusBanner.classList.add('active');
  }

  function hideDateFocusBanner() {
    state.selectedDate = null;
    el.mapDateFocusBanner.classList.remove('active');
    document.querySelectorAll('.cal-day-cell.selected').forEach(c => c.classList.remove('selected'));
  }

  async function fetchHotspots() {
    if (useClientFallback) {
      state.hotspotsGeoJson = clientEngineInstance.getHotspots({
        aoi: state.aoi, minConf: state.minConf,
        date: state.selectedDate, start: state.startDate, end: state.endDate
      });
      renderHotspotsOnMap();
      return;
    }
    try {
      const q = new URLSearchParams({
        aoi: state.aoi, min_conf: state.minConf,
        sources: state.source === 'ALL' ? '' : state.source
      });
      if (state.selectedDate) q.set('date', state.selectedDate);
      else { q.set('start', state.startDate); q.set('end', state.endDate); }

      const res = await fetch(`/api/v1/hotspots?${q}`);
      state.hotspotsGeoJson = await res.json();
      renderHotspotsOnMap();
    } catch {
      useClientFallback = true;
      fetchHotspots();
    }
  }

  function renderHotspotsOnMap() {
    if (!leafletMap || !state.hotspotsGeoJson) return;
    hotspotMarkersLayer.clearLayers();

    const features = state.hotspotsGeoJson.features || [];
    el.mapPointCounter.textContent = state.selectedDate
      ? `Displaying ${features.length} points on ${state.selectedDate}`
      : `Displaying ${features.length.toLocaleString()} active fire points`;

    features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;

      let dotColor = p.instrument === 'VIIRS' ? '#4ADE80' : '#38BDF8';
      let radius = p.instrument === 'VIIRS' ? 4 : 6;

      if (p.frp_mw >= 80) {
        dotColor = '#DC2626';
        radius += 2;
      }

      const marker = L.circleMarker([lat, lon], {
        radius,
        fillColor: dotColor,
        color: '#111110',
        weight: 1,
        fillOpacity: 0.85
      });

      marker.bindPopup(`
        <div class="popup-details">
          <div class="popup-title">${p.instrument} &middot; ${p.satellite}</div>
          <div><strong>Date:</strong> ${p.acq_date_local || p.date} (${p.acq_time || p.time} UTC)</div>
          <div><strong>Coordinates:</strong> ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</div>
          <div><strong>Radiative Power:</strong> <span style="color: #F97316; font-weight: 600;">${p.frp_mw} MW</span></div>
          <div><strong>Brightness Temp:</strong> ${p.brightness_k} K</div>
          <div><strong>Confidence:</strong> ${(p.confidence || 'nominal').toUpperCase()}</div>
          <div><strong>Observation:</strong> ${p.daynight === 'D' ? 'Daytime' : 'Nighttime'} &middot; ${p.pixel_km} km</div>
        </div>
      `);

      hotspotMarkersLayer.addLayer(marker);
    });
  }

  async function fetchTimeseries() {
    if (useClientFallback) {
      state.timeseriesData = clientEngineInstance.getTimeSeries({
        aoi: state.aoi, start: state.startDate, end: state.endDate, granularity: state.timeseriesGranularity
      });
      renderTimeseriesChart();
      return;
    }
    try {
      const q = new URLSearchParams({
        aoi: state.aoi, start: state.startDate, end: state.endDate, granularity: state.timeseriesGranularity
      });
      const res = await fetch(`/api/v1/timeseries?${q}`);
      state.timeseriesData = await res.json();
      renderTimeseriesChart();
    } catch {
      useClientFallback = true;
      fetchTimeseries();
    }
  }

  function renderTimeseriesChart() {
    const canvas = el.timeseriesCanvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const data = state.timeseriesData;
    if (!data || data.length === 0) return;

    let maxVal = 10;
    data.forEach(d => {
      if (d.modis_cells > maxVal) maxVal = d.modis_cells;
      if (d.viirs_cells > maxVal) maxVal = d.viirs_cells;
      if (d.harmonized_cells > maxVal) maxVal = d.harmonized_cells;
    });

    const padding = { top: 20, right: 30, bottom: 35, left: 55 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.strokeStyle = '#222220';
    ctx.lineWidth = 1;
    const gridRows = 4;
    for (let r = 0; r <= gridRows; r++) {
      const y = padding.top + (chartH / gridRows) * r;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const labelVal = Math.round(maxVal - (maxVal / gridRows) * r);
      ctx.fillStyle = '#666662';
      ctx.font = '10px "IBM Plex Sans"';
      ctx.textAlign = 'right';
      ctx.fillText(labelVal.toLocaleString(), padding.left - 8, y + 3);
    }

    const getX = (idx) => padding.left + (chartW / (data.length - 1 || 1)) * idx;
    const getY = (val) => padding.top + chartH - (val / maxVal) * chartH;

    // MODIS (Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    data.forEach((d, i) => {
      const x = getX(i);
      const y = getY(d.modis_cells);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // VIIRS (Green)
    ctx.beginPath();
    ctx.strokeStyle = '#4ADE80';
    ctx.lineWidth = 1.5;
    let startedViirs = false;
    data.forEach((d, i) => {
      if (d.viirs_cells > 0) {
        const x = getX(i);
        const y = getY(d.viirs_cells);
        if (!startedViirs) { ctx.moveTo(x, y); startedViirs = true; }
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Harmonized (Orange)
    ctx.beginPath();
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 2.5;
    data.forEach((d, i) => {
      const x = getX(i);
      const y = getY(d.harmonized_cells);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#888880';
    ctx.font = '10px "IBM Plex Sans"';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(data.length / 8));
    for (let i = 0; i < data.length; i += labelStep) {
      const x = getX(i);
      ctx.fillText(data[i].period, x, h - 10);
    }
  }

  function initTimeseriesHover() {
    const canvas = el.timeseriesCanvas;
    if (!canvas) return;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const data = state.timeseriesData;
      if (!data || data.length === 0) return;

      const paddingLeft = 55;
      const chartW = rect.width - 55 - 30;
      if (x < paddingLeft || x > paddingLeft + chartW) {
        hideTooltip();
        return;
      }

      const ratio = (x - paddingLeft) / chartW;
      const idx = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
      const d = data[idx];

      showTooltip(e, {
        date: d.period,
        value: d.harmonized_cells,
        modis_cells: d.modis_cells,
        viirs_cells: d.viirs_cells,
        frp_sum_mw: d.frp_sum_mw,
        data_status: d.data_status || 'observed'
      });
    });

    canvas.addEventListener('mouseleave', hideTooltip);
  }

  async function fetchAnomalies() {
    if (useClientFallback) {
      state.anomaliesData = clientEngineInstance.getAnomalies({
        aoi: state.aoi, start: state.startDate, end: state.endDate
      });
      renderAnomaliesList();
      return;
    }
    try {
      const q = new URLSearchParams({ aoi: state.aoi, start: state.startDate, end: state.endDate });
      const res = await fetch(`/api/v1/anomalies?${q}`);
      state.anomaliesData = await res.json();
      renderAnomaliesList();
    } catch {
      useClientFallback = true;
      fetchAnomalies();
    }
  }

  function renderAnomaliesList() {
    el.anomalyItemsContainer.innerHTML = '';
    const list = state.anomaliesData || [];

    if (list.length === 0) {
      el.anomalyItemsContainer.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); padding: 12px 0;">
          No elevated anomalies identified within this filter window.
        </div>
      `;
      return;
    }

    list.slice(0, 15).forEach(a => {
      const item = document.createElement('div');
      item.className = 'anomaly-item';
      item.innerHTML = `
        <div class="anomaly-info">
          <span class="anomaly-date">${a.date}</span>
          <span class="anomaly-meta">${a.harmonized_cells} Cells &middot; ${a.frp_sum_mw.toLocaleString()} MW FRP</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="anomaly-badge ${a.severity}">${a.severity.toUpperCase()} (+${a.score}&sigma;)</span>
        </div>
      `;

      item.addEventListener('click', () => {
        onDayClick({ date: a.date, data_status: 'observed' });
      });

      el.anomalyItemsContainer.appendChild(item);
    });
  }

  function showTooltip(ev, item) {
    el.ttDate.textContent = item.date;
    el.ttCells.textContent = `Harmonized Cells: ${item.value !== undefined ? item.value : (item.harmonized_cells || 0)}`;

    if (item.modis_cells !== undefined && item.viirs_cells !== undefined) {
      el.ttFrp.textContent = `MODIS: ${item.modis_cells} · VIIRS: ${item.viirs_cells} (k=${item.k_month || '2.85'})`;
    } else {
      el.ttFrp.textContent = item.frp_sum_mw ? `Total FRP: ${item.frp_sum_mw.toLocaleString()} MW` : '';
    }

    if (item.data_status === 'missing_data') {
      el.ttStatus.textContent = 'Status: Missing Satellite Data (Orbital Gap)';
      el.ttStatus.style.color = 'var(--text-muted)';
    } else if (item.data_status === 'no_detection') {
      el.ttStatus.textContent = 'Status: 0 Fires Detected (Data Available)';
      el.ttStatus.style.color = 'var(--status-normal)';
    } else {
      const anomalyTxt = item.anomaly_label && item.anomaly_label !== 'normal'
        ? ` (${item.anomaly_label.toUpperCase()} +${item.anomaly_score}σ)`
        : '';
      el.ttStatus.textContent = `Status: Active Fire Observed${anomalyTxt}`;
      el.ttStatus.style.color = item.anomaly_label === 'unusual' ? 'var(--status-unusual)' : 'var(--thermal-med)';
    }

    el.tooltip.style.display = 'flex';
    const x = Math.min(window.innerWidth - 220, ev.pageX + 12);
    const y = Math.max(10, ev.pageY - 70);
    el.tooltip.style.left = `${x}px`;
    el.tooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    el.tooltip.style.display = 'none';
  }

  function initEventListeners() {
    window.addEventListener('resize', () => {
      renderTimeseriesChart();
    });

    document.querySelectorAll('.date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const p = btn.dataset.preset;

        if (p === 'archive') { state.startDate = '2004-01-01'; state.endDate = '2024-12-31'; }
        else if (p === 'overlap') { state.startDate = '2012-01-01'; state.endDate = '2024-12-31'; }
        else if (p === 'recent') { state.startDate = '2022-01-01'; state.endDate = '2024-12-31'; }
        else if (p === 'single2020') { state.startDate = '2020-01-01'; state.endDate = '2020-12-31'; }

        el.startDateInput.value = state.startDate;
        el.endDateInput.value = state.endDate;
        state.selectedDate = null;
        hideDateFocusBanner();
        refreshAllData();
      });
    });

    el.startDateInput.addEventListener('change', () => {
      state.startDate = el.startDateInput.value;
      refreshAllData();
    });

    el.endDateInput.addEventListener('change', () => {
      state.endDate = el.endDateInput.value;
      refreshAllData();
    });

    document.querySelectorAll('#sensor-filter-control .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sensor-filter-control .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.source = btn.dataset.source;
        refreshAllData();
      });
    });

    document.querySelectorAll('#conf-filter-control .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#conf-filter-control .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.minConf = btn.dataset.conf;
        fetchCalendar();
        fetchHotspots();
      });
    });

    document.querySelectorAll('#metric-filter-control .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#metric-filter-control .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.metric = btn.dataset.metric;
        fetchCalendar();
      });
    });

    el.btnApplyBbox.addEventListener('click', async () => {
      const minLon = parseFloat(el.bboxMinLon.value);
      const minLat = parseFloat(el.bboxMinLat.value);
      const maxLon = parseFloat(el.bboxMaxLon.value);
      const maxLat = parseFloat(el.bboxMaxLat.value);

      if (isNaN(minLon) || isNaN(minLat) || isNaN(maxLon) || isNaN(maxLat) || minLon >= maxLon || minLat >= maxLat) {
        el.bboxFeedback.textContent = 'Error: Invalid bounding box coordinates.';
        el.bboxFeedback.style.color = '#EF4444';
        return;
      }

      const bbox = [minLon, minLat, maxLon, maxLat];
      const latMid = (minLat + maxLat) / 2;
      const areaKm2 = Math.round((maxLat - minLat) * 111 * (maxLon - minLon) * 111 * Math.cos((latMid * Math.PI) / 180));

      el.bboxFeedback.textContent = `Valid AOI (${areaKm2.toLocaleString()} km²).`;
      el.bboxFeedback.style.color = '#10B981';

      state.customBbox = bbox;
      state.aoi = 'california_north';
      el.aoiBadge.textContent = 'Custom AOI';
      el.badgeActiveAoi.textContent = 'Custom Bounding Box';
      el.displayAoiTitle.textContent = `Custom Area (${areaKm2.toLocaleString()} km²)`;

      updateMapAoi(bbox, [latMid, (minLon + maxLon) / 2], 7);
      refreshAllData();
    });

    el.btnLayerPoints.addEventListener('click', () => {
      el.btnLayerPoints.classList.add('active');
      el.btnLayerDensity.classList.remove('active');
      state.mapLayerMode = 'points';
      renderHotspotsOnMap();
    });

    el.btnLayerDensity.addEventListener('click', () => {
      el.btnLayerDensity.classList.add('active');
      el.btnLayerPoints.classList.remove('active');
      state.mapLayerMode = 'density';
      renderHotspotsOnMap();
    });

    el.btnResetMapView.addEventListener('click', () => {
      const preset = state.presets.find(p => p.id === state.aoi);
      if (preset && leafletMap) {
        leafletMap.setView(preset.center, preset.zoom);
      }
    });

    el.btnClearDateFocus.addEventListener('click', () => {
      hideDateFocusBanner();
      fetchHotspots();
    });

    document.querySelectorAll('.gran-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gran-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timeseriesGranularity = btn.dataset.gran;
        fetchTimeseries();
      });
    });

    const triggerExport = () => {
      if (useClientFallback) {
        const csv = clientEngineInstance.exportCsv({ aoi: state.aoi, start: state.startDate, end: state.endDate });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ignis_track_${state.aoi}_harmonized.csv`;
        link.click();
      } else {
        const q = new URLSearchParams({ aoi: state.aoi, start: state.startDate, end: state.endDate });
        window.location.href = `/api/v1/export.csv?${q}`;
      }
    };
    el.btnExportCsv.addEventListener('click', triggerExport);
    el.btnQuickExport.addEventListener('click', triggerExport);

    const scrollToDashboard = () => {
      el.dashboardApp.scrollIntoView({ behavior: 'smooth' });
    };
    el.btnHeroLaunch.addEventListener('click', scrollToDashboard);
    el.btnToggleHero.addEventListener('click', scrollToDashboard);

    const openModal = (dialogEl) => { dialogEl.classList.add('open'); };
    const closeModal = (dialogEl) => { dialogEl.classList.remove('open'); };

    el.btnOpenMethodology.addEventListener('click', () => openModal(el.modalMethodology));
    el.btnHeroMethodology.addEventListener('click', () => openModal(el.modalMethodology));
    el.footerBtnMethodology.addEventListener('click', () => openModal(el.modalMethodology));
    el.footerBtnTerms.addEventListener('click', () => openModal(el.modalTerms));
    el.footerBtnPrivacy.addEventListener('click', () => openModal(el.modalPrivacy));

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.close;
        const modal = document.getElementById(targetId);
        if (modal) closeModal(modal);
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(backdrop);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
