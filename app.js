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

// Add a legend for the heatmap color ramp.
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
	map.getContainer().appendChild(legend);
}
map.on("load", addLegend);

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
		  <span>Most Common County: ${mostCommonCounty}</span>
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

// Fetch data and create both sources.
document.getElementById("fetch-data").addEventListener("click", async () => {
	const loadingMessage = document.getElementById("loading-message");
	loadingMessage.style.display = "block";

	// Get filter values
	const stateSelect = document.getElementById("select-state").value;
	const startYear = document.getElementById("select-start-year").value;
	const endYear = document.getElementById("select-end-year").value;
	const datasetSelect = document.getElementById("dataset-selector").value;

	// Build the API URL.
	let apiUrl =
		"https://cors-anywhere.herokuapp.com/https://crashviewer.nhtsa.dot.gov/CrashAPI/FARSData/GetFARSData?dataset=Accident";
	if (startYear) {
		apiUrl += `&FromYear=${startYear}`;
	}
	if (endYear) {
		apiUrl += `&ToYear=${endYear}`;
	}
	if (stateSelect) {
		apiUrl += `&State=${stateSelect}`;
	} else {
		apiUrl += `&State=`;
	}
	apiUrl += "&format=json";
	apiUrl = apiUrl.replace("dataset=Accident", `dataset=${datasetSelect}`);

	console.log("Requesting:", apiUrl);
	try {
		const response = await fetch(apiUrl);
		if (!response.ok) {
			throw new Error("Network response was not ok");
		}
		const resObj = await response.json();
		const data = resObj.Results[0];
		console.log("Fetched data:", data);
		// Convert fetched data to GeoJSON.
		const features = data
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
					city: record.CITYNAME || "Not Applicable",
					county: record.COUNTYNAME || "Not Applicable",
					state: record.STATENAME || "Not Applicable",
					drunk: record.DRUNK_DR ? Number(record.DRUNK_DR) : 0,
					weather: record.WEATHER1NAME || "Unknown",
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
				clusterProperties: {
					// sum of fatalities across current cluster of features
					totalFatalities: ["+", ["get", "fatalities"]],
				},
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

		// after fetching --> check layer visibility matches current mode.
		const currentMode = document.getElementById("layer-mode").value;
		if (currentMode === "heatmap") {
			map.setLayoutProperty("crash-heat", "visibility", "visible");
			map.setLayoutProperty("clusters", "visibility", "none");
			map.setLayoutProperty("cluster-count", "visibility", "none");
			map.setLayoutProperty("unclustered-point", "visibility", "none");
		} else if (currentMode === "markers") {
			map.setLayoutProperty("crash-heat", "visibility", "none");
			map.setLayoutProperty("clusters", "visibility", "visible");
			map.setLayoutProperty("cluster-count", "visibility", "visible");
			map.setLayoutProperty("unclustered-point", "visibility", "visible");
		} else if (currentMode === "combined") {
			map.setLayoutProperty("crash-heat", "visibility", "visible");
			map.setLayoutProperty("clusters", "visibility", "visible");
			map.setLayoutProperty("cluster-count", "visibility", "visible");
			map.setLayoutProperty("unclustered-point", "visibility", "visible");
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
	} catch (error) {
		console.error("Error fetching or processing data:", error);
		alert("An error occurred while fetching data. Please try again later.");
	} finally {
		document.getElementById("loading-message").style.display = "none";
	}
});
