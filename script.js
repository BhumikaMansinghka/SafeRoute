// ─── GLOBAL STATE ───────────────────────────────
let map;
let currentRoute = null;
let isNavigating = false;
let navigationWatchId = null;
let userMarker = null;
let currentRouteCoordinates = [];
let currentStepIndex = 0;
let routeSteps = [];
let dangerousZonesOnRoute = [];
let dangerWarningsShown = [];
let allRoutes = [];
let selectedRouteIndex = 0;

// Recent news about unsafe areas
let recentNewsAlerts = [
  {
    lat: 28.6139,
    lng: 77.2090,
    title: "MG Road Incident",
    description: "Multiple reports of street harassment after 8 PM",
    severity: "high",
    date: "Today",
    newsSource: "Local News"
  },
  {
    lat: 28.6300,
    lng: 77.2300,
    title: "Road Closure Alert",
    description: "Construction work causing traffic chaos",
    severity: "medium",
    date: "Today",
    newsSource: "Traffic Alert"
  },
  {
    lat: 12.9352,
    lng: 77.6245,
    title: "Late Night Attacks",
    description: "Police patrol increased in this area",
    severity: "high",
    date: "2 days ago",
    newsSource: "Police Report"
  },
  {
    lat: 19.0596,
    lng: 72.8295,
    title: "Well-Lit Commercial Area",
    description: "Safe area with heavy foot traffic",
    severity: "safe",
    date: "Recent",
    newsSource: "Community Feedback"
  }
];

let communityReports = [
  {
    lat: 28.6139,
    lng: 77.2090,
    type: "Poor lighting",
    place: "MG Road, Delhi",
    time: "2h ago",
    severity: "high"
  },

  {
    lat: 12.9352,
    lng: 77.6245,
    type: "Isolated area",
    place: "Koramangala, Bangalore",
    time: "5h ago",
    severity: "medium"
  },

  {
    lat: 19.0596,
    lng: 72.8295,
    type: "Well lit area ✓",
    place: "Bandra West, Mumbai",
    time: "1d ago",
    severity: "safe"
  }
];

// ─── INIT MAP ───────────────────────────────────

function initMap(){

  map = L.map('map').setView([20.5937,78.9629],5);

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution:'© OpenStreetMap'
    }
  ).addTo(map);

  plotCommunityReports();

  if(navigator.geolocation){

    navigator.geolocation.getCurrentPosition(

      function(pos){

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        map.setView([lat,lng],13);

        L.marker([lat,lng])
          .addTo(map)
          .bindPopup("You are here")
          .openPopup();
      }

    );
  }
}

window.onload = initMap;

// ─── FIND ROUTE ─────────────────────────────────

function findSafeRoute(){

  const origin =
    document.getElementById("origin").value;

  const destination =
    document.getElementById("destination").value;

  if(origin === "" || destination === ""){

    showToast("Enter both locations");
    return;
  }

  document
    .getElementById("btn-text")
    .classList
    .add("hidden");

  document
    .getElementById("spinner")
    .classList
    .remove("hidden");

  // Geocode origin
  geocodeAddress(origin).then(originCoords => {
    if (!originCoords) {
      showToast("Could not find origin location");
      resetButton();
      return;
    }

    // Geocode destination
    geocodeAddress(destination).then(destCoords => {
      if (!destCoords) {
        showToast("Could not find destination location");
        resetButton();
        return;
      }

      // Get actual route
      getActualRoute(originCoords, destCoords, origin, destination);
    });
  });
}

function resetButton(){
  document
    .getElementById("btn-text")
    .classList
    .remove("hidden");

  document
    .getElementById("spinner")
    .classList
    .add("hidden");
}

// ─── GEOCODE ADDRESS ────────────────────────────

function geocodeAddress(address){
  return fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`)
    .then(res => res.json())
    .then(data => {
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
      return null;
    })
    .catch(err => {
      console.error("Geocoding error:", err);
      return null;
    });
}

// ─── GET ACTUAL ROUTE ───────────────────────────

function getActualRoute(originCoords, destCoords, originName, destName){
  // Request multiple alternative routes
  const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?steps=true&geometries=geojson&overview=full&annotations=distance,duration&alternatives=true`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.routes && data.routes.length > 0) {
        // Store all routes
        allRoutes = data.routes;
        
        // Analyze safety of each route
        const routeSafetyScores = allRoutes.map((route, index) => ({
          index: index,
          route: route,
          safetyScore: calculateRouteSafetyScore(route),
          dangerZones: getDangerZonesOnRoute(route)
        }));

        // Sort by safety score (highest = safest)
        routeSafetyScores.sort((a, b) => b.safetyScore - a.safetyScore);
        
        // Select safest route
        selectedRouteIndex = routeSafetyScores[0].index;
        const safestRoute = routeSafetyScores[0];
        
        resetButton();
        
        // Store route globally for navigation
        currentRoute = safestRoute.route;
        dangerousZonesOnRoute = safestRoute.dangerZones;
        
        // Draw route on map
        drawActualRoute(safestRoute.route);
        
        // Show route info
        showActualRouteInfo(safestRoute.route, originName, destName);
        
        // Show turn-by-turn directions
        showTurnByTurnDirections(safestRoute.route);
        
        // Calculate safety score
        calculateSafetyScore();
        
        // Show safety tips
        showSafetyTips();
        
        // Show route comparison and safest route badge
        showRouteComparisonAndSafetyAlert(routeSafetyScores, originName, destName);
        
        showToast("✅ Safest Route Selected");
      } else {
        showToast("Could not calculate route");
        resetButton();
      }
    })
    .catch(err => {
      console.error("Routing error:", err);
      showToast("Error calculating route");
      resetButton();
    });
}

// ─── CALCULATE ROUTE SAFETY SCORE ───────────────

function calculateRouteSafetyScore(route){
  let safetyScore = 100; // Start with perfect score
  const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
  const dangerThresholdKm = 0.5;

  // Check community reports
  communityReports.forEach(report => {
    if (report.severity === "safe") return;
    
    coordinates.forEach(coord => {
      const distKm = getDistance(coord[0], coord[1], report.lat, report.lng);
      if (distKm < dangerThresholdKm) {
        safetyScore -= report.severity === "high" ? 15 : 8;
      } else if (distKm < 1) {
        safetyScore -= report.severity === "high" ? 5 : 2;
      }
    });
  });

  // Check recent news alerts
  recentNewsAlerts.forEach(alert => {
    if (alert.severity === "safe") return;
    
    coordinates.forEach(coord => {
      const distKm = getDistance(coord[0], coord[1], alert.lat, alert.lng);
      if (distKm < dangerThresholdKm) {
        safetyScore -= alert.severity === "high" ? 20 : 10;
      } else if (distKm < 1) {
        safetyScore -= alert.severity === "high" ? 8 : 4;
      }
    });
  });

  return Math.max(safetyScore, 0);
}

// ─── GET DANGER ZONES ON ROUTE ──────────────────

function getDangerZonesOnRoute(route){
  const zones = [];
  const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
  const dangerThresholdKm = 0.5;

  // Check community reports
  communityReports.forEach(report => {
    if (report.severity === "safe") return;
    
    coordinates.forEach((coord, index) => {
      const distKm = getDistance(coord[0], coord[1], report.lat, report.lng);
      if (distKm < dangerThresholdKm) {
        zones.push({
          lat: report.lat,
          lng: report.lng,
          type: report.type,
          place: report.place,
          severity: report.severity,
          source: "Community Report"
        });
      }
    });
  });

  // Check recent news
  recentNewsAlerts.forEach(alert => {
    if (alert.severity === "safe") return;
    
    coordinates.forEach((coord, index) => {
      const distKm = getDistance(coord[0], coord[1], alert.lat, alert.lng);
      if (distKm < dangerThresholdKm) {
        zones.push({
          lat: alert.lat,
          lng: alert.lng,
          type: alert.description,
          place: alert.title,
          severity: alert.severity,
          source: alert.newsSource
        });
      }
    });
  });

  // Remove duplicates
  return zones.filter((zone, index, self) => 
    index === self.findIndex(z => getDistance(z.lat, z.lng, zone.lat, zone.lng) < 0.1)
  );
}

// ─── SHOW ROUTE COMPARISON AND SAFETY ALERT ─────

function showRouteComparisonAndSafetyAlert(routeScores, originName, destName){
  // Create route comparison modal
  let comparisonHTML = '<div style="background: #e8f8f0; border-radius: 12px; padding: 12px; margin-bottom: 12px; border-left: 4px solid #52b788;">';
  comparisonHTML += '<div style="font-weight: 700; color: #52b788; margin-bottom: 8px;">✅ SAFEST ROUTE SELECTED</div>';
  comparisonHTML += '<div style="font-size: 0.85rem; color: #2d2d3a; line-height: 1.6;">';
  
  routeScores.slice(0, Math.min(3, routeScores.length)).forEach((route, idx) => {
    const badge = idx === 0 ? '🏆' : idx === 1 ? '2️⃣' : '3️⃣';
    const color = route.safetyScore >= 75 ? '#52b788' : route.safetyScore >= 50 ? '#f4a261' : '#ff4d6d';
    
    comparisonHTML += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(82, 183, 136, 0.2);">
        <div style="flex: 1;">
          <span style="font-weight: 600;">${badge} Route ${route.index + 1}</span>
          <span style="font-size: 0.75rem; color: #8b8b9a; margin-left: 8px;">
            ${(route.route.distance / 1000).toFixed(1)}km • ${Math.round(route.route.duration / 60)}min
          </span>
        </div>
        <div style="font-weight: 700; color: ${color}; font-size: 1.1rem;">
          ${route.safetyScore}/100
        </div>
      </div>
    `;
  });
  
  comparisonHTML += '</div></div>';
  
  // Insert comparison at top of safety card section
  const routeInfo = document.getElementById('route-info');
  if (routeInfo) {
    const comparisonDiv = document.createElement('div');
    comparisonDiv.innerHTML = comparisonHTML;
    comparisonDiv.id = 'route-comparison';
    routeInfo.insertAdjacentElement('beforebegin', comparisonDiv);
  }

  // Show toast with news alerts
  const newsAlertCount = recentNewsAlerts.filter(a => a.severity !== 'safe').length;
  if (newsAlertCount > 0) {
    showToast(`⚠️ ${newsAlertCount} recent news alerts in this area - Stay Safe!`);
  }
}

// ─── DRAW ACTUAL ROUTE ──────────────────────────

function drawActualRoute(route){
  // Clear previous routes
  if (window.currentRoute) {
    map.removeLayer(window.currentRoute);
  }

  const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

  window.currentRoute = L.polyline(coordinates, {
    color: '#ff4d6d',
    weight: 5,
    opacity: 0.8
  }).addTo(map);

  // Add origin marker
  L.marker([coordinates[0][0], coordinates[0][1]], {
    icon: L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iIzUyYjc4OCIvPjwvc3ZnPg==',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  }).addTo(map).bindPopup("Start");

  // Add destination marker
  const lastCoord = coordinates[coordinates.length - 1];
  L.marker([lastCoord[0], lastCoord[1]], {
    icon: L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iI2ZmNGQ2ZCIvPjwvc3ZnPg==',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  }).addTo(map).bindPopup("Destination");

  map.fitBounds(window.currentRoute.getBounds());
  
  // Find and mark dangerous zones on route
  identifyDangerousZones(route);
}

// ─── IDENTIFY DANGEROUS ZONES ON ROUTE ──────────

function identifyDangerousZones(route){
  dangerousZonesOnRoute = [];
  const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
  const dangerThresholdKm = 0.5; // 500 meters

  // Check each community report
  communityReports.forEach(report => {
    if (report.severity === "safe") return; // Skip safe areas

    // Check distance from each point on route
    coordinates.forEach((coord, index) => {
      const distKm = getDistance(coord[0], coord[1], report.lat, report.lng);
      
      if (distKm < dangerThresholdKm) {
        dangerousZonesOnRoute.push({
          lat: report.lat,
          lng: report.lng,
          type: report.type,
          place: report.place,
          severity: report.severity,
          nearestRouteIndex: index,
          distance: distKm
        });
      }
    });
  });

  // Remove duplicates (same area reported multiple times)
  dangerousZonesOnRoute = dangerousZonesOnRoute.filter((zone, index, self) => 
    index === self.findIndex(z => getDistance(z.lat, z.lng, zone.lat, zone.lng) < 0.1)
  );

  // Mark dangerous zones on map
  dangerousZonesOnRoute.forEach(zone => {
    const icon = zone.severity === "high" 
      ? '⚠️' 
      : '⚡';
    
    const color = zone.severity === "high" 
      ? '#ff4d6d' 
      : '#f4a261';

    L.marker([zone.lat, zone.lng], {
      icon: L.icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${color}"/><text x="16" y="20" font-size="18" text-anchor="middle" fill="white">${icon}</text></svg>`)}`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    }).addTo(map).bindPopup(`
      <b>⚠️ Dangerous Zone</b><br>
      ${zone.place}<br>
      ${zone.type}<br>
      <span style="color: ${color}; font-weight: 600;">${zone.severity === 'high' ? 'HIGH RISK' : 'CAUTION'}</span>
    `);
  });
}

// ─── SHOW ACTUAL ROUTE INFO ─────────────────────

function showActualRouteInfo(route, originName, destName){
  document
    .getElementById("route-info")
    .classList
    .remove("hidden");

  const distance = (route.distance / 1000).toFixed(1);
  const duration = Math.round(route.duration / 60);

  document
    .getElementById("duration-text")
    .innerText = `${duration} mins`;

  document
    .getElementById("distance-text")
    .innerText = `${distance} km`;

  document
    .getElementById("time-text")
    .innerText = "Best before 9 PM";
}

// ─── SHOW TURN-BY-TURN DIRECTIONS ───────────────

function showTurnByTurnDirections(route){
  const legs = route.legs;
  let directionsHTML = '<div style="font-size: 0.85rem; max-height: 300px; overflow-y: auto;">';
  
  let stepCounter = 1;
  
  legs.forEach((leg, legIndex) => {
    leg.steps.forEach((step, stepIndex) => {
      const instruction = step.maneuver.instruction || 'Continue';
      const distance = (step.distance / 1000).toFixed(2);
      const duration = Math.round(step.duration / 60);
      
      // Get step coordinates (approximate midpoint)
      const stepCoords = step.geometry.coordinates.map(c => [c[1], c[0]]);
      const stepLat = stepCoords[Math.floor(stepCoords.length / 2)][0];
      const stepLng = stepCoords[Math.floor(stepCoords.length / 2)][1];
      
      // Check for dangers near this step
      let stepDangerWarning = '';
      dangerousZonesOnRoute.forEach(zone => {
        const distToZone = getDistance(stepLat, stepLng, zone.lat, zone.lng);
        if (distToZone < 0.3) {
          stepDangerWarning = `<div style="background: ${zone.severity === 'high' ? '#fff0f3' : '#fff4e6'}; padding: 4px; margin-top: 4px; border-radius: 3px; font-size: 0.7rem; color: ${zone.severity === 'high' ? '#ff4d6d' : '#f4a261'}; font-weight: 600;">
            ⚠️ ${zone.severity === 'high' ? 'DANGER' : 'CAUTION'}: ${zone.place}
          </div>`;
        }
      });
      
      directionsHTML += `
        <div style="padding: 8px; border-bottom: 1px solid #eee; margin-bottom: 4px;">
          <div style="font-weight: 600; color: #ff4d6d;">Step ${stepCounter}</div>
          <div style="color: #2d2d3a;">${instruction}</div>
          <div style="font-size: 0.75rem; color: #8b8b9a;">${distance} km • ${duration} min</div>
          ${stepDangerWarning}
        </div>
      `;
      stepCounter++;
    });
  });
  
  directionsHTML += '</div>';
  
  // Create a directions panel
  if (window.directionsPanel) {
    map.removeControl(window.directionsPanel);
  }
  
  window.directionsPanel = L.control({position: 'bottomright'});
  
  window.directionsPanel.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'directions-panel');
    div.style.background = 'white';
    div.style.padding = '10px';
    div.style.borderRadius = '8px';
    div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    div.style.width = '280px';
    div.style.maxHeight = '350px';
    div.innerHTML = '<div style="font-weight: 700; margin-bottom: 10px; color: #ff4d6d;">📍 Directions</div>' + directionsHTML;
    return div;
  };
  
  window.directionsPanel.addTo(map);
}

// ─── LIVE NAVIGATION ────────────────────────────

function startNavigation(route){
  if (!navigator.geolocation) {
    showToast("Geolocation not available");
    return;
  }

  isNavigating = true;
  currentRouteCoordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
  routeSteps = [];
  currentStepIndex = 0;

  // Extract steps from route legs
  route.legs.forEach(leg => {
    leg.steps.forEach(step => {
      routeSteps.push(step);
    });
  });

  // Show navigation UI
  showNavigationUI(route);

  // Start watching position
  navigationWatchId = navigator.geolocation.watchPosition(
    updateUserPosition,
    handleLocationError,
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  );

  showToast("🧭 Navigation Started!");
}

function showNavigationUI(route){
  const distance = (route.distance / 1000).toFixed(1);
  const duration = Math.round(route.duration / 60);

  if (!window.navPanel) {
    window.navPanel = L.control({position: 'topleft'});
    window.navPanel.onAdd = function(map) {
      const div = L.DomUtil.create('div', 'nav-panel');
      div.id = 'nav-panel';
      div.style.background = 'white';
      div.style.padding = '12px';
      div.style.borderRadius = '8px';
      div.style.boxShadow = '0 2px 12px rgba(0,0,0,0.2)';
      div.style.width = '260px';
      div.style.zIndex = '1000';
      return div;
    };
    window.navPanel.addTo(map);
  }

  updateNavigationPanel();
}

function updateUserPosition(position){
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  // Remove old marker
  if (userMarker) {
    map.removeLayer(userMarker);
  }

  // Add user position marker with direction
  userMarker = L.marker([lat, lng], {
    icon: L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzMzYjVlNSIgZmlsbC1vcGFjaXR5PSIwLjMiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI4IiBmaWxsPSIjMzNiIi8+PC9zdmc+',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    })
  }).addTo(map).bindPopup(`You are here<br>Accuracy: ${accuracy.toFixed(0)}m`);

  // Update navigation panel
  updateNavigationPanel();

  // Check if reached destination
  const destCoords = currentRouteCoordinates[currentRouteCoordinates.length - 1];
  const distToEnd = getDistance(lat, lng, destCoords[0], destCoords[1]);

  if (distToEnd < 0.05) { // Within 50 meters
    endNavigation();
  }
}

function updateNavigationPanel(){
  const panel = document.getElementById('nav-panel');
  if (!panel) return;

  if (currentStepIndex < routeSteps.length) {
    const step = routeSteps[currentStepIndex];
    const instruction = step.maneuver.instruction || 'Continue';
    const distance = (step.distance / 1000).toFixed(2);
    const duration = Math.round(step.duration / 60);

    let nextInstruction = 'Arrive';
    if (currentStepIndex + 1 < routeSteps.length) {
      nextInstruction = routeSteps[currentStepIndex + 1].maneuver.instruction || 'Next turn';
    }

    // Check for nearby dangerous zones
    let dangerWarning = '';
    if (userMarker) {
      const userLat = userMarker._latlng.lat;
      const userLng = userMarker._latlng.lng;
      
      dangerousZonesOnRoute.forEach(zone => {
        const distToZone = getDistance(userLat, userLng, zone.lat, zone.lng);
        const zoneId = `${zone.lat}_${zone.lng}`;
        
        // Warn if within 200 meters and not already warned
        if (distToZone < 0.2 && !dangerWarningsShown.includes(zoneId)) {
          dangerWarningsShown.push(zoneId);
          showToast(`⚠️ DANGER AHEAD: ${zone.place} - ${zone.type}`);
        }
        
        // Show warning in panel if within 300 meters
        if (distToZone < 0.3) {
          const warningIcon = zone.severity === 'high' ? '⚠️' : '⚡';
          dangerWarning += `
            <div style="background: ${zone.severity === 'high' ? '#fff0f3' : '#fff4e6'}; border-left: 4px solid ${zone.severity === 'high' ? '#ff4d6d' : '#f4a261'}; padding: 8px; border-radius: 0 4px 4px 0; margin-bottom: 8px; margin-top: 8px;">
              <div style="font-weight: 600; color: ${zone.severity === 'high' ? '#ff4d6d' : '#f4a261'}; font-size: 0.85rem;">
                ${warningIcon} DANGER ZONE AHEAD
              </div>
              <div style="font-size: 0.75rem; color: #2d2d3a;">${zone.place}</div>
              <div style="font-size: 0.7rem; color: #8b8b9a;">${zone.type} • ${(distToZone * 1000).toFixed(0)}m away</div>
            </div>
          `;
        }
      });
    }

    panel.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 0.75rem; color: #8b8b9a; margin-bottom: 4px;">NEXT INSTRUCTION</div>
        <div style="font-size: 1.2rem; font-weight: 700; color: #ff4d6d; margin-bottom: 8px;">
          ${instruction}
        </div>
        <div style="display: flex; justify-content: space-around; margin-bottom: 8px;">
          <div>
            <div style="font-size: 0.75rem; color: #8b8b9a;">Distance</div>
            <div style="font-weight: 600; color: #2d2d3a;">${distance} km</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: #8b8b9a;">Time</div>
            <div style="font-weight: 600; color: #2d2d3a;">${duration} min</div>
          </div>
        </div>
        ${dangerWarning}
        <div style="font-size: 0.8rem; color: #52b788; padding: 6px; background: #e8f8f0; border-radius: 4px; margin-bottom: 8px;">
          📍 Step ${currentStepIndex + 1} of ${routeSteps.length}
        </div>
        <button onclick="endNavigation()" style="width: 100%; padding: 8px; background: #ff4d6d; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          End Navigation
        </button>
      </div>
    `;
  }
}

function handleLocationError(error){
  console.error('Location error:', error);
  if (error.code === 1) {
    showToast('Location permission denied');
  } else if (error.code === 2) {
    showToast('Location unavailable');
  }
}

function endNavigation(){
  isNavigating = false;
  
  if (navigationWatchId !== null) {
    navigator.geolocation.clearWatch(navigationWatchId);
    navigationWatchId = null;
  }

  if (userMarker) {
    map.removeLayer(userMarker);
    userMarker = null;
  }

  if (window.navPanel) {
    map.removeControl(window.navPanel);
    window.navPanel = null;
  }

  currentStepIndex = 0;
  dangerWarningsShown = []; // Reset danger warnings
  showToast('✅ Navigation Ended');
}

function getDistance(lat1, lng1, lat2, lng2){
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ─── SAFETY SCORE ───────────────────────────────

function calculateSafetyScore(){

  document
    .getElementById("safety-card")
    .classList
    .remove("hidden");

  let score =
    Math.floor(Math.random()*30)+70;

  animateScore(score);
}

function animateScore(score){

  const numEl =
    document.getElementById("score-num");

  const ringEl =
    document.getElementById("ring-fill");

  const statusEl =
    document.getElementById("safety-status");

  let current = 0;

  const step = score/40;

  const interval = setInterval(()=>{

    current =
      Math.min(current+step,score);

    numEl.textContent =
      Math.round(current);

    if(current >= score){

      clearInterval(interval);
    }

  },30);

  const circumference = 251.2;

  const offset =
    circumference -
    (score/100)*circumference;

  ringEl.style.strokeDashoffset =
    offset;

  if(score >= 75){

    ringEl.style.stroke = "#52b788";

    statusEl.textContent =
      "✓ Generally Safe";

    statusEl.className =
      "safety-status";
  }

  else if(score >= 50){

    ringEl.style.stroke = "#f4a261";

    statusEl.textContent =
      "⚠ Use Caution";

    statusEl.className =
      "safety-status warning";
  }

  else{

    ringEl.style.stroke = "#ff4d6d";

    statusEl.textContent =
      "⚠ High Risk";

    statusEl.className =
      "safety-status danger";
  }
}

// ─── SAFETY TIPS ────────────────────────────────

function showSafetyTips(){

  const tips = [

    "Share live location with trusted contacts.",

    "Avoid isolated shortcuts at night.",

    "Keep phone charged before travelling.",

    "Prefer crowded & well-lit roads."

  ];

  const tipsList =
    document.getElementById("tips-list");

  tipsList.innerHTML = tips.map(

    tip => `

      <div class="tip-item">

        ⚠ ${tip}

      </div>

    `

  ).join("");

  document
    .getElementById("tips-section")
    .classList
    .remove("hidden");
}

// ─── COMMUNITY REPORTS ──────────────────────────

function plotCommunityReports(){

  communityReports.forEach(report=>{

    let color =
      report.severity === "high"
      ? "#ff4d6d"
      : report.severity === "medium"
      ? "#f4a261"
      : "#52b788";

    L.circleMarker(

      [report.lat,report.lng],

      {
        radius:8,
        fillColor:color,
        color:"#fff",
        weight:2,
        fillOpacity:0.9
      }

    )

    .addTo(map)

    .bindPopup(`

      <b>${report.place}</b>
      <br>
      ${report.type}
      <br>
      ${report.time}

    `);

  });
}

// ─── MODAL ──────────────────────────────────────

function openReportModal(){

  document
    .getElementById("modal-overlay")
    .classList
    .remove("hidden");
}

function closeReportModal(){

  document
    .getElementById("modal-overlay")
    .classList
    .add("hidden");
}

// ─── SUBMIT REPORT ──────────────────────────────

function submitReport(){

  const location =
    document.getElementById("report-location").value;

  const type =
    document.getElementById("report-type").value;

  if(location === "" || type === ""){

    showToast("Fill all fields");
    return;
  }

  const feed =
    document.getElementById("reports-feed");

  const item =
    document.createElement("div");

  item.className = "report-item";

  item.innerHTML = `

    <div class="report-dot orange"></div>

    <div>

      <div class="report-place">
        ${location}
      </div>

      <div class="report-desc">
        ${type} — Just now
      </div>

    </div>
  `;

  feed.prepend(item);

  closeReportModal();

  showToast("Report Submitted");
}

// ─── SOS ────────────────────────────────────────

function triggerSOS(){

  document
    .getElementById("sos-modal")
    .classList
    .remove("hidden");

  const loc =
    document.getElementById("sos-location");

  if(navigator.geolocation){

    navigator.geolocation.getCurrentPosition(

      function(pos){

        const lat =
          pos.coords.latitude;

        const lng =
          pos.coords.longitude;

        const url =
          `https://maps.google.com/?q=${lat},${lng}`;

        loc.textContent = url;

        navigator.clipboard.writeText(url);

      }

    );
  }
}

function closeSOS(){

  document
    .getElementById("sos-modal")
    .classList
    .add("hidden");
}

// ─── TOAST ──────────────────────────────────────

function showToast(message){

  const toast =
    document.getElementById("toast");

  toast.textContent = message;

  toast.classList.remove("hidden");

  setTimeout(()=>{

    toast.classList.add("hidden");

  },3000);
}