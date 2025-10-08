// IndexedDB for caching
// Name of our database and object store
const DB_NAME = "CrashDataCache";
const DB_VERSION = 1;
const STORE_NAME = "farsResults";

// Open (or create) IndexedDB
function openDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		// Create schema if first time or version upgrade
		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "key" });
				// "key" will be a unique string we construct from dataset+state+years
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

// Save a result to cache
async function saveToCache(key, data) {
	const db = await openDatabase();
	const tx = db.transaction(STORE_NAME, "readwrite");
	tx.objectStore(STORE_NAME).put({ key, data, timestamp: Date.now() });
	return tx.complete;
}

// Retrieve from cache
async function getFromCache(key) {
	const db = await openDatabase();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const store = tx.objectStore(STORE_NAME);
		const request = store.get(key);
		request.onsuccess = () => {
			resolve(request.result ? request.result.data : null);
		};
		request.onerror = () => reject(request.error);
	});
}

// Mapbox access token
mapboxgl.accessToken = "pk.eyJ1IjoiY2FzaGFsIiwiYSI6ImNtOHBmN285cTBhNW4yanE0ZTNiN2UxeXAifQ.JqlCwmFykXHwQ9XeCxQAmw";

// new Mapbox GL JS map
const map = new mapboxgl.Map({
	container: "map",
	style: "mapbox://styles/mapbox/light-v10",
	center: [-96, 37.8],
	zoom: 4,
});

let allFeatures = [];
let stateGeoJSON = null;
// URL for US states GeoJSON
const statesGeojsonUrl = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

// UI elements
const datasetSelector = document.getElementById("dataset-selector");
const timeControls = document.getElementById("time-filter-controls");
const sliderContainer = document.getElementById("time-slider-container");
const layerModeContainer = document.getElementById("layer-mode-container");

datasetSelector.addEventListener("change", (e) => {
	const ds = e.target.value;
	const stateSel = document.getElementById("select-state");
	const yearNote = document.getElementById("year-note");
	if (ds === "Drugs") {
		stateSel.disabled = true;
		yearNote.style.display = "block";
		timeControls.style.display = "none";
		sliderContainer.style.display = "none";
		layerModeContainer.style.display = "none";
		["crash-heat", "clusters", "cluster-count", "unclustered-point"].forEach((id) => {
			if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
		});
	} else {
		stateSel.disabled = false;
		yearNote.style.display = "none";
		timeControls.style.display = "flex";
		sliderContainer.style.display = "flex";
		layerModeContainer.style.display = "flex";
		["drug-choropleth", "drug-borders"].forEach((id) => {
			if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
		});
	}
});

/**
 * Filters features based on the selected hour.
 * Returns a GeoJSON feature collection.
 */
function filterFeaturesByTime(selectedHour) {
	const filtered = allFeatures.filter((feat) => {
		// Only include features with a valid originalHour
		return feat.properties.originalHour === selectedHour;
	});
	return {
		type: "FeatureCollection",
		features: filtered,
	};
}

// Add a legend.
function addLegend() {
	const legend = document.createElement("div");
	legend.id = "legend";
	legend.style.cssText = `
    position: absolute;
    bottom: 30px;
    left: 10px;
    padding: 10px;
    background: white;
    font-family: sans-serif;
    font-size: 12px;
    color: #333;
    box-shadow: 0 0 3px rgba(0,0,0,0.3);
  `;
	map.getContainer().appendChild(legend);
}
map.on("load", addLegend);

function updateLegendForAccident() {
	const legend = document.getElementById("legend");
	legend.innerHTML = `
    <strong>Fatalities</strong><br>
    <div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgba(33,102,172,1);"></div>
      <span style="margin-left: 5px;">Low</span>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgb(103,169,207);"></div>
      <span style="margin-left: 5px;">&nbsp;</span>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgb(209,229,240);"></div>
      <span style="margin-left: 5px;">Medium</span>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgb(253,219,199);"></div>
      <span style="margin-left: 5px;">&nbsp;</span>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgb(239,138,98);"></div>
      <span style="margin-left: 5px;">High</span>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgb(178,24,43);"></div>
      <span style="margin-left: 5px;">Very High</span>
    </div>
  `;
}

function updateLegendForDrugs() {
	const legend = document.getElementById("legend");
	legend.innerHTML = `
	<strong style="color:#1abc9c;">Positive Drug Tests (%)</strong><br>
    <div style="display:flex;align-items:center;">
      <div style="width:20px;height:20px;background:rgba(217,240,203,0);"></div>
      <span style="margin-left:5px">Low</span>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgb(65,171,93);"></div>
      <span style="margin-left: 5px;">High</span>
    </div>
	<div style="display: flex; align-items: center;">
      <div style="width: 20px; height: 20px; background: rgb(0,109,44);"></div>
      <span style="margin-left: 5px;">Very High</span>
    </div>
	`;
}

// Listen for changes on the time filter checkbox to enable/disable the slider.
document.getElementById("filter-time-checkbox").addEventListener("change", (e) => {
	const slider = document.getElementById("time-slider");
	const timeValueSpan = document.getElementById("time-value");
	if (e.target.checked) {
		slider.disabled = false;
		timeValueSpan.textContent = slider.value;
	} else {
		slider.disabled = true;
		timeValueSpan.textContent = "All";
		// When disabled, reset to show all features on both sources.
		const resetGeojson = {
			type: "FeatureCollection",
			features: allFeatures,
		};
		if (map.getSource("crash-data-heatmap")) {
			map.getSource("crash-data-heatmap").setData(resetGeojson);
		}
		if (map.getSource("crash-data-markers")) {
			map.getSource("crash-data-markers").setData(resetGeojson);
		}
	}
});

// Listen for changes on the time slider to filter data.
// Now updates both sources.
document.getElementById("time-slider").addEventListener("input", (e) => {
	const selectedHour = Number(e.target.value);
	document.getElementById("time-value").textContent = selectedHour;
	console.log("Filtering by hour:", selectedHour);
	if (!document.getElementById("filter-time-checkbox").checked) return;
	const filteredGeojson = filterFeaturesByTime(selectedHour);
	if (map.getSource("crash-data-heatmap")) {
		map.getSource("crash-data-heatmap").setData(filteredGeojson);
	}
	if (map.getSource("crash-data-markers")) {
		map.getSource("crash-data-markers").setData(filteredGeojson);
	}
});

// Listen for changes on the layer mode selector.
document.getElementById("layer-mode").addEventListener("change", (e) => {
	const mode = e.target.value;
	console.log("Layer mode:", mode);
	if (mode === "heatmap") {
		// Show heatmap only.
		map.setLayoutProperty("crash-heat", "visibility", "visible");
		map.setLayoutProperty("clusters", "visibility", "none");
		map.setLayoutProperty("cluster-count", "visibility", "none");
		map.setLayoutProperty("unclustered-point", "visibility", "none");
	} else if (mode === "markers") {
		// Show markers only.
		map.setLayoutProperty("crash-heat", "visibility", "none");
		map.setLayoutProperty("clusters", "visibility", "visible");
		map.setLayoutProperty("cluster-count", "visibility", "visible");
		map.setLayoutProperty("unclustered-point", "visibility", "visible");
	} else if (mode === "combined") {
		// Show both layers.
		map.setLayoutProperty("crash-heat", "visibility", "visible");
		map.setLayoutProperty("clusters", "visibility", "visible");
		map.setLayoutProperty("cluster-count", "visibility", "visible");
		map.setLayoutProperty("unclustered-point", "visibility", "visible");
	}
});

// --- Enhanced Cluster Hover Interactivity ---
// Create a reusable popup for cluster hover.
let clusterPopup = new mapboxgl.Popup({
	closeButton: false,
	closeOnClick: false,
});

// When hovering over clusters, show a popup with aggregated info.
map.on("mouseenter", "clusters", (e) => {
	map.getCanvas().style.cursor = "pointer";
	const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
	if (!features.length) return;
	const cluster = features[0];
	const clusterId = cluster.properties.cluster_id;
	// Use getClusterLeaves to fetch underlying features (up to 100000).
	map.getSource("crash-data-markers").getClusterLeaves(clusterId, 100000, 0, (err, leaves) => {
		if (err) {
			console.error("Error getting cluster leaves:", err);
			return;
		}
		// Compute aggregated values.
		const accidentCount = leaves.length;
		const totalFatalities = leaves.reduce((sum, leaf) => sum + leaf.properties.fatalities, 0);
		// For drunk driving: count an accident as 1 if drunk > 0, else 0.
		const drunkCount = leaves.reduce((sum, leaf) => sum + (leaf.properties.drunk > 0 ? 1 : 0), 0);
		const drunkPercentage = accidentCount ? Math.round((drunkCount / accidentCount) * 100) : 0;

		// Compute the most common weather condition.
		const weatherFreq = {};
		leaves.forEach((leaf) => {
			const w = leaf.properties.weather;
			if (w) {
				if (weatherFreq[w]) {
					weatherFreq[w] += 1;
				} else {
					weatherFreq[w] = 1;
				}
			}
		});
		const mostCommonWeather = Object.keys(weatherFreq).reduce(
			(a, b) => (weatherFreq[a] >= weatherFreq[b] ? a : b),
			"Unknown"
		);

		// Compute most common city, county, and state.
		const computeMode = (arr) => {
			const freq = {};
			arr.forEach((item) => {
				if (item && item !== "Not Applicable") {
					if (freq[item]) {
						freq[item] += 1;
					} else {
						freq[item] = 1;
					}
				}
			});
			const mode = Object.keys(freq).reduce((a, b) => (freq[a] >= freq[b] ? a : b), "");
			return mode || "Not Applicable";
		};

		const mostCommonCity = computeMode(leaves.map((leaf) => leaf.properties.city));
		const mostCommonCounty = computeMode(leaves.map((leaf) => leaf.properties.county));
		const mostCommonState = computeMode(leaves.map((leaf) => leaf.properties.state));

		// Format location info: only include fields that are not "Not Applicable".
		const locs = [];
		if (mostCommonCounty !== "Not Applicable") locs.push(mostCommonCounty);
		if (mostCommonState !== "Not Applicable") locs.push(mostCommonState);
		const locationText = locs.length ? locs.join(", ") : "Unknown";

		// Create the popup content.
		const popupContent = `
		<div style="
			font-family: 'Roboto', sans-serif;
			font-size: 13px;
			line-height: 1.3;
			background: #2a2a2a;
			color: #ecf0f1;
			padding: 8px;
			border-radius: 8px;
		  ">
		  <strong style="color:#1abc9c;">${accidentCount} Accidents</strong><br>
		  <span>Total Fatalities: ${totalFatalities}</span><br>
		  <span>Percentage of Accidents involving Drunk Driving: ${drunkPercentage}%</span><br>
		  <span>Most Common Weather Condition: ${mostCommonWeather}</span><br>
		  <span>Most Common County: ${mostCommonCounty}</span><br>
		  <span>Most Common State: ${mostCommonState}<span>
		</div>`;

		clusterPopup.setLngLat(cluster.geometry.coordinates).setHTML(popupContent).addTo(map);
	});
});

map.on("mouseleave", "clusters", () => {
	map.getCanvas().style.cursor = "";
	clusterPopup.remove();
});

// remove popup info on zoom so new resized cluster's info is shown
map.on("zoom", () => {
	clusterPopup.remove();
});

/**
 * ========================================================
 *  SMART YEAR-BY-YEAR CACHING & FETCH SYSTEM
 * ========================================================
 *  This replaces the old "fetch once per range" logic.
 *  - Each (dataset, state, year) combination is cached separately.
 *  - When user requests a range (e.g., 2013–2018),
 *    the system checks which years exist in cache and
 *    only fetches missing years from the API.
 *  - All yearly data are merged before visualization.
 */

// Helper: Create a unique cache key per dataset/state/year
function buildYearKey(dataset, state, year1, year2) {
	return `${dataset}_${state || "ALL"}_${year1}_${year2}`;
}

// Fetch a single year's data from cache or API
async function fetchSingleYearData(dataset, state, year1, year2) {
	const key = buildYearKey(dataset, state, year1, year2);

	// Try getting from cache first
	let data = await getFromCache(key);
	if (data) {
		console.log(`Loaded from cache: ${key}`);
		return data;
	}

	// Otherwise, fetch from API
	let apiUrl = `https://cors-anywhere.herokuapp.com/https://crashviewer.nhtsa.dot.gov/CrashAPI/FARSData/GetFARSData?dataset=${dataset}&FromYear=${year1}&ToYear=${year2}`;
	if (dataset !== "Drugs" && state) apiUrl += `&State=${state}`;
	else apiUrl += "&State=";
	apiUrl += "&format=json";

	console.log("Fetching year:", year1, "→", apiUrl);

	const response = await fetch(apiUrl);
	if (!response.ok) throw new Error(`Failed for ${year1}: ${response.statusText}`);

	const resObj = await response.json();
	const results = resObj.Results[0];

	// Cache the result
	await saveToCache(key, results);
	console.log(`Cached new data for: ${key}`);

	return results;
}

// Fetch across a range of years, combining cached + fetched data
async function fetchYearRangeData(dataset, state, fromYear, toYear) {
	let start = parseInt(fromYear);
	let end = parseInt(toYear);

	// --- Validation Layer ---
	// Enforce valid data range (2010–2020)
	if (isNaN(start) || isNaN(end)) throw new Error("Invalid year input.");
	if (start < 2010) start = 2010;
	if (end > 2020) end = 2020;

	// Ensure valid range (must be at least 1 year apart)
	if (start === end) {
		console.warn(`Adjusted same-year request ${start} → ${start + 1}`);
		end = start + 1;
	}

	// --- Chunked Fetch Logic ---
	const allData = [];
	for (let y = start; y < end; y++) {
		try {
			const yearlyData = await fetchSingleYearData(dataset, state, y, y + 1);
			if (Array.isArray(yearlyData)) allData.push(...yearlyData);
			else console.warn(`Unexpected data format for year ${y}`);
		} catch (err) {
			console.error(`Error fetching ${y}:`, err);
		}
	}

	console.log(`Combined data for ${start}–${end}:`, allData.length, "records total");
	return allData;
}

// Fetch data.
document.getElementById("fetch-data").addEventListener("click", async () => {
	const loadingMessage = document.getElementById("loading-message");
	loadingMessage.style.display = "block";

	// Get filter values
	const stateSelect = document.getElementById("select-state").value;
	const startYear = document.getElementById("select-start-year").value;
	const endYear = document.getElementById("select-end-year").value;
	const selectedDataset = datasetSelector.value;

	try {
		// Fetch all needed years intelligently
		const combinedData = await fetchYearRangeData(selectedDataset, stateSelect, startYear, endYear);

		// Then process it as usual
		if (selectedDataset === "Accident") {
			await handleAccidentData(combinedData);
		} else if (selectedDataset === "Drugs") {
			await handleDrugsData(combinedData);
		}
	} catch (error) {
		console.error("Error fetching or processing data:", error);
		alert("An error occurred while fetching data. Please try again later.");
	} finally {
		loadingMessage.style.display = "none";
	}
});

async function handleAccidentData(records) {
	// Convert fetched data to GeoJSON.
	const features = records
		.filter((record) => {
			const lat = parseFloat(record.LATITUDE);
			const lng = parseFloat(record.LONGITUD);
			if (isNaN(lat) || isNaN(lng)) return false;
			if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
			return true;
		})
		.map((record) => ({
			type: "Feature",
			properties: {
				fatalities: record.FATALS ? Number(record.FATALS) : 1,
				originalHour: record.HOUR ? Number(record.HOUR) : -1,
				city: record.CITYNAME && record.CITYNAME !== "NOT APPLICABLE" ? record.CITYNAME : null,
				county: record.COUNTYNAME && record.COUNTYNAME !== "NOT APPLICABLE" ? record.COUNTYNAME : null,
				state: record.STATENAME || null,
				drunk: record.DRUNK_DR ? Number(record.DRUNK_DR) : 0,
				weather: record.WEATHER1NAME || null,
			},
			geometry: {
				type: "Point",
				coordinates: [parseFloat(record.LONGITUD), parseFloat(record.LATITUDE)],
			},
		}));

	const geojsonData = {
		type: "FeatureCollection",
		features,
	};
	console.log("Generated GeoJSON:", geojsonData);

	allFeatures = features;

	// the heatmap source .
	if (map.getSource("crash-data-heatmap")) {
		map.getSource("crash-data-heatmap").setData(geojsonData);
	} else {
		map.addSource("crash-data-heatmap", {
			type: "geojson",
			data: geojsonData,
			cluster: false,
		});
		map.addLayer({
			id: "crash-heat",
			type: "heatmap",
			source: "crash-data-heatmap",
			maxzoom: 9,
			paint: {
				"heatmap-weight": ["interpolate", ["linear"], ["get", "fatalities"], 0, 0, 5, 1],
				"heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
				"heatmap-color": [
					"interpolate",
					["linear"],
					["heatmap-density"],
					0,
					"rgba(33,102,172,0)",
					0.2,
					"rgb(103,169,207)",
					0.4,
					"rgb(209,229,240)",
					0.6,
					"rgb(253,219,199)",
					0.8,
					"rgb(239,138,98)",
					1,
					"rgb(178,24,43)",
				],
				"heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 9, 20],
				"heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 1, 9, 0],
			},
		});
	}

	// the markers+clusters source.
	if (map.getSource("crash-data-markers")) {
		map.getSource("crash-data-markers").setData(geojsonData);
	} else {
		map.addSource("crash-data-markers", {
			type: "geojson",
			data: geojsonData,
			cluster: true,
			clusterMaxZoom: 14,
			clusterRadius: 50,
		});

		map.addLayer({
			id: "clusters",
			type: "circle",
			source: "crash-data-markers",
			filter: ["has", "point_count"],
			paint: {
				"circle-color": [
					"step",
					["get", "point_count"],
					"rgb(103,169,207)",
					10,
					"rgb(209,229,240)",
					30,
					"rgb(253,219,199)",
				],
				"circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 30, 25],
			},
		});

		// add count to clusters+marker layer
		map.addLayer({
			id: "cluster-count",
			type: "symbol",
			source: "crash-data-markers",
			filter: ["has", "point_count"],
			layout: {
				"text-field": "{point_count_abbreviated}",
				"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
				"text-size": 12,
			},
			paint: {
				"text-color": "#000",
			},
		});

		map.addLayer({
			id: "unclustered-point",
			type: "circle",
			source: "crash-data-markers",
			filter: ["!", ["has", "point_count"]],
			paint: {
				"circle-color": "rgb(178,24,43)",
				"circle-radius": 5,
				"circle-stroke-width": 1,
				"circle-stroke-color": "#fff",
			},
		});
	}

	// adjust the map view to fit the data bounds.
	if (allFeatures.length > 0) {
		const lats = allFeatures.map((f) => f.geometry.coordinates[1]);
		const lngs = allFeatures.map((f) => f.geometry.coordinates[0]);
		const bounds = [
			[Math.min(...lngs), Math.min(...lats)],
			[Math.max(...lngs), Math.max(...lats)],
		];
		map.fitBounds(bounds, { padding: 20 });
	}

	updateLegendForAccident();
}

async function handleDrugsData(records) {
	// aggregate by state
	const stats = {};
	records.forEach((r) => {
		const name = r.STATENAME;
		if (!stats[name]) {
			stats[name] = { total: 0, tests: 0, positive: 0 };
		}
		stats[name].total++;
		// DRUGRES = "0" --> Test Not Given
		if (r.DRUGRES !== "0") {
			stats[name].tests++;
			// DRUGRES = "1" --> Tested, No Drugs Found/Negative
			if (r.DRUGRES !== "1") {
				stats[name].positive++; // DRUGRES != "0" or "1" --> Some Positively Identified Drug
			}
		}
	});

	// load states geo once
	if (!stateGeoJSON) {
		stateGeoJSON = await fetch(statesGeojsonUrl).then((r) => r.json());
	}

	// inject properties
	stateGeoJSON.features.forEach((f) => {
		const name = f.properties.name;
		const totalAcc = stats[name] ? stats[name].total : 0;
		const pos = stats[name] ? stats[name].positive : 0;
		const tests = stats[name] ? stats[name].tests : 0;
		f.properties.totalAccidents = totalAcc;
		f.properties.totalTests = tests;
		f.properties.positiveDrugTests = pos;
		f.properties.positivesPerTests = tests ? Math.round((pos / tests) * 100) : 0;
		f.properties.positivePercentage = totalAcc ? Math.round((pos / totalAcc) * 100) : 0;
		f.properties.positivesPerThousand = totalAcc ? Math.round((pos / totalAcc) * 1000) : 0;
	});

	// the state-level choropleth source.
	if (map.getSource("drug-choropleth")) {
		map.getSource("drug-choropleth").setData(stateGeoJSON);
	} else {
		map.addSource("drug-choropleth", { type: "geojson", data: stateGeoJSON });
		map.addLayer({
			id: "drug-choropleth",
			type: "fill",
			source: "drug-choropleth",
			paint: {
				"fill-color": [
					"interpolate",
					["linear"],
					["get", "positivePercentage"],
					0,
					"rgba(217,240,203,0)",
					5,
					"rgb(199,233,192)",
					10,
					"rgb(161,217,155)",
					15,
					"rgb(116,196,118)",
					20,
					"rgb(65,171,93)",
					25,
					"rgb(0,109,44)",
				],
				"fill-opacity": 0.8,
			},
		});
		map.addLayer({
			id: "drug-borders",
			type: "line",
			source: "drug-choropleth",
			paint: { "line-color": "#fff", "line-width": 1 },
		});

		const popup = new mapboxgl.Popup({
			closeButton: false,
			closeOnClick: false,
		});
		map.on("mousemove", "drug-choropleth", (e) => {
			map.getCanvas().style.cursor = "pointer";
			const p = e.features[0].properties;
			const html = `
		  <div style="
			font-family: 'Roboto', sans-serif;
            font-size: 13px;
            line-height: 1.3;
            background: #2a2a2a;
            color: #ecf0f1;
            padding: 8px;
            border-radius: 8px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
		  ">
			<strong style="color:#1abc9c;">${p.name}</strong><br>
			<span>Total Accidents: ${p.totalAccidents}</span><br>
			<span>Drug Tests Found Positive(%): ${p.positivesPerTests}</span><br>
			<span>Drug-Positive Accidents (per 1,000): ${p.positivesPerThousand}</span>
		  </div>`;
			popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
		});
		map.on("mouseleave", "drug-choropleth", () => {
			map.getCanvas().style.cursor = "";
			popup.remove();
		});
	}

	map.flyTo({
		center: [-96, 37.8],
		zoom: 4,
		speed: 1.0, // default is 1.2—slower means smoother
		curve: 1.2,
	});

	updateLegendForDrugs();
}
