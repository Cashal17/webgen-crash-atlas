console.log("[Navigation] Loaded navigation.js ✅");

// DOM refs
const navControls = document.getElementById("nav-controls");
const navStart = document.getElementById("nav-start");
const navEnd = document.getElementById("nav-end");
const navSafeToggle = document.getElementById("nav-prefer-safer");
const navRouteBtn = document.getElementById("nav-route-go");
const navDetails = document.getElementById("nav-details");

// Mapbox Directions Client
const directionsClient = "https://api.mapbox.com/directions/v5/mapbox/driving/";
const mapboxToken = mapboxgl.accessToken;

// Route layer ID
const NAV_ROUTE_ID = "nav-route";

let startCoords = null;
let endCoords = null;

document.getElementById("nav-back").addEventListener("click", () => {
	disableNavigationMode();
});

/** Enable Navigation Mode */
function enableNavigationMode() {
	console.log("[Navigation] ENABLE");

	// Hide original filters
	document.getElementById("filter-controls").style.display = "none";
	document.getElementById("time-filter-controls").style.display = "none";
	document.getElementById("time-slider-container").style.display = "none";
	document.getElementById("layer-mode-container").style.display = "none";

	// Show navigation UI
	document.getElementById("nav-controls").style.display = "flex";

	// enable autocomplete listeners
	document.getElementById("nav-start").addEventListener("input", (e) => {
		autocomplete(e.target.value, "start-suggestions");
	});

	document.getElementById("nav-end").addEventListener("input", (e) => {
		autocomplete(e.target.value, "end-suggestions");
	});
}

/** Disable Navigation Mode */
function disableNavigationMode() {
	console.log("[Navigation] DISABLE");

	// Hide nav UI
	document.getElementById("nav-controls").style.display = "none";

	// Restore original controls
	document.getElementById("filter-controls").style.display = "flex";
	document.getElementById("time-filter-controls").style.display = "flex";
	document.getElementById("time-slider-container").style.display = "flex";
	document.getElementById("layer-mode-container").style.display = "flex";
}

async function autocomplete(query, listId) {
	if (!query) {
		document.getElementById(listId).innerHTML = "";
		return;
	}

	const res = await fetch(
		`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
			query
		)}.json?autocomplete=true&types=address,poi,place&country=US&limit=5&access_token=${mapboxgl.accessToken}`
	);

	const data = await res.json();
	const ul = document.getElementById(listId);
	ul.innerHTML = "";

	data.features.forEach((feature) => {
		const li = document.createElement("li");
		li.textContent = feature.place_name;
		li.addEventListener("click", () => {
			document.getElementById(listId === "start-suggestions" ? "nav-start" : "nav-end").value =
				feature.place_name;

			if (listId === "start-suggestions") startCoords = feature.center;
			else endCoords = feature.center;

			ul.innerHTML = "";
		});
		ul.appendChild(li);
	});
}

/** Fetch a driving route from the Directions API (robust version) */
async function getRoute(startLngLat, endLngLat) {
	console.group("[Directions] Request");

	// 1) Validate input shape
	if (!Array.isArray(startLngLat) || !Array.isArray(endLngLat)) {
		console.error("[Error] start/end are not arrays!", { startLngLat, endLngLat });
		alert("Routing failed: invalid coordinates.");
		console.groupEnd();
		return null;
	}

	// 2) Validate numeric values
	const nums = [...startLngLat, ...endLngLat];
	if (nums.some((n) => typeof n !== "number" || isNaN(n))) {
		console.error("[Error] Coordinates contain non-numeric values.", nums);
		alert("Routing failed: malformed coordinates.");
		console.groupEnd();
		return null;
	}

	// 3) Prevent routing same place → same place
	if (startLngLat[0] === endLngLat[0] && startLngLat[1] === endLngLat[1]) {
		console.warn("[Warning] Start and destination identical.");
		alert("Start and destination are the same.");
		console.groupEnd();
		return null;
	}

	// Construct URL
	const url =
		`${directionsClient}` +
		`${startLngLat[0]},${startLngLat[1]};${endLngLat[0]},${endLngLat[1]}` +
		`?steps=true&geometries=geojson&overview=full&access_token=${mapboxToken}`;

	console.log("URL:", url);

	try {
		const res = await fetch(url);

		// 4) HTTP error?
		if (!res.ok) {
			console.error("[HTTP Error]", res.status, res.statusText);

			if (res.status === 422) {
				alert("Unprocessable route: try a closer address or select from suggestions.");
			} else {
				alert("Directions server error. Try again later.");
			}

			console.groupEnd();
			return null;
		}

		const json = await res.json();

		// 5) Check structure
		if (!json.routes || json.routes.length === 0) {
			console.warn("[Directions] No routes returned.", json);
			alert("No route available for that selection.");
			console.groupEnd();
			return null;
		}

		const route = json.routes[0];

		// 6) Validate geometry
		if (!route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length === 0) {
			console.warn("[Directions] Missing geometry");
			alert("Route returned without geometry.");
			console.groupEnd();
			return null;
		}

		console.log("[Directions] Success ✅", route);
		console.groupEnd();
		return route;
	} catch (err) {
		// 7) Network or parsing failure
		console.error("[Directions] Fetch failed:", err);
		alert("Network error while requesting directions.");
		console.groupEnd();
		return null;
	}
}

/** Render route on the map */
function drawRoute(route) {
	const geojson = {
		type: "Feature",
		geometry: route.geometry,
	};

	if (map.getSource(NAV_ROUTE_ID)) {
		map.getSource(NAV_ROUTE_ID).setData(geojson);
	} else {
		map.addSource(NAV_ROUTE_ID, { type: "geojson", data: geojson });
		map.addLayer({
			id: NAV_ROUTE_ID,
			type: "line",
			source: NAV_ROUTE_ID,
			paint: {
				"line-color": "#3bb2d0",
				"line-width": 6,
			},
		});
	}
}

/** Parse text to Location using Mapbox Geocoding */
async function geocode(query) {
	if (!query || query.trim().length < 3) {
		console.warn("[Geocode] Empty or too short input");
		return null;
	}

	const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
		query
	)}.json?types=address,poi,place,locality&limit=3&access_token=${mapboxToken}`;

	try {
		const res = await fetch(url);
		const json = await res.json();

		if (!json.features || json.features.length === 0) {
			console.warn("[Geocode] No candidates found");
			return null;
		}

		// Pick best-scoring candidate
		const best = json.features.sort((a, b) => b.relevance - a.relevance)[0];
		console.log("[Geocode] Best match:", best.place_name);

		return {
			coords: best.center,
			label: best.place_name,
		};
	} catch (err) {
		console.error("[Geocode] Failed:", err);
		return null;
	}
}

/** Handle "Get Route" click */
navRouteBtn.addEventListener("click", async () => {
	const start = await geocode(navStart.value);
	const end = await geocode(navEnd.value);

	if (!start || !end) {
		alert("Invalid start or end location!");
		return;
	}

	navDetails.innerHTML = "Calculating route…";

	const route = await getRoute(start.coords, end.coords);
	if (!route) return;

	drawRoute(route);
	showRouteSummary(route, start.label, end.label);
});

/** Display time + distance summary */
function showRouteSummary(route, startLabel, endLabel) {
	const mins = Math.round(route.duration / 60);
	const mi = (route.distance / 1609.34).toFixed(1);

	navDetails.innerHTML = `
        <p><strong>From:</strong> ${startLabel}</p>
        <p><strong>To:</strong> ${endLabel}</p>
        <p><strong>Duration:</strong> ${mins} min</p>
        <p><strong>Distance:</strong> ${mi} miles</p>
        <p><em>Safer route preference:</em> ${navSafeToggle.checked}</p>
    `;
}
