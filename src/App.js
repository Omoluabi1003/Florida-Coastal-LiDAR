import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "maplibre-gl-lidar/dist/maplibre-gl-lidar.css";
import "maplibre-gl-usgs-lidar/dist/maplibre-gl-usgs-lidar.css";
import { UsgsLidarControlReact } from "maplibre-gl-usgs-lidar";

const POSITRON_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [
    {
      id: "esri-tiles",
      type: "raster",
      source: "esri",
    },
  ],
};

const LIDAR_ONLY_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#0b1020",
      },
    },
  ],
};

const COLOR_RAMPS = {
  elevation: {
    label: "Elevation (0-5m)",
    ramp: [
      [0, "#0d47a1"],
      [1, "#1976d2"],
      [2.5, "#26c6da"],
      [3.5, "#fdd835"],
      [5, "#ef5350"],
    ],
  },
  intensity: { label: "Intensity" },
  classification: { label: "Classification" },
  rgb: { label: "RGB" },
};

const NOAA_SLR_URL = "https://coast.noaa.gov/slr/data/slr-geojson.json";

const getQualityScore = (qualityLevel) => {
  const normalized = (qualityLevel || "").toString().toUpperCase();
  if (normalized.includes("QL0")) {
    return 0;
  }
  if (normalized.includes("QL1")) {
    return 1;
  }
  if (normalized.includes("QL2")) {
    return 2;
  }
  if (normalized.includes("QL3")) {
    return 3;
  }
  return 9;
};

const App = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const lidarControlRef = useRef(null);
  const lidarLayerIdsRef = useRef([]);
  const [colorScheme, setColorScheme] = useState("elevation");
  const [seaLevel, setSeaLevel] = useState(1.5);
  const [basemapMode, setBasemapMode] = useState("positron");
  const [mapReady, setMapReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const baseStyle = useMemo(() => {
    if (basemapMode === "satellite") {
      return SATELLITE_STYLE;
    }
    if (basemapMode === "lidar") {
      return LIDAR_ONLY_STYLE;
    }
    return POSITRON_STYLE;
  }, [basemapMode]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return undefined;
    }

    setMapReady(false);
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: baseStyle,
      center: [-80.25, 27.2],
      zoom: 10,
      attributionControl: true,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "top-left");

    map.on("load", () => {
      setMapReady(true);
      fetch(NOAA_SLR_URL)
        .then((response) => response.json())
        .then((data) => {
          const floridaFeatures = data.features?.filter((feature) => {
            const state = feature.properties?.state || feature.properties?.STATE;
            return state && state.toString().toUpperCase().includes("FL");
          });

          if (!map.getSource("noaa-slr")) {
            map.addSource("noaa-slr", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: floridaFeatures || [],
              },
            });
          }

          if (!map.getLayer("noaa-slr-fill")) {
            map.addLayer({
              id: "noaa-slr-fill",
              type: "fill",
              source: "noaa-slr",
              paint: {
                "fill-color": "#00bcd4",
                "fill-opacity": 0.18,
              },
            });
          }

          if (!map.getLayer("noaa-slr-outline")) {
            map.addLayer({
              id: "noaa-slr-outline",
              type: "line",
              source: "noaa-slr",
              paint: {
                "line-color": "#00acc1",
                "line-width": 1.5,
              },
            });
          }
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error("Failed to load NOAA SLR layer", error);
        });
    });

    return () => {
      map.remove();
    };
  }, [baseStyle]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleAutoSearch = () => {
    const control = lidarControlRef.current;
    if (control?.searchByMapExtent) {
      control.searchByMapExtent({
        qualityLevels: ["QL0", "QL1", "QL2"],
      });
    } else if (control?.search) {
      control.search({
        searchType: "extent",
        qualityLevels: ["QL0", "QL1", "QL2"],
      });
    }
  };

  useEffect(() => {
    if (mapReady) {
      handleAutoSearch();
    }
  }, [mapReady]);

  const applyColorScheme = (mapInstance, scheme) => {
    lidarLayerIdsRef.current.forEach((layerId) => {
      if (!mapInstance.getLayer(layerId)) {
        return;
      }

      if (scheme === "elevation") {
        const ramp = COLOR_RAMPS.elevation.ramp.flat();
        mapInstance.setPaintProperty(layerId, "point-color", [
          "interpolate",
          ["linear"],
          ["get", "Z"],
          ...ramp,
        ]);
      } else if (scheme === "intensity") {
        mapInstance.setPaintProperty(layerId, "point-color", [
          "interpolate",
          ["linear"],
          ["get", "Intensity"],
          0,
          "#212121",
          255,
          "#f5f5f5",
        ]);
      } else if (scheme === "classification") {
        mapInstance.setPaintProperty(layerId, "point-color", [
          "match",
          ["get", "Classification"],
          2,
          "#4caf50",
          7,
          "#1976d2",
          9,
          "#ffb300",
          10,
          "#ef5350",
          "#9e9e9e",
        ]);
      } else if (scheme === "rgb") {
        mapInstance.setPaintProperty(layerId, "point-color", [
          "rgb",
          ["get", "Red"],
          ["get", "Green"],
          ["get", "Blue"],
        ]);
      }
    });
  };

  const applySeaLevelFilter = (mapInstance, threshold) => {
    lidarLayerIdsRef.current.forEach((layerId) => {
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setFilter(layerId, [">=", ["get", "Z"], threshold]);
      }
    });
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    applyColorScheme(map, colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    applySeaLevelFilter(map, seaLevel);
  }, [seaLevel]);

  const handleSearchComplete = (event) => {
    const results = event?.detail?.results || event?.results || [];
    // eslint-disable-next-line no-console
    console.log("LiDAR search complete", results);

    if (!results.length) {
      return;
    }

    const sorted = [...results].sort((a, b) => {
      const qualityDiff = getQualityScore(a.qualityLevel) - getQualityScore(b.qualityLevel);
      if (qualityDiff !== 0) {
        return qualityDiff;
      }
      const dateA = new Date(a.publicationDate || a.date || 0).getTime();
      const dateB = new Date(b.publicationDate || b.date || 0).getTime();
      return dateB - dateA;
    });

    const best = sorted[0];
    if (best && lidarControlRef.current?.loadDataset) {
      lidarControlRef.current.loadDataset(best);
    }
  };

  const handleLoadComplete = (event) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const layerIds =
      event?.detail?.layerIds ||
      event?.layerIds ||
      (map.getStyle()?.layers || [])
        .filter((layer) => layer.type === "circle" && layer.id.includes("lidar"))
        .map((layer) => layer.id);

    lidarLayerIdsRef.current = layerIds || [];

    applyColorScheme(map, colorScheme);
    applySeaLevelFilter(map, seaLevel);
  };

  const handleToggleBasemap = () => {
    setBasemapMode((prev) => {
      if (prev === "satellite") {
        return "lidar";
      }
      return "satellite";
    });
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        color: "#0b1020",
      }}
    >
      <header
        style={{
          padding: "0.75rem 1.25rem",
          background: "#f5f7fb",
          borderBottom: "1px solid #dfe3ee",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.35rem" }}>
          Coastal Erosion Viewer - Stuart, FL Area
        </h1>
        <p style={{ margin: 0, fontSize: "0.95rem", color: "#42526e" }}>
          Explore USGS LiDAR tiles, sea level rise overlays, and adjust inundation thresholds.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 320px) 1fr",
          flex: 1,
          minHeight: 0,
        }}
      >
        <aside
          style={{
            padding: "1rem",
            borderRight: isMobile ? "none" : "1px solid #e4e8f0",
            borderBottom: isMobile ? "1px solid #e4e8f0" : "none",
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div
            style={{
              background: "#f0f4ff",
              borderRadius: "10px",
              padding: "0.75rem",
              fontSize: "0.9rem",
              color: "#1b2a4e",
            }}
          >
            <strong>Instructions</strong>
            <p style={{ margin: "0.5rem 0 0" }}>
              Use the dropdown to switch point coloring, adjust sea level rise to hide low-lying
              points, and toggle basemap visibility for focus on the point cloud.
            </p>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600 }}>Color scheme</span>
            <select
              value={colorScheme}
              onChange={(event) => setColorScheme(event.target.value)}
              style={{ padding: "0.5rem", borderRadius: "6px", borderColor: "#c6d0e3" }}
            >
              {Object.entries(COLOR_RAMPS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600 }}>
              Sea level rise: {seaLevel.toFixed(1)} meters
            </span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={seaLevel}
              onChange={(event) => setSeaLevel(Number(event.target.value))}
            />
          </label>

          <button
            type="button"
            onClick={handleToggleBasemap}
            style={{
              padding: "0.65rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid #c6d0e3",
              background: "#ffffff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Toggle Satellite / LiDAR-only
          </button>

          <button
            type="button"
            onClick={handleAutoSearch}
            style={{
              padding: "0.65rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid #0b5fff",
              background: "#0b5fff",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Search LiDAR by map extent
          </button>
        </aside>

        <main style={{ position: "relative" }}>
          <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
          {mapRef.current && (
            <div style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
              <UsgsLidarControlReact
                ref={lidarControlRef}
                map={mapRef.current}
                options={{
                  title: "Florida Coastal LiDAR",
                  collapsed: false,
                  maxResults: 50,
                  showFootprints: true,
                  autoZoomToResults: true,
                  searchType: "extent",
                  qualityLevels: ["QL0", "QL1", "QL2"],
                }}
                onSearchComplete={handleSearchComplete}
                onLoadComplete={handleLoadComplete}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
