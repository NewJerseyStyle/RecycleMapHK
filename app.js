// App Configuration and State
const STATE = {
  data: null,
  userCoords: null,
  userMarker: null,
  activeFilter: null, // index of active waste type
  selectedDistrict: -1, // index of active district
  showSmartOnly: false,
  showGreenOnly: false,
  searchQuery: '',
  map: null,
  markersGroup: null,
  activeMarkersMap: new Map(), // cpId -> Leaflet marker
  bottomSheetState: 'mid', // collapsed (80px), mid (50vh), expanded (85vh)
  currentTileLayer: null
};

// District TC Translations
const DISTRICTS_TC = [
  '葵青區', '屯門區', '元朗區', '北區', '大埔區', '西貢區',
  '沙田區', '荃灣區', '離島區', '油尖旺區', '中西區',
  '東區', '九龍城區', '深水埗區', '南區', '灣仔區',
  '觀塘區', '黃大仙區'
];

// Legend TC Translations
const LEGENDS_TC = [
  '公眾地方回收桶',
  '回收點',
  '私人收集點 (如屋苑、商場)',
  '非政府機構收集點',
  '綠在區區 (回收環保站/便利點)',
  '街角回收店',
  '智能回收箱'
];

// Waste Type TC Translations & SVGs
const WASTE_TYPES_INFO = [
  { tc: '金屬', en: 'Metals', icon: 'M' },
  { tc: '廢紙', en: 'Paper', icon: 'P' },
  { tc: '塑膠', en: 'Plastics', icon: 'L' },
  { tc: '塑膠樽', en: 'Plastic Bottle', icon: 'B' },
  { tc: '玻璃樽', en: 'Glass Bottles', icon: 'G' },
  { tc: '紙包飲品盒', en: 'Beverage Cartons', icon: 'C', special: true },
  { tc: '光管/慳電膽', en: 'Fluorescent Lamp', icon: 'F', special: true },
  { tc: '充電池', en: 'Rechargeable Batteries', icon: 'R', special: true },
  { tc: '四電一腦', en: 'Regulated Electrical Equipment', icon: 'E', special: true },
  { tc: '小型電器', en: 'Small Electrical and Electronic Equipment', icon: 'S', special: true },
  { tc: '衣物', en: 'Clothes', icon: 'T', special: true },
  { tc: '其他', en: 'Other Description', icon: 'O' },
  { tc: '燒烤叉', en: 'Barbeque Fork', icon: 'K' },
  { tc: '碳粉盒', en: 'Printer Cartridges', icon: 'H' },
  { tc: '廚餘', en: 'Food Waste', icon: 'W' },
  { tc: '電腦', en: 'Computers', icon: 'D', special: true }
];

// Initialize PWA and App
window.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initApp();
});

// Register Service Worker
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker Registered successfully', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  }
}

// Main App Initialization
async function initApp() {
  try {
    // 1. Fetch JSON Data
    const response = await fetch('./data.json');
    STATE.data = await response.json();
    
    // 2. Hide loading screen
    document.getElementById('loading-overlay').style.display = 'none';
    
    // 3. Setup Leaflet Map
    initMap();
    
    // 4. Setup Filters UI
    buildFiltersUI();
    buildDistrictSelect();
    
    // 5. Render list and markers initially
    renderList();
    renderMarkers();
    
    // 6. Bind Event Listeners
    bindEvents();
    
    // 7. Setup Drag Gestures for Mobile Bottom Sheet
    initBottomSheetGesture();
    
    // 8. Auto-Locate User (optional, trigger politely or wait for button click)
    // For good UX, we wait for the user to tap "Locate Me" or trigger on startup
  } catch (error) {
    console.error('Failed to initialize app:', error);
    alert('載入數據失敗，請重新整理頁面。');
  }
}

// Leaflet Map Initialization
function initMap() {
  // Center on Hong Kong
  STATE.map = L.map('map', {
    zoomControl: false // We will position our own or rely on gestures
  }).setView([22.3193, 114.1694], 11);

  // Setup Tile Layers (System Theme Aware)
  updateMapTiles();
  
  // Listen to system theme change to update map style dynamically
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateMapTiles);

  STATE.markersGroup = L.layerGroup().addTo(STATE.map);
}

// Set Map Tiles based on Light/Dark Mode
function updateMapTiles() {
  if (STATE.currentTileLayer) {
    STATE.map.removeLayer(STATE.currentTileLayer);
  }

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const tileUrl = isDark 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  STATE.currentTileLayer = L.tileLayer(tileUrl, { attribution, maxZoom: 20 }).addTo(STATE.map);
}

// Build Horizontal Filter Category Pills
function buildFiltersUI() {
  const container = document.getElementById('material-filters');
  container.innerHTML = '';
  
  // Build a "全部 / All" pill
  const allPill = document.createElement('button');
  allPill.className = 'filter-pill active';
  allPill.id = 'filter-pill-all';
  allPill.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 2a8 8 0 0 1 8 8 8 8 0 0 1-8 8 8 8 0 0 1-8-8 8 8 0 0 1 8-8z"/></svg>
    <span>全部</span>
  `;
  allPill.addEventListener('click', () => selectFilter(null));
  container.appendChild(allPill);
  
  // Build material pills
  WASTE_TYPES_INFO.forEach((info, index) => {
    // Only render popular or meaningful filters in horizontal scroll
    if (index === 11) return; // Skip "Other Description" to avoid clutter
    
    const pill = document.createElement('button');
    pill.className = 'filter-pill';
    pill.id = `filter-pill-${index}`;
    
    // Choose appropriate simple SVG based on material
    let svgPath = '';
    if (info.tc === '塑膠' || info.tc === '塑膠樽') {
      svgPath = '<path d="M19 4h-3c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm0-8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>';
    } else if (info.tc === '廢紙') {
      svgPath = '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>';
    } else if (info.tc === '金屬') {
      svgPath = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>';
    } else if (info.tc === '玻璃樽') {
      svgPath = '<path d="M19.07 4.93A10 10 0 0 0 12 2c-5.52 0-10 4.48-10 10 0 2.21.72 4.25 1.93 5.92L12 22l8.07-4.08A10 10 0 0 0 22 12c0-2.76-1.12-5.26-2.93-7.07zm-7.07 9.57c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>';
    } else if (info.tc === '廚餘') {
      svgPath = '<path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.22 19.58 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>';
    } else {
      // Default Eco Recycling Symbol SVG path
      svgPath = '<path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>';
    }
    
    pill.innerHTML = `
      <svg viewBox="0 0 24 24">${svgPath}</svg>
      <span>${info.tc}</span>
    `;
    pill.addEventListener('click', () => selectFilter(index));
    container.appendChild(pill);
  });
}

// Build District Selection Dropdown
function buildDistrictSelect() {
  const select = document.getElementById('district-select');
  select.innerHTML = '<option value="-1">選擇地區 (全部)</option>';
  
  DISTRICTS_TC.forEach((name, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = name;
    select.appendChild(option);
  });
}

// Filter Selection Handler
function selectFilter(filterIndex) {
  // Update state
  STATE.activeFilter = filterIndex;
  
  // Update UI active states for pills
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(pill => pill.classList.remove('active'));
  
  if (filterIndex === null) {
    document.getElementById('filter-pill-all').classList.add('active');
  } else {
    document.getElementById(`filter-pill-${filterIndex}`).classList.add('active');
  }

  // Auto-scroll pill into view
  if (filterIndex !== null) {
    const pill = document.getElementById(`filter-pill-${filterIndex}`);
    pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // Check if special item banner needs to be shown
  const greenBanner = document.getElementById('special-green-banner');
  if (filterIndex !== null && WASTE_TYPES_INFO[filterIndex].special) {
    const materialName = WASTE_TYPES_INFO[filterIndex].tc;
    document.getElementById('special-material-name').textContent = materialName;
    greenBanner.style.display = 'flex';
  } else {
    greenBanner.style.display = 'none';
  }

  // Refresh view
  renderList();
  renderMarkers();
  
  // Auto-snap bottom sheet up on mobile to show list when filter changes
  if (window.innerWidth <= 768 && STATE.bottomSheetState === 'collapsed') {
    snapBottomSheet('mid');
  }
}

// Geolocation Handling
function locateUser() {
  const btn = document.getElementById('gps-btn');
  if (btn.classList.contains('locating')) return; // already loading

  btn.classList.add('locating');
  btn.querySelector('span').textContent = '定位中...';

  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };

  navigator.geolocation.getCurrentPosition(
    (position) => {
      STATE.userCoords = {
        lat: position.coords.latitude,
        lgt: position.coords.longitude
      };

      // Reset locating state
      btn.classList.remove('locating');
      btn.querySelector('span').textContent = '已定位';

      // 1. Draw User Marker on Map
      drawUserMarker();

      // 2. Compute Distances and Sort List
      computeDistances();
      renderList();
      renderMarkers();

      // 3. Zoom Map to User and closest 5 points
      fitMapToUserAndClosestPoints();
      
      // Auto-snap bottom sheet to half screen on mobile to see both map and results
      if (window.innerWidth <= 768) {
        snapBottomSheet('mid');
      }
    },
    (error) => {
      console.error('GPS Error:', error);
      btn.classList.remove('locating');
      btn.querySelector('span').textContent = '定位失敗';
      alert('無法取得您的位置。請確認您已開啟手機 GPS 定位及瀏覽器定位權限。');
    },
    options
  );
}

// Draw User Marker on Map
function drawUserMarker() {
  if (STATE.userMarker) {
    STATE.map.removeLayer(STATE.userMarker);
  }

  const userIcon = L.divIcon({
    className: 'custom-pin user-loc',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  STATE.userMarker = L.marker([STATE.userCoords.lat, STATE.userCoords.lgt], {
    icon: userIcon,
    zIndexOffset: 1000
  })
  .addTo(STATE.map)
  .bindPopup('<div class="map-popup-content"><span class="map-popup-title">您的位置</span></div>');
}

// Compute Distances to All Points using Haversine
function computeDistances() {
  if (!STATE.userCoords || !STATE.data) return;

  STATE.data.points.forEach(point => {
    const lat = point[4];
    const lgt = point[5];
    const distanceKm = calculateHaversine(
      STATE.userCoords.lat, 
      STATE.userCoords.lgt, 
      lat, 
      lgt
    );
    point[10] = distanceKm; // append distance as index 10
  });
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get Filtered Points List
function getFilteredPoints() {
  if (!STATE.data) return [];

  return STATE.data.points.filter(point => {
    // 1. Filter by District
    if (STATE.selectedDistrict !== -1 && point[1] !== STATE.selectedDistrict) {
      return false;
    }

    // 2. Filter by Material (activeFilter index)
    if (STATE.activeFilter !== null && !point[6].includes(STATE.activeFilter)) {
      return false;
    }

    // 3. Filter by Legend (Advanced)
    // 4: Green@Community Store/Station
    // 6: Smart Bin
    const legendIdx = point[7];
    if (STATE.showSmartOnly && legendIdx !== 6) return false;
    if (STATE.showGreenOnly && legendIdx !== 4) return false;

    // 4. Filter by Text Search
    if (STATE.searchQuery) {
      const q = STATE.searchQuery.toLowerCase();
      const addrTc = point[2].toLowerCase();
      const addrEn = point[3].toLowerCase();
      const districtName = DISTRICTS_TC[point[1]].toLowerCase();
      const legendName = STATE.data.legends[legendIdx].toLowerCase();

      if (!addrTc.includes(q) && !addrEn.includes(q) && !districtName.includes(q) && !legendName.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

// Render Results List in Sidebar/Bottom Sheet
function renderList() {
  const container = document.getElementById('results-list');
  container.innerHTML = '';
  
  let points = getFilteredPoints();

  // If GPS coordinates exist, sort by distance. Otherwise keep original CSV sorting.
  if (STATE.userCoords) {
    points.sort((a, b) => (a[10] || 9999) - (b[10] || 9999));
  }

  // Cap initial rendering at 100 points for performance, but show count
  const totalCount = points.length;
  document.getElementById('results-count').textContent = totalCount;
  
  const pointsToShow = points.slice(0, 100);

  if (pointsToShow.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <svg style="width: 3rem; height: 3rem; opacity: 0.5; margin-bottom: 0.5rem; fill: currentColor;" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <p>沒有符合條件的回收點，請調整您的篩選條件。</p>
      </div>
    `;
    return;
  }

  pointsToShow.forEach(point => {
    const id = point[0];
    const districtIdx = point[1];
    const addrTc = point[2];
    const lat = point[4];
    const lgt = point[5];
    const wasteIdxs = point[6];
    const legendIdx = point[7];
    const openTc = point[8];
    const distanceKm = point[10];

    // Build list item card
    const card = document.createElement('div');
    card.className = 'point-card';
    card.id = `point-card-${id}`;
    
    // Distance element HTML
    let distanceHtml = '';
    if (distanceKm !== undefined) {
      const distanceDisplay = distanceKm < 1 
        ? `${Math.round(distanceKm * 1000)}米` 
        : `${distanceKm.toFixed(1)}公里`;
      distanceHtml = `<span class="badge badge-distance">${distanceDisplay}</span>`;
    }

    // Legend badge type class
    let badgeTypeClass = 'badge-type';
    if (legendIdx === 4) badgeTypeClass = 'badge-green'; // 綠在區區
    if (legendIdx === 6) badgeTypeClass = 'badge-smart'; // 智能回收箱
    
    const legendTc = LEGENDS_TC[legendIdx];

    // Tags list (Traditional Chinese materials)
    const tagsHtml = wasteIdxs.map(idx => {
      const name = WASTE_TYPES_INFO[idx] ? WASTE_TYPES_INFO[idx].tc : STATE.data.wasteTypes[idx];
      return `<span class="tag">${name}</span>`;
    }).join('');

    // Open hours HTML if available (usually 綠在區區)
    const hoursHtml = openTc 
      ? `<div class="point-hours">
          <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          <span>開放：${openTc}</span>
         </div>`
      : '';

    card.innerHTML = `
      <div class="point-header">
        <h3 class="point-title">${addrTc}</h3>
      </div>
      <div class="point-meta">
        ${distanceHtml}
        <span class="badge ${badgeTypeClass}">${legendTc}</span>
      </div>
      <p class="point-address">${DISTRICTS_TC[districtIdx]} - ${addrTc}</p>
      ${hoursHtml}
      <div class="point-tags">
        ${tagsHtml}
      </div>
      <div class="point-actions">
        <button class="action-btn action-btn-secondary focus-btn" data-id="${id}">
          <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          地圖定位
        </button>
        <button class="action-btn action-btn-main nav-btn" data-lat="${lat}" data-lgt="${lgt}">
          <svg viewBox="0 0 24 24"><path d="M22.43 10.59l-9.01-9.01c-.75-.75-2.07-.75-2.83 0l-9 9c-.78.78-.78 2.04 0 2.82l9 9c.39.39.9.58 1.41.58.51 0 1.02-.19 1.41-.58l8.99-9c.79-.76.79-2.03.03-2.81zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>
          Google導航
        </button>
      </div>
    `;

    // Click on card selects marker
    card.addEventListener('click', (e) => {
      // Don't trigger if clicked actions button
      if (e.target.closest('.point-actions')) return;
      focusOnPoint(id, lat, lgt);
    });

    container.appendChild(card);
  });

  // Attach actions button events
  document.querySelectorAll('.focus-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(btn.dataset.id);
      const point = STATE.data.points.find(p => p[0] === id);
      if (point) {
        focusOnPoint(id, point[4], point[5]);
      }
    });
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lat = btn.dataset.lat;
      const lgt = btn.dataset.lgt;
      openGoogleMapsNavigation(lat, lgt);
    });
  });
}

// Render Map Markers based on current filter
function renderMarkers() {
  STATE.markersGroup.clearLayers();
  STATE.activeMarkersMap.clear();

  const points = getFilteredPoints();
  
  // Optimize: limit map markers rendering to 500 points to keep map snappy
  const pointsToRender = points.slice(0, 500);

  pointsToRender.forEach(point => {
    const id = point[0];
    const addrTc = point[2];
    const lat = point[4];
    const lgt = point[5];
    const legendIdx = point[7];

    // Style map pin
    let pinClass = 'custom-pin';
    if (legendIdx === 4) pinClass += ' green-point'; // 綠在區區
    if (legendIdx === 6) pinClass += ' smart-point'; // 智能回收箱

    const icon = L.divIcon({
      className: pinClass,
      iconSize: [28, 28],
      iconAnchor: [14, 28], // bottom tip of the pin
      popupAnchor: [0, -28]
    });

    const marker = L.marker([lat, lgt], { icon })
      .bindPopup(`
        <div class="map-popup-content">
          <span class="map-popup-title">${addrTc}</span>
          <span class="map-popup-desc">${LEGENDS_TC[legendIdx]}</span>
          <a class="map-popup-btn" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lgt}" target="_blank">
            開啟導航
          </a>
        </div>
      `);

    marker.on('click', () => {
      // Highlight card in list
      highlightCardInList(id);
    });

    STATE.markersGroup.addLayer(marker);
    STATE.activeMarkersMap.set(id, marker);
  });
}

// Focus Map on a specific point and highlight it
function focusOnPoint(id, lat, lgt) {
  STATE.map.setView([lat, lgt], 16);
  
  const marker = STATE.activeMarkersMap.get(id);
  if (marker) {
    marker.openPopup();
  }

  highlightCardInList(id);
  
  // If in mobile view, trigger half-screen sheet so map is visible
  if (window.innerWidth <= 768) {
    snapBottomSheet('mid');
  }
}

// Highlight and Scroll Card in List
function highlightCardInList(id) {
  // Remove prior active classes
  document.querySelectorAll('.point-card').forEach(card => card.classList.remove('active'));
  
  const card = document.getElementById(`point-card-${id}`);
  if (card) {
    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Fit map to user and nearby points
function fitMapToUserAndClosestPoints() {
  if (!STATE.userCoords) return;

  const points = getFilteredPoints();
  if (points.length === 0) {
    STATE.map.setView([STATE.userCoords.lat, STATE.userCoords.lgt], 14);
    return;
  }

  // Get coordinates of closest 5 points plus user
  const bounds = L.latLngBounds([STATE.userCoords.lat, STATE.userCoords.lgt]);
  const closestPoints = points
    .sort((a, b) => (a[10] || 9999) - (b[10] || 9999))
    .slice(0, 5);

  closestPoints.forEach(p => {
    bounds.extend([p[4], p[5]]);
  });

  STATE.map.fitBounds(bounds, { padding: [50, 50] });
}

// Redirect User to Google Maps Turn-by-Turn Navigation
function openGoogleMapsNavigation(lat, lgt) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lgt}`;
  window.open(url, '_blank');
}

// Bind Buttons and Forms Event Listeners
function bindEvents() {
  // Geolocation trigger
  document.getElementById('gps-btn').addEventListener('click', locateUser);
  
  // Search text box typing
  const searchInput = document.getElementById('search-input');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      STATE.searchQuery = e.target.value;
      renderList();
      renderMarkers();
    }, 300); // debounce typing
  });

  // District dropdown change
  document.getElementById('district-select').addEventListener('change', (e) => {
    STATE.selectedDistrict = parseInt(e.target.value);
    
    // Fit map to selected district points if no user coords
    renderList();
    renderMarkers();
    
    if (STATE.selectedDistrict !== -1) {
      const points = getFilteredPoints();
      if (points.length > 0) {
        const bounds = L.latLngBounds();
        points.slice(0, 10).forEach(p => bounds.extend([p[4], p[5]]));
        STATE.map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  });

  // Advanced toggles
  document.getElementById('smart-toggle').addEventListener('click', (e) => {
    STATE.showSmartOnly = !STATE.showSmartOnly;
    e.target.classList.toggle('active', STATE.showSmartOnly);
    renderList();
    renderMarkers();
  });

  document.getElementById('green-toggle').addEventListener('click', (e) => {
    STATE.showGreenOnly = !STATE.showGreenOnly;
    e.target.classList.toggle('active', STATE.showGreenOnly);
    renderList();
    renderMarkers();
  });

  // 綠在區區 Information Drawer Trigger
  document.getElementById('view-green-info-btn').addEventListener('click', showGreenInfoModal);
}

// PWA Install Prompt handling
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Show install banner
  const banner = document.getElementById('install-banner');
  if (banner) {
    banner.style.display = 'flex';
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'install-app-btn') {
    const banner = document.getElementById('install-banner');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted PWA installation');
        }
        deferredPrompt = null;
        banner.style.display = 'none';
      });
    }
  }
});

// Gesture Drag-and-Snap Logic for Mobile Bottom Sheet
function initBottomSheetGesture() {
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('bottom-sheet-handle');
  
  if (!handle || window.innerWidth > 768) return;

  let startY = 0;
  let startHeight = 0;
  let isDragging = false;

  handle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    startHeight = sidebar.getBoundingClientRect().height;
    isDragging = true;
    sidebar.style.transition = 'none'; // disable transitions while dragging
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - startY;
    const newHeight = startHeight - deltaY; // sliding up increases height

    // Constrain height between 80px and 85vh
    const maxH = window.innerHeight * 0.85;
    const minH = 80;
    const constrainedH = Math.max(minH, Math.min(maxH, newHeight));
    
    sidebar.style.height = `${constrainedH}px`;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    sidebar.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

    const currentHeight = sidebar.getBoundingClientRect().height;
    const heightVw = (currentHeight / window.innerHeight) * 100;

    // Snap points:
    // Collapsed: height <= 20%
    // Mid (Half Screen): 20% < height <= 65%
    // Expanded: height > 65%
    if (heightVw <= 22) {
      snapBottomSheet('collapsed');
    } else if (heightVw > 22 && heightVw <= 68) {
      snapBottomSheet('mid');
    } else {
      snapBottomSheet('expanded');
    }
  });
}

function snapBottomSheet(state) {
  const sidebar = document.getElementById('sidebar');
  STATE.bottomSheetState = state;

  if (state === 'collapsed') {
    sidebar.style.height = '80px';
  } else if (state === 'mid') {
    sidebar.style.height = '50vh';
  } else if (state === 'expanded') {
    sidebar.style.height = '85vh';
  }
}

// Display "綠在區區" Modal Guide
function showGreenInfoModal() {
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.right = '0';
  modal.style.bottom = '0';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  modal.style.zIndex = '9999';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.padding = '1.5rem';
  modal.style.backdropFilter = 'blur(5px)';

  modal.innerHTML = `
    <div style="background-color: var(--bg-app); border: 1px solid var(--border); border-radius: 20px; width: 100%; max-width: 500px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: var(--shadow-lg); animation: slideUp 0.3s ease;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;">
        <h3 style="color: var(--primary); font-size: 1.2rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg style="width: 1.5rem; height: 1.5rem; fill: currentColor;" viewBox="0 0 24 24"><path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          綠在區區 & 智能積分指南
        </h3>
        <button id="close-modal-btn" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>
      
      <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-main); max-height: 60vh; overflow-y: auto; padding-right: 0.5rem; display: flex; flex-direction: column; gap: 0.75rem;">
        <p><strong>什麼是綠在區區？</strong></p>
        <p>「綠在區區」是香港環境保護署推行的社區回收網絡，設有回收環保站、回收便利點及回收流動點，接受多種特殊回收物，比普通路邊三色箱覆蓋更廣。</p>
        
        <p><strong>支援回收種類：</strong></p>
        <p style="background: rgba(var(--primary-rgb), 0.05); padding: 0.5rem 0.75rem; border-radius: 8px;">
          ✓ 廢紙、金屬、塑膠樽及其他塑膠<br>
          ✓ 玻璃樽、紙包飲品盒 (Tetra Pak)<br>
          ✓ 充電池、螢光管及慳電膽<br>
          ✓ 小型電器、四電一腦 (冷氣機、雪櫃、洗衣機、電視機及電腦)<br>
          ✓ 碳粉盒、衣物等
        </p>

        <p><strong>智能積分獎賞 (Green$ 綠綠賞)：</strong></p>
        <p>於「綠在區區」提交回收物時，可使用「綠綠賞」手機應用程式或實體卡累積積分，換取禮品（如香米、即食麵、環保日用品等）。</p>

        <p><strong>官方應用程式下載：</strong></p>
        <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 0.5rem;">
          <a href="https://apps.apple.com/hk/app/green-s/id1603504825" target="_blank" style="background-color: var(--primary); color: white; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 0.8rem;">Apple iOS App</a>
          <a href="https://play.google.com/store/apps/details?id=hk.gov.epd.greens" target="_blank" style="background-color: var(--primary); color: white; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 0.8rem;">Android Google Play</a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    document.body.removeChild(modal);
  };

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  modal.querySelector('#close-modal-btn').addEventListener('click', closeModal);
}
