import { useEffect, useMemo, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

import { EmptyState, ErrorState, LoadingSkeleton, MetricCard, PageHeader, SeverityBadge, StatusBadge } from "../components/ui.jsx";

const ADMIN_TOKEN_SESSION_KEY = "fpafbas_admin_token";
const REPLAY_ENTRY_TFS = ["15m", "1h"];

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, { credentials: "same-origin", ...options });
  if (!res.ok) {
    throw new Error(`${url} failed with ${res.status}`);
  }
  return res.json();
};

const getAdminToken = () => {
  try {
    return (window.sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY) || "").trim();
  } catch (_err) {
    return "";
  }
};

const setAdminToken = (token) => {
  try {
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token);
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY);
    }
  } catch (_err) {
    // no-op
  }
};

const fetchAdminJson = async (url, options = {}) => {
  const send = async (token) => {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  let token = getAdminToken();
  if (!token) {
    token = (window.prompt("Enter ADMIN_TOKEN:") || "").trim();
    if (!token) {
      throw new Error("ADMIN_TOKEN required for admin endpoint");
    }
    setAdminToken(token);
  }

  let res = await send(token);
  if (res.status === 401) {
    setAdminToken("");
    token = (window.prompt("Invalid ADMIN_TOKEN. Enter it again:") || "").trim();
    if (!token) {
      throw new Error(`${url} failed with 401`);
    }
    setAdminToken(token);
    res = await send(token);
  }

  if (!res.ok) {
    throw new Error(`${url} failed with ${res.status}`);
  }
  return res.json();
};

export default function DashboardPage({ view = "dashboard" }) {
  const [alertsData, setAlertsData] = useState({ items: [], limit: 100, offset: 0, total: 0 });
  const [alertsError, setAlertsError] = useState("");
  const [alertsTab, setAlertsTab] = useState("history");
  const [alertsFilters, setAlertsFilters] = useState({
    symbol: "",
    tf: "",
    type: "",
    direction: "",
    notified: "",
    sinceMs: ""
  });
  const [alertsLimit, setAlertsLimit] = useState(100);
  const [alertsOffset, setAlertsOffset] = useState(0);
  const [alertsSearch, setAlertsSearch] = useState("");
  const [alertsAutoRefresh, setAlertsAutoRefresh] = useState(false);
  const [alertDetailsId, setAlertDetailsId] = useState(null);
  const [alertDetails, setAlertDetails] = useState(null);
  const [alertDetailsError, setAlertDetailsError] = useState("");
  const [watchlist, setWatchlist] = useState(null);
  const [watchlistFormSymbol, setWatchlistFormSymbol] = useState("");
  const [watchlistBulkSymbols, setWatchlistBulkSymbols] = useState("");
  const [watchlistFormTfs, setWatchlistFormTfs] = useState(["15m", "1h", "4h"]);
  const [watchlistFilter, setWatchlistFilter] = useState("");
  const [watchlistSelectedSymbols, setWatchlistSelectedSymbols] = useState([]);
  const [watchlistFormError, setWatchlistFormError] = useState("");
  const [watchlistSaveStatus, setWatchlistSaveStatus] = useState("");
  const [indicators, setIndicators] = useState(null);
  const [indicatorError, setIndicatorError] = useState("");
  const [symbols, setSymbols] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [levels, setLevels] = useState(null);
  const [levelsError, setLevelsError] = useState("");
  const [levelsEntryTf, setLevelsEntryTf] = useState("15m");
  const [pinnedInput, setPinnedInput] = useState("");
  const [disabledInput, setDisabledInput] = useState("");
  const [diPeak, setDiPeak] = useState(null);
  const [diPeakError, setDiPeakError] = useState("");
  const [diTf, setDiTf] = useState("15m");
  const [diWindow] = useState(120);
  const [volData, setVolData] = useState(null);
  const [volError, setVolError] = useState("");
  const [volTf, setVolTf] = useState("15m");
  const [rsiData, setRsiData] = useState(null);
  const [rsiError, setRsiError] = useState("");
  const [rsiTf, setRsiTf] = useState("15m");
  const [levelEvents, setLevelEvents] = useState(null);
  const [levelEventsError, setLevelEventsError] = useState("");
  const [levelEventsTf, setLevelEventsTf] = useState("1h");
  const [setupCandles, setSetupCandles] = useState(null);
  const [setupError, setSetupError] = useState("");
  const [setupTf, setSetupTf] = useState("15m");
  const [openings, setOpenings] = useState(null);
  const [openingsError, setOpeningsError] = useState("");
  const [openingsTf, setOpeningsTf] = useState("15m");
  const [qualitySettings, setQualitySettings] = useState(null);
  const [qualityError, setQualityError] = useState("");
  const [qualitySaveStatus, setQualitySaveStatus] = useState("");
  const [suppressed, setSuppressed] = useState([]);
  const [suppressedError, setSuppressedError] = useState("");
  const [suppressedReason, setSuppressedReason] = useState("all");
  const [chartCandles, setChartCandles] = useState([]);
  const [chartLevels, setChartLevels] = useState([]);
  const [chartLevelEvents, setChartLevelEvents] = useState([]);
  const [chartSetupCandles, setChartSetupCandles] = useState([]);
  const [chartOpenings, setChartOpenings] = useState([]);
  const [chartError, setChartError] = useState("");
  const [chartTf, setChartTf] = useState("15m");
  const [chartLoading, setChartLoading] = useState(false);
  const [chartAutoRefresh, setChartAutoRefresh] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showSma7, setShowSma7] = useState(true);
  const [showLevelEvents, setShowLevelEvents] = useState(true);
  const [showSetupCandles, setShowSetupCandles] = useState(true);
  const [showOpenings, setShowOpenings] = useState(true);
  const [showDiWidget, setShowDiWidget] = useState(true);
  const [showRsiWidget, setShowRsiWidget] = useState(false);
  const [showVolumeWidget, setShowVolumeWidget] = useState(true);
  const [chartLegend, setChartLegend] = useState(null);
  const [chartDetails, setChartDetails] = useState(null);
  const [chartDiPeak, setChartDiPeak] = useState(null);
  const [chartDiError, setChartDiError] = useState("");
  const [chartRsi, setChartRsi] = useState(null);
  const [chartRsiError, setChartRsiError] = useState("");
  const [chartVol, setChartVol] = useState(null);
  const [chartVolError, setChartVolError] = useState("");
  const [replayData, setReplayData] = useState(null);
  const [replaySummary, setReplaySummary] = useState(null);
  const [replayRuns, setReplayRuns] = useState({});
  const [replayError, setReplayError] = useState("");
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayTf, setReplayTf] = useState("1h");
  const [replayStep, setReplayStep] = useState(1);
  const [replayWarmup, setReplayWarmup] = useState(300);
  const [replayFromMs, setReplayFromMs] = useState(() => formatDateTimeLocal(Date.now() - 24 * 60 * 60 * 1000));
  const [replayToMs, setReplayToMs] = useState(() => formatDateTimeLocal(Date.now()));
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayDetails, setReplayDetails] = useState(null);
  const [replaySideFilter, setReplaySideFilter] = useState("all");
  const [replayOutcomeFilter, setReplayOutcomeFilter] = useState("all");
  const [replaySortBy, setReplaySortBy] = useState("time_desc");
  const [pollerStatus, setPollerStatus] = useState(null);
  const [pollerError, setPollerError] = useState("");
  const [telegramText, setTelegramText] = useState("");
  const [telegramFeedback, setTelegramFeedback] = useState(null);
  const [telegramSettings, setTelegramSettings] = useState(null);
  const [telegramForm, setTelegramForm] = useState({ enabled: false, bot_token: "", chat_id: "" });
  const [telegramSettingsStatus, setTelegramSettingsStatus] = useState("");
  const [telegramSettingsError, setTelegramSettingsError] = useState("");
  const [settingsSection, setSettingsSection] = useState("watchlist");
  const [adminTokenDraft, setAdminTokenDraft] = useState(() => getAdminToken());
  const [opsLogSearch, setOpsLogSearch] = useState("");
  const [opsLogLevel, setOpsLogLevel] = useState("all");
  const [opsLogSource, setOpsLogSource] = useState("all");
  const [opsSelectedLog, setOpsSelectedLog] = useState(null);
  const [error, setError] = useState("");

  const watchlistTfOptions = ["15m", "1h", "4h", "1d"];
  const watchlistDefaultTfs = ["15m", "1h", "4h"];
  const watchlistRuleOptions = [
    ["di_peak_filter", "DI"],
    ["volume_spike_filter", "Vol"],
    ["fakeout_volume_filter", "Fake vol"],
    ["pullback_volume_filter", "Pullback"]
  ];
  const watchlistItems = useMemo(() => {
    if (!Array.isArray(watchlist?.symbols)) {
      return [];
    }
    return watchlist.symbols;
  }, [watchlist]);
  const filteredWatchlistItems = useMemo(() => {
    const needle = watchlistFilter.trim().toUpperCase();
    if (!needle) {
      return watchlistItems;
    }
    return watchlistItems.filter((item) => String(item?.symbol || "").toUpperCase().includes(needle));
  }, [watchlistItems, watchlistFilter]);
  const chartContainerRef = useRef(null);
  const volumeContainerRef = useRef(null);
  const indicatorContainerRef = useRef(null);
  const chartAbortRef = useRef(null);
  const markerDetailsRef = useRef(new Map());
  const chartTfRef = useRef(chartTf);
  const isOpsView = view === "ops";
  const isSettingsView = view === "settings";
  const isAdminConfigView = isOpsView || isSettingsView;
  const chartRefs = useRef({
    main: null,
    volume: null,
    indicator: null,
    candleSeries: null,
    sma7Series: null,
    sma21Series: null,
    sma50Series: null,
    volumeSeries: null,
    volMa5Series: null,
    volMa10Series: null,
    diPlusSeries: null,
    diMinusSeries: null,
    adxSeries: null,
    priceLines: [],
    zoneSeries: []
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [watchlistData, symbolsData] = await Promise.all([
          fetchJson("/api/watchlist"),
          fetchJson("/api/symbols")
        ]);
        setWatchlist(watchlistData);
        const apiSymbols = Array.isArray(symbolsData.symbols) ? symbolsData.symbols.map((item) => item.symbol) : [];
        const fallbackSymbols = watchlistData?.symbols ? watchlistData.symbols.map((item) => item.symbol) : [];
        const merged = apiSymbols.length > 0 ? apiSymbols : fallbackSymbols;
        setSymbols(merged);
        if (merged.length > 0) {
          setSelectedSymbol(merged[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    load();
  }, []);

  useEffect(() => {
    const valid = new Set(watchlistItems.map((item) => item.symbol));
    setWatchlistSelectedSymbols((prev) => prev.filter((symbol) => valid.has(symbol)));
  }, [watchlistItems]);

  useEffect(() => {
    if (!chartContainerRef.current || !volumeContainerRef.current || !indicatorContainerRef.current) {
      return undefined;
    }
    const mainChart = createChart(chartContainerRef.current, {
      height: 360,
      layout: { background: { color: "#111A27" }, textColor: "#A8B3C5" },
      grid: { vertLines: { color: "#1C2A3B" }, horzLines: { color: "#1C2A3B" } },
      rightPriceScale: { borderColor: "#26364A" },
      timeScale: { borderColor: "#26364A" }
    });
    const candleSeries = mainChart.addCandlestickSeries({
      upColor: "#10B981",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#EF4444"
    });
    const sma7Series = mainChart.addLineSeries({ color: "#F4F7FB", lineWidth: 2, title: "SMA 7" });
    const sma21Series = mainChart.addLineSeries({ color: "#3B82F6", lineWidth: 2, title: "SMA 21" });
    const sma50Series = mainChart.addLineSeries({ color: "#F59E0B", lineWidth: 2, title: "SMA 50" });

    const volumeChart = createChart(volumeContainerRef.current, {
      height: 140,
      layout: { background: { color: "#111A27" }, textColor: "#A8B3C5" },
      grid: { vertLines: { color: "#1C2A3B" }, horzLines: { color: "#1C2A3B" } },
      rightPriceScale: { borderColor: "#26364A" },
      timeScale: { borderColor: "#26364A" }
    });
    const volumeSeries = volumeChart.addHistogramSeries({
      color: "#26364A",
      priceFormat: { type: "volume" }
    });
    const volMa5Series = volumeChart.addLineSeries({ color: "#22D3EE", lineWidth: 1 });
    const volMa10Series = volumeChart.addLineSeries({ color: "#F59E0B", lineWidth: 1 });

    const indicatorChart = createChart(indicatorContainerRef.current, {
      height: 150,
      layout: { background: { color: "#111A27" }, textColor: "#A8B3C5" },
      grid: { vertLines: { color: "#1C2A3B" }, horzLines: { color: "#1C2A3B" } },
      rightPriceScale: { borderColor: "#26364A" },
      timeScale: { borderColor: "#26364A" }
    });
    const diPlusSeries = indicatorChart.addLineSeries({ color: "#10B981", lineWidth: 2, title: "DI+" });
    const diMinusSeries = indicatorChart.addLineSeries({ color: "#EF4444", lineWidth: 2, title: "DI-" });
    const adxSeries = indicatorChart.addLineSeries({ color: "#22D3EE", lineWidth: 2, title: "ADX" });

    chartRefs.current = {
      main: mainChart,
      volume: volumeChart,
      indicator: indicatorChart,
      candleSeries,
      sma7Series,
      sma21Series,
      sma50Series,
      volumeSeries,
      volMa5Series,
      volMa10Series,
      diPlusSeries,
      diMinusSeries,
      adxSeries,
      priceLines: [],
      zoneSeries: []
    };

    const handleCrosshairMove = (param) => {
      if (!param || !param.time) {
        setChartLegend(null);
        return;
      }
      const seriesData = param.seriesData.get(candleSeries);
      if (!seriesData) {
        setChartLegend(null);
        return;
      }
      const timeMs = typeof param.time === "number" ? param.time * 1000 : null;
      const open = seriesData.open ?? seriesData.value ?? 0;
      const close = seriesData.close ?? seriesData.value ?? 0;
      const changePct = open ? ((close - open) / open) * 100 : 0;
      setChartLegend({
        time: timeMs,
        open,
        high: seriesData.high ?? open,
        low: seriesData.low ?? open,
        close,
        changePct
      });
    };

    const handleChartClick = (param) => {
      if (!param || !param.time) {
        return;
      }
      const timeSec = typeof param.time === "number" ? param.time : param.time?.timestamp;
      if (!timeSec) {
        return;
      }
      const details = findMarkerDetails(timeSec, markerDetailsRef.current, chartTfRef.current);
      if (details) {
        setChartDetails(details);
      }
    };

    mainChart.subscribeCrosshairMove(handleCrosshairMove);
    mainChart.subscribeClick(handleChartClick);

    const handleResize = () => {
      const mainWidth = chartContainerRef.current?.clientWidth ?? 0;
      const volumeWidth = volumeContainerRef.current?.clientWidth ?? 0;
      const indicatorWidth = indicatorContainerRef.current?.clientWidth ?? 0;
      if (mainWidth) {
        mainChart.applyOptions({ width: mainWidth });
      }
      if (volumeWidth) {
        volumeChart.applyOptions({ width: volumeWidth });
      }
      if (indicatorWidth) {
        indicatorChart.applyOptions({ width: indicatorWidth });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      mainChart.unsubscribeCrosshairMove(handleCrosshairMove);
      mainChart.unsubscribeClick(handleChartClick);
      mainChart.remove();
      volumeChart.remove();
      indicatorChart.remove();
    };
  }, []);

  useEffect(() => {
    chartTfRef.current = chartTf;
  }, [chartTf]);

  const buildAlertsQuery = () => {
    const params = new URLSearchParams();
    if (alertsFilters.symbol) params.set("symbol", alertsFilters.symbol);
    if (alertsFilters.tf) params.set("tf", alertsFilters.tf);
    if (alertsFilters.type) params.set("type", alertsFilters.type);
    if (alertsFilters.direction) params.set("direction", alertsFilters.direction);
    if (alertsFilters.notified !== "") params.set("notified", alertsFilters.notified);
    if (alertsFilters.sinceMs) params.set("since_ms", alertsFilters.sinceMs);
    params.set("limit", String(alertsLimit));
    params.set("offset", String(alertsOffset));
    return params.toString();
  };

  const fetchAlertsPage = async () => {
    try {
      const query = buildAlertsQuery();
      const data = await fetchJson(`/api/alerts?${query}`);
      setAlertsData(data);
      setAlertsError("");
    } catch (err) {
      setAlertsError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    fetchAlertsPage();
  }, [alertsFilters, alertsLimit, alertsOffset]);

  useEffect(() => {
    if (!alertsAutoRefresh) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (alertDetailsId) {
        return;
      }
      fetchAlertsPage();
    }, 15000);
    return () => clearInterval(timer);
  }, [alertsAutoRefresh, alertDetailsId, alertsFilters, alertsLimit, alertsOffset]);

  useEffect(() => {
    const loadPollerStatus = async () => {
      try {
        const data = await fetchAdminJson("/api/poller/status");
        setPollerStatus(data);
        setPollerError("");
      } catch (err) {
        setPollerError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadPollerStatus();
    const timer = setInterval(loadPollerStatus, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadIndicators = async () => {
      if (!selectedSymbol || !chartTf) {
        return;
      }
      try {
        const data = await fetchJson(`/api/indicators/${selectedSymbol}/${chartTf}?limit=200`);
        setIndicators(data);
        setIndicatorError("");
      } catch (err) {
        setIndicatorError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadIndicators();
  }, [selectedSymbol, chartTf]);

  useEffect(() => {
    const loadQuality = async () => {
      try {
        const data = await fetchJson("/api/quality/settings");
        setQualitySettings(data);
        setQualityError("");
      } catch (err) {
        setQualityError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadQuality();
  }, []);

  useEffect(() => {
    if (!isAdminConfigView) {
      return;
    }
    const loadTelegramSettings = async () => {
      try {
        const data = await fetchAdminJson("/api/telegram/settings");
        setTelegramSettings(data);
        setTelegramForm({
          enabled: Boolean(data.enabled),
          bot_token: "",
          chat_id: data.chat_id ?? ""
        });
        setTelegramSettingsError("");
      } catch (err) {
        setTelegramSettingsError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadTelegramSettings();
  }, [isAdminConfigView]);

  useEffect(() => {
    const loadSuppressed = async () => {
      try {
        const data = await fetchJson("/api/quality/suppressed?limit=20");
        setSuppressed(Array.isArray(data.items) ? data.items : []);
        setSuppressedError("");
      } catch (err) {
        setSuppressedError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadSuppressed();
    const timer = setInterval(loadSuppressed, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadLevels = async () => {
      if (!selectedSymbol) {
        return;
      }
      try {
        const data = await fetchJson(`/api/levels/${selectedSymbol}?debug=1&entry_tf=${levelsEntryTf}`);
        setLevels(data);
        setLevelsError("");
      } catch (err) {
        setLevelsError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadLevels();
  }, [selectedSymbol, levelsEntryTf]);

  useEffect(() => {
    const loadDiPeak = async () => {
      if (!selectedSymbol || !diTf) {
        return;
      }
      try {
        const data = await fetchJson(`/api/di_peak/${selectedSymbol}/${diTf}?window=${diWindow}`);
        setDiPeak(data);
        setDiPeakError("");
      } catch (err) {
        setDiPeakError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadDiPeak();
  }, [selectedSymbol, diTf, diWindow]);

  useEffect(() => {
    const loadVolume = async () => {
      if (!selectedSymbol || !volTf) {
        return;
      }
      try {
        const data = await fetchJson(`/api/volume/${selectedSymbol}/${volTf}?k=3`);
        setVolData(data);
        setVolError("");
      } catch (err) {
        setVolError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadVolume();
  }, [selectedSymbol, volTf]);

  useEffect(() => {
    const loadRsi = async () => {
      if (!selectedSymbol || !rsiTf) {
        return;
      }
      try {
        const data = await fetchJson(`/api/rsi/${selectedSymbol}/${rsiTf}`);
        setRsiData(data);
        setRsiError("");
      } catch (err) {
        setRsiError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadRsi();
  }, [selectedSymbol, rsiTf]);

  useEffect(() => {
    const loadLevelEvents = async () => {
      if (!selectedSymbol || !levelEventsTf) {
        return;
      }
      try {
        const data = await fetchJson(`/api/level_events/${selectedSymbol}/${levelEventsTf}?limit=300`);
        setLevelEvents(data);
        setLevelEventsError("");
      } catch (err) {
        setLevelEventsError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadLevelEvents();
  }, [selectedSymbol, levelEventsTf]);

  useEffect(() => {
    const loadSetupCandles = async () => {
      if (!selectedSymbol || !setupTf) {
        return;
      }
      try {
        const data = await fetchJson(`/api/setup_candles/${selectedSymbol}/${setupTf}?limit=300`);
        setSetupCandles(data);
        setSetupError("");
      } catch (err) {
        setSetupError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadSetupCandles();
  }, [selectedSymbol, setupTf]);

  useEffect(() => {
    const loadOpenings = async () => {
      if (!selectedSymbol || !openingsTf) {
        return;
      }
      try {
        const data = await fetchJson(`/api/openings/${selectedSymbol}/${openingsTf}?limit=300`);
        setOpenings(data);
        setOpeningsError("");
      } catch (err) {
        setOpeningsError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadOpenings();
  }, [selectedSymbol, openingsTf]);

  useEffect(() => {
    const loadChartDi = async () => {
      if (!selectedSymbol || !chartTf || !showDiWidget) {
        setChartDiPeak(null);
        setChartDiError("");
        return;
      }
      try {
        const data = await fetchJson(`/api/di_peak/${selectedSymbol}/${chartTf}?window=${diWindow}`);
        setChartDiPeak(data);
        setChartDiError("");
      } catch (err) {
        setChartDiError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadChartDi();
  }, [selectedSymbol, chartTf, showDiWidget, diWindow]);

  useEffect(() => {
    const loadChartRsi = async () => {
      if (!selectedSymbol || !chartTf || !showRsiWidget) {
        setChartRsi(null);
        setChartRsiError("");
        return;
      }
      try {
        const data = await fetchJson(`/api/rsi/${selectedSymbol}/${chartTf}`);
        setChartRsi(data);
        setChartRsiError("");
      } catch (err) {
        setChartRsiError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadChartRsi();
  }, [selectedSymbol, chartTf, showRsiWidget]);

  useEffect(() => {
    const loadChartVolume = async () => {
      if (!selectedSymbol || !chartTf || !showVolumeWidget) {
        setChartVol(null);
        setChartVolError("");
        return;
      }
      try {
        const data = await fetchJson(`/api/volume/${selectedSymbol}/${chartTf}?k=3`);
        setChartVol(data);
        setChartVolError("");
      } catch (err) {
        setChartVolError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    loadChartVolume();
  }, [selectedSymbol, chartTf, showVolumeWidget]);

  const fetchChartData = async () => {
    if (!selectedSymbol || !chartTf) {
      return;
    }
    if (replayItems.length > 0) {
      return;
    }
    if (chartAbortRef.current) {
      chartAbortRef.current.abort();
    }
    const controller = new AbortController();
    chartAbortRef.current = controller;
    setChartLoading(true);
    try {
      const candles = await fetchJson(`/api/candles/${selectedSymbol}/${chartTf}?limit=500`, {
        signal: controller.signal
      });
      setChartCandles(Array.isArray(candles) ? candles : []);
      setChartError("");

      const requests = await Promise.allSettled([
        fetchJson(`/api/levels/${selectedSymbol}?debug=1&entry_tf=${chartTf}`, { signal: controller.signal }),
        fetchJson(`/api/level_events/${selectedSymbol}/${chartTf}?limit=500`, { signal: controller.signal }),
        fetchJson(`/api/setup_candles/${selectedSymbol}/${chartTf}?limit=500`, { signal: controller.signal }),
        fetchJson(`/api/openings/${selectedSymbol}/${chartTf}?limit=500`, { signal: controller.signal })
      ]);

      const levels = requests[0].status === "fulfilled" ? requests[0].value : null;
      const levelEvents = requests[1].status === "fulfilled" ? requests[1].value : null;
      const setupCandles = requests[2].status === "fulfilled" ? requests[2].value : null;
      const openingsData = requests[3].status === "fulfilled" ? requests[3].value : null;

      setChartLevels(levels?.final_levels_detailed ?? []);
      setChartLevelEvents(levelEvents?.events ?? []);
      setChartSetupCandles(setupCandles?.items ?? []);
      setChartOpenings(openingsData?.signals ?? []);
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      setChartError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    fetchChartData();
  }, [selectedSymbol, chartTf, replayData]);

  useEffect(() => {
    setChartDetails(null);
  }, [selectedSymbol, chartTf, replayData]);

  useEffect(() => {
    setReplayRuns({});
    setReplayData(null);
    setReplaySummary(null);
    setReplayIndex(0);
    setReplayDetails(null);
  }, [selectedSymbol]);

  useEffect(() => {
    if (!chartAutoRefresh) {
      return undefined;
    }
    const timer = setInterval(() => {
      fetchChartData();
    }, 30000);
    return () => clearInterval(timer);
  }, [chartAutoRefresh, selectedSymbol, chartTf, replayData]);

  useEffect(() => {
    const replayItemsLocal = Array.isArray(replayData?.items) ? replayData.items : [];
    const replayItemLocal =
      replayItemsLocal.length > 0 ? replayItemsLocal[Math.min(replayIndex, replayItemsLocal.length - 1)] : null;
    const isReplayMode = replayItemsLocal.length > 0;
    if (!isReplayMode && (!chartCandles || chartCandles.length === 0)) {
      return;
    }
    const refs = chartRefs.current;
    if (!refs.candleSeries || !refs.sma7Series) {
      return;
    }
    const candles = isReplayMode ? buildReplayCandles(replayItemsLocal) : chartCandles;
    const candleSeries = toChartCandles(candles);
    refs.candleSeries.setData(candleSeries);
    const sma7 = showSma7 ? computeSmaSeries(candles, 7) : [];
    const sma21 = showSma7 ? computeSmaSeries(candles, 21) : [];
    const sma50 = showSma7 ? computeSmaSeries(candles, 50) : [];
    refs.sma7Series.setData(sma7);
    refs.sma21Series?.setData(sma21);
    refs.sma50Series?.setData(sma50);

    const volumeSeries = showVolumeWidget ? toVolumeSeries(candles) : [];
    const volMa5 = showVolumeWidget ? computeSmaSeries(candles, 5, "volume") : [];
    const volMa10 = showVolumeWidget ? computeSmaSeries(candles, 10, "volume") : [];
    refs.volumeSeries?.setData(volumeSeries);
    refs.volMa5Series?.setData(volMa5);
    refs.volMa10Series?.setData(volMa10);

    const dmi = showDiWidget ? computeDmiAdxSeries(candles) : { diPlus: [], diMinus: [], adx: [] };
    refs.diPlusSeries?.setData(dmi.diPlus);
    refs.diMinusSeries?.setData(dmi.diMinus);
    refs.adxSeries?.setData(dmi.adx);

    if (Array.isArray(refs.priceLines)) {
      refs.priceLines.forEach((line) => {
        try {
          refs.candleSeries.removePriceLine(line);
        } catch {
          // ignore
        }
      });
      refs.priceLines = [];
    }
    if (Array.isArray(refs.zoneSeries)) {
      refs.zoneSeries.forEach((series) => {
        try {
          refs.main.removeSeries(series);
        } catch {
          // ignore
        }
      });
      refs.zoneSeries = [];
    }

    const levels = isReplayMode ? buildReplayLevels(replayItemLocal) : chartLevels;
    const displayLevels = filterLevelsForChart(levels, candles);
    const timeRange = getTimeRange(candles);
    if (showZones) {
      displayLevels.forEach((level) => {
        if (!timeRange) {
          return;
        }
        const role = level.role ?? "mixed";
        const color =
          role === "support"
            ? "rgba(15, 107, 92, 0.12)"
            : role === "resistance"
              ? "rgba(122, 47, 47, 0.12)"
              : "rgba(122, 106, 69, 0.08)";
        const zoneSeries = refs.main.addAreaSeries({
          topColor: color,
          bottomColor: color,
          lineColor: color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          baseValue: { type: "price", price: level.zone_low }
        });
        zoneSeries.setData([
          { time: timeRange.start, value: level.zone_high },
          { time: timeRange.end, value: level.zone_high }
        ]);
        refs.zoneSeries.push(zoneSeries);
        const label = `${role === "support" ? "Support" : role === "resistance" ? "Resistance" : "Level"} ${Number(level.center).toFixed(2)}`;
        const line = refs.candleSeries.createPriceLine({
          price: level.center,
          color: role === "support" ? "#10B981" : role === "resistance" ? "#EF4444" : "#6F7D91",
          lineWidth: 1,
          axisLabelVisible: true,
          title: label
        });
        refs.priceLines.push(line);
      });
    }

    const markers = isReplayMode
      ? buildReplayMarkers(replayItemLocal?.signals ?? [])
      : buildWorkspaceMarkers(
          showLevelEvents ? chartLevelEvents : [],
          showSetupCandles ? chartSetupCandles : [],
          showOpenings ? chartOpenings : []
        );
    if (isReplayMode) {
      markerDetailsRef.current = new Map();
    } else {
      markerDetailsRef.current = buildMarkerDetailsMap(
        showLevelEvents ? chartLevelEvents : [],
        showSetupCandles ? chartSetupCandles : [],
        showOpenings ? chartOpenings : [],
        selectedSymbol,
        chartTf,
        chartCandles
      );
    }
    refs.candleSeries.setMarkers(markers);
    refs.main?.timeScale().fitContent();
    refs.volume?.timeScale().fitContent();
    refs.indicator?.timeScale().fitContent();
  }, [
    chartCandles,
    chartLevels,
    chartLevelEvents,
    chartSetupCandles,
    chartOpenings,
    replayData,
    replayIndex,
    selectedSymbol,
    chartTf,
    showZones,
    showSma7,
    showDiWidget,
    showLevelEvents,
    showSetupCandles,
    showOpenings,
    showVolumeWidget
  ]);

  const handleAddPinned = () => {
    const value = Number(pinnedInput);
    if (!Number.isFinite(value)) {
      return;
    }
    setWatchlist((prev) => updateOverrides(prev, selectedSymbol, "add", value));
    setPinnedInput("");
  };

  const handleAddDisabled = () => {
    const value = Number(disabledInput);
    if (!Number.isFinite(value)) {
      return;
    }
    setWatchlist((prev) => updateOverrides(prev, selectedSymbol, "disable", value));
    setDisabledInput("");
  };

  const handleRemovePinned = (value) => {
    setWatchlist((prev) => removeOverride(prev, selectedSymbol, "add", value));
  };

  const handleRemoveDisabled = (value) => {
    setWatchlist((prev) => removeOverride(prev, selectedSymbol, "disable", value));
  };

  const handleSaveLevels = async () => {
    if (!watchlist) {
      return;
    }
    try {
      await saveWatchlist(watchlist);
    } catch (err) {
      setLevelsError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleRefreshLevels = async () => {
    if (!selectedSymbol) {
      return;
    }
    try {
      const data = await fetchJson(`/api/levels/${selectedSymbol}?debug=1&entry_tf=${levelsEntryTf}`);
      setLevels(data);
      setLevelsError("");
    } catch (err) {
      setLevelsError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const saveWatchlist = async (nextWatchlist) => {
    await fetchJson("/api/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextWatchlist)
    });
    const refreshed = await fetchJson("/api/watchlist");
    setWatchlist(refreshed);
    const updatedSymbols = refreshed?.symbols ? refreshed.symbols.map((item) => item.symbol) : [];
    setSymbols(updatedSymbols);
    if (selectedSymbol && !updatedSymbols.includes(selectedSymbol)) {
      setSelectedSymbol(updatedSymbols[0] ?? "");
    }
    if (selectedSymbol) {
      const updatedLevels = await fetchJson(`/api/levels/${selectedSymbol}?entry_tf=${levelsEntryTf}`);
      setLevels(updatedLevels);
    }
    setWatchlistSaveStatus("Saved");
  };

  const handleToggleWatchlistTf = (tf) => {
    setWatchlistFormTfs((prev) => {
      if (prev.includes(tf)) {
        return prev.filter((item) => item !== tf);
      }
      return [...prev, tf];
    });
  };

  const handleAddWatchlistSymbol = async () => {
    if (!watchlist) {
      return;
    }
    setWatchlistFormError("");
    setWatchlistSaveStatus("");
    const symbol = watchlistFormSymbol.trim().toUpperCase();
    const validationError = validateWatchlistSymbol(symbol);
    if (validationError) {
      setWatchlistFormError(validationError);
      return;
    }
    const validTfs = watchlistFormTfs.filter((tf) => watchlistTfOptions.includes(tf));
    if (validTfs.length === 0) {
      setWatchlistFormError("Select at least one timeframe.");
      return;
    }
    if (validTfs.length !== watchlistFormTfs.length) {
      setWatchlistFormError("Invalid timeframe selection.");
      return;
    }
    if (watchlist.symbols?.some((item) => item.symbol === symbol)) {
      setWatchlistFormError("Symbol already exists.");
      return;
    }
    const updated = structuredClone(watchlist);
    updated.symbols = [...(updated.symbols ?? []), buildWatchlistSymbolEntry(updated.symbols?.[0], symbol, validTfs)];
    try {
      await saveWatchlist(updated);
      setWatchlistFormSymbol("");
      setWatchlistFormTfs(watchlistDefaultTfs);
      setWatchlistSaveStatus(`Added ${symbol}.`);
    } catch (err) {
      setWatchlistFormError(err instanceof Error ? err.message : "Failed to save watchlist.");
    }
  };

  const handleAddWatchlistSymbolsBulk = async () => {
    if (!watchlist) {
      return;
    }
    setWatchlistFormError("");
    setWatchlistSaveStatus("");
    const validTfs = watchlistFormTfs.filter((tf) => watchlistTfOptions.includes(tf));
    if (validTfs.length === 0) {
      setWatchlistFormError("Select at least one timeframe.");
      return;
    }
    const parsed = parseWatchlistSymbolInput(watchlistBulkSymbols);
    if (parsed.length === 0) {
      setWatchlistFormError("Paste at least one symbol.");
      return;
    }

    const existing = new Set((watchlist.symbols ?? []).map((item) => item.symbol));
    const updated = structuredClone(watchlist);
    const added = [];
    const duplicates = [];
    const invalid = [];
    parsed.forEach((raw) => {
      const symbol = raw.toUpperCase();
      const errorMessage = validateWatchlistSymbol(symbol);
      if (errorMessage) {
        invalid.push(symbol);
        return;
      }
      if (existing.has(symbol)) {
        duplicates.push(symbol);
        return;
      }
      updated.symbols = [
        ...(updated.symbols ?? []),
        buildWatchlistSymbolEntry(updated.symbols?.[0], symbol, validTfs)
      ];
      existing.add(symbol);
      added.push(symbol);
    });

    if (added.length === 0) {
      setWatchlistFormError("No symbols were added. Check duplicates/format.");
      return;
    }

    try {
      await saveWatchlist(updated);
      setWatchlistBulkSymbols("");
      const skipped = duplicates.length + invalid.length;
      setWatchlistSaveStatus(
        `Added ${added.length} symbol(s).${skipped > 0 ? ` Skipped ${skipped} (duplicates/invalid).` : ""}`
      );
    } catch (err) {
      setWatchlistFormError(err instanceof Error ? err.message : "Failed to save watchlist.");
    }
  };

  const handleRemoveWatchlistSymbol = async (symbol) => {
    if (!watchlist) {
      return;
    }
    setWatchlistFormError("");
    setWatchlistSaveStatus("");
    const updated = structuredClone(watchlist);
    updated.symbols = (updated.symbols ?? []).filter((item) => item.symbol !== symbol);
    if (updated.symbols.length === 0) {
      setWatchlistFormError("Watchlist must contain at least one symbol.");
      return;
    }
    try {
      await saveWatchlist(updated);
      setWatchlistSelectedSymbols((prev) => prev.filter((item) => item !== symbol));
      setWatchlistSaveStatus(`Removed ${symbol}.`);
    } catch (err) {
      setWatchlistFormError(err instanceof Error ? err.message : "Failed to save watchlist.");
    }
  };

  const handleToggleWatchlistSelection = (symbol) => {
    setWatchlistSelectedSymbols((prev) => {
      if (prev.includes(symbol)) {
        return prev.filter((item) => item !== symbol);
      }
      return [...prev, symbol];
    });
  };

  const handleSelectAllVisibleWatchlistSymbols = () => {
    setWatchlistSelectedSymbols((prev) => {
      const next = new Set(prev);
      filteredWatchlistItems.forEach((item) => next.add(item.symbol));
      return Array.from(next);
    });
  };

  const handleClearWatchlistSelection = () => {
    setWatchlistSelectedSymbols([]);
  };

  const handleRemoveSelectedWatchlistSymbols = async () => {
    if (!watchlist || watchlistSelectedSymbols.length === 0) {
      return;
    }
    setWatchlistFormError("");
    setWatchlistSaveStatus("");
    const selected = new Set(watchlistSelectedSymbols);
    const currentCount = (watchlist.symbols ?? []).length;
    const nextCount = currentCount - selected.size;
    if (nextCount < 1) {
      setWatchlistFormError("Watchlist must contain at least one symbol.");
      return;
    }
    if (!window.confirm(`Remove ${selected.size} selected symbol(s)?`)) {
      return;
    }
    const updated = structuredClone(watchlist);
    updated.symbols = (updated.symbols ?? []).filter((item) => !selected.has(item.symbol));
    try {
      await saveWatchlist(updated);
      setWatchlistSelectedSymbols([]);
      setWatchlistSaveStatus(`Removed ${selected.size} symbol(s).`);
    } catch (err) {
      setWatchlistFormError(err instanceof Error ? err.message : "Failed to save watchlist.");
    }
  };

  const handleSelectWatchlistSymbol = (symbol) => {
    setSelectedSymbol(symbol);
    const entry = watchlist?.symbols?.find((item) => item.symbol === symbol);
    const entryTfs = Array.isArray(entry?.entry_tfs) && entry.entry_tfs.length > 0 ? entry.entry_tfs : watchlistDefaultTfs;
    if (entryTfs.length > 0) {
      setChartTf(entryTfs[0]);
    }
  };

  const handleToggleWatchlistEntryTf = async (symbol, tf) => {
    if (!watchlist) {
      return;
    }
    setWatchlistFormError("");
    setWatchlistSaveStatus("");
    if (!watchlistTfOptions.includes(tf)) {
      setWatchlistFormError("Invalid timeframe selection.");
      return;
    }
    const updated = structuredClone(watchlist);
    const entry = updated.symbols?.find((item) => item.symbol === symbol);
    if (!entry) {
      return;
    }
    const current = Array.isArray(entry.entry_tfs) && entry.entry_tfs.length > 0 ? entry.entry_tfs : watchlistDefaultTfs;
    const nextTfs = current.includes(tf) ? current.filter((item) => item !== tf) : [...current, tf];
    if (nextTfs.length === 0) {
      setWatchlistFormError("Select at least one timeframe.");
      return;
    }
    entry.entry_tfs = nextTfs;
    try {
      await saveWatchlist(updated);
    } catch (err) {
      setWatchlistFormError(err instanceof Error ? err.message : "Failed to save watchlist.");
    }
  };

  const handleToggleWatchlistRule = async (symbol, ruleKey) => {
    if (!watchlist) {
      return;
    }
    setWatchlistFormError("");
    setWatchlistSaveStatus("");
    const updated = structuredClone(watchlist);
    const entry = updated.symbols?.find((item) => item.symbol === symbol);
    if (!entry) {
      return;
    }
    entry.rules = normalizeWatchlistRules(entry.rules);
    entry.rules[ruleKey] = !entry.rules[ruleKey];
    try {
      await saveWatchlist(updated);
    } catch (err) {
      setWatchlistFormError(err instanceof Error ? err.message : "Failed to save watchlist.");
    }
  };

  const handleSaveQuality = async () => {
    if (!qualitySettings) {
      return;
    }
    try {
      const data = await fetchJson("/api/quality/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qualitySettings)
      });
      setQualitySettings(data.quality ?? qualitySettings);
      setQualitySaveStatus("Saved");
      setQualityError("");
    } catch (err) {
      setQualityError(err instanceof Error ? err.message : "Unknown error");
      setQualitySaveStatus("");
    }
  };

  const handleSetPollerMode = async (mode) => {
    try {
      const data = await fetchAdminJson("/api/poller/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      setPollerStatus(data);
      setPollerError("");
    } catch (err) {
      setPollerError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleSaveTelegramSettings = async () => {
    setTelegramSettingsStatus("");
    setTelegramSettingsError("");
    try {
      const data = await fetchAdminJson("/api/telegram/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramForm)
      });
      const settings = data.telegram ?? data;
      setTelegramSettings(settings);
      setTelegramForm({
        enabled: Boolean(settings.enabled),
        bot_token: "",
        chat_id: settings.chat_id ?? ""
      });
      setTelegramSettingsStatus("Saved");
    } catch (err) {
      setTelegramSettingsError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleSendTelegramTest = async () => {
    try {
      const payload = telegramText ? { text: telegramText } : {};
      const data = await fetchAdminJson("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const message = data.ok ? "Sent" : `Failed: ${data.error ?? "Unknown error"}`;
      setTelegramFeedback({ ok: data.ok, message });
    } catch (err) {
      const message = err instanceof Error ? `Failed: ${err.message}` : "Failed: Unknown error";
      setTelegramFeedback({ ok: false, message });
    }
  };

  const handleRefreshSettings = async () => {
    setError("");
    try {
      const [watchlistData, symbolsData, qualityData] = await Promise.all([
        fetchJson("/api/watchlist"),
        fetchJson("/api/symbols"),
        fetchJson("/api/quality/settings")
      ]);
      setWatchlist(watchlistData);
      const apiSymbols = Array.isArray(symbolsData.symbols) ? symbolsData.symbols.map((item) => item.symbol) : [];
      const fallbackSymbols = watchlistData?.symbols ? watchlistData.symbols.map((item) => item.symbol) : [];
      setSymbols(apiSymbols.length > 0 ? apiSymbols : fallbackSymbols);
      setQualitySettings(qualityData);
      setQualityError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings");
    }

    try {
      const data = await fetchAdminJson("/api/poller/status");
      setPollerStatus(data);
      setPollerError("");
    } catch (err) {
      setPollerError(err instanceof Error ? err.message : "Unknown error");
    }

    try {
      const data = await fetchAdminJson("/api/telegram/settings");
      setTelegramSettings(data);
      setTelegramForm({
        enabled: Boolean(data.enabled),
        bot_token: "",
        chat_id: data.chat_id ?? ""
      });
      setTelegramSettingsError("");
    } catch (err) {
      setTelegramSettingsError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleSaveAdminTokenDraft = () => {
    setAdminToken(adminTokenDraft.trim());
  };

  const handleClearAdminTokenDraft = () => {
    setAdminToken("");
    setAdminTokenDraft("");
  };

  const handleReplayQuickRange = (hours) => {
    const now = Date.now();
    setReplayFromMs(formatDateTimeLocal(now - hours * 60 * 60 * 1000));
    setReplayToMs(formatDateTimeLocal(now));
  };

  const handleReplayRun = async () => {
    if (!selectedSymbol) {
      return;
    }
    setReplayError("");
    setReplayLoading(true);
    try {
      const fromMs = parseDateTimeLocalMs(replayFromMs);
      const toMs = parseDateTimeLocalMs(replayToMs);
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
        throw new Error("Select valid From and To date/time values.");
      }
      if (fromMs >= toMs) {
        throw new Error("From must be before To.");
      }
      const params = new URLSearchParams({
        from_ms: String(fromMs),
        to_ms: String(toMs),
        step: String(replayStep),
        warmup: String(replayWarmup),
        debug: "1"
      });
      const runResults = await Promise.allSettled(
        REPLAY_ENTRY_TFS.map(async (tf) => {
          const [summary, data] = await Promise.all([
            fetchJson(`/api/replay_summary/${selectedSymbol}/${tf}?${params}`),
            fetchJson(`/api/replay/${selectedSymbol}/${tf}?${params}`)
          ]);
          return [tf, { summary, data }];
        })
      );
      const nextRuns = {};
      const errors = [];
      runResults.forEach((result, idx) => {
        const tf = REPLAY_ENTRY_TFS[idx];
        if (result.status === "fulfilled") {
          const [resolvedTf, payload] = result.value;
          nextRuns[resolvedTf] = payload;
        } else {
          errors.push(`${tf}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        }
      });
      if (Object.keys(nextRuns).length === 0) {
        throw new Error(errors.join(" | ") || "Replay failed for all entry timeframes.");
      }
      setReplayRuns(nextRuns);
      const activeRun = nextRuns[replayTf] ?? nextRuns[REPLAY_ENTRY_TFS[0]];
      setChartTf(activeRun.data?.tf ?? replayTf);
      setReplaySummary(activeRun.summary);
      setReplayData(activeRun.data);
      const items = Array.isArray(activeRun.data?.items) ? activeRun.data.items : [];
      setReplayIndex(items.length > 0 ? items.length - 1 : 0);
      setReplayDetails(null);
      if (errors.length > 0) {
        setReplayError(`Partial replay loaded. ${errors.join(" | ")}`);
      }
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : "Replay failed.");
    } finally {
      setReplayLoading(false);
    }
  };

  const replayItems = Array.isArray(replayData?.items) ? replayData.items : [];
  const replayItem = replayItems[replayIndex];
  const replayRunEntries = useMemo(() => Object.entries(replayRuns || {}), [replayRuns]);
  const replayTfSummaries = useMemo(
    () => REPLAY_ENTRY_TFS.map((tf) => ({ tf, summary: replayRuns?.[tf]?.summary ?? null })),
    [replayRuns]
  );
  const backendReplayTrades = useMemo(() => {
    if (replayRunEntries.length === 0) {
      return replaySummary?.performance?.trade_rows;
    }
    const rows = [];
    replayRunEntries.forEach(([tf, run]) => {
      const tradeRows = run?.summary?.performance?.trade_rows;
      if (!Array.isArray(tradeRows)) {
        return;
      }
      tradeRows.forEach((trade) => rows.push({ ...trade, tf: trade.tf ?? tf }));
    });
    return rows;
  }, [replayRunEntries, replaySummary]);
  const replayTradeOutcomes = useMemo(
    () =>
      Array.isArray(backendReplayTrades)
        ? [...backendReplayTrades].sort((a, b) => Number(b.signal_time ?? 0) - Number(a.signal_time ?? 0))
        : buildReplayTradeOutcomes(replayItems, replayData?.symbol, replayData?.tf),
    [backendReplayTrades, replayItems, replayData?.symbol, replayData?.tf]
  );
  const replayTradeRows = useMemo(() => {
    let rows = [...replayTradeOutcomes];
    if (replaySideFilter !== "all") {
      rows = rows.filter((item) => item.direction === replaySideFilter);
    }
    if (replayOutcomeFilter !== "all") {
      rows = rows.filter((item) => item.outcome === replayOutcomeFilter);
    }
    rows.sort((a, b) => {
      if (replaySortBy === "time_asc") {
        return a.signal_time - b.signal_time;
      }
      if (replaySortBy === "time_desc") {
        return b.signal_time - a.signal_time;
      }
      if (replaySortBy === "max_rr_desc") {
        return b.max_rr - a.max_rr;
      }
      if (replaySortBy === "max_dd_desc") {
        return b.max_drawdown_r - a.max_drawdown_r;
      }
      if (replaySortBy === "duration_rr2_asc") {
        return compareNullableNumber(a.time_to_rr2_ms, b.time_to_rr2_ms);
      }
      if (replaySortBy === "direction") {
        const rank = { long: 0, short: 1 };
        return (rank[a.direction] ?? 9) - (rank[b.direction] ?? 9) || b.signal_time - a.signal_time;
      }
      return b.signal_time - a.signal_time;
    });
    return rows;
  }, [replayTradeOutcomes, replaySideFilter, replayOutcomeFilter, replaySortBy]);
  const replayTradeStats = useMemo(() => summarizeReplayOutcomes(replayTradeRows), [replayTradeRows]);
  const replayTradeStatsByTf = useMemo(
    () =>
      REPLAY_ENTRY_TFS.map((tf) => ({
        tf,
        stats: summarizeReplayOutcomes(replayTradeOutcomes.filter((trade) => trade.tf === tf)),
      })),
    [replayTradeOutcomes]
  );
  const replayWindowLabel = useMemo(() => {
    const fromMs = parseDateTimeLocalMs(replayFromMs);
    const toMs = parseDateTimeLocalMs(replayToMs);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      return "-";
    }
    return `${formatTimestamp(fromMs)} -> ${formatTimestamp(toMs)} (${formatDurationMs(toMs - fromMs)})`;
  }, [replayFromMs, replayToMs]);

  useEffect(() => {
    const run = replayRuns?.[replayTf];
    if (!run) {
      return;
    }
    setReplaySummary(run.summary);
    setReplayData(run.data);
    setChartTf(run.data?.tf ?? replayTf);
    const items = Array.isArray(run.data?.items) ? run.data.items : [];
    setReplayIndex(items.length > 0 ? items.length - 1 : 0);
    setReplayDetails(null);
  }, [replayTf, replayRuns]);

  const handleReplaySignalClick = (signal) => {
    setReplayDetails(signal);
  };

  const handleAlertFilterChange = (key, value) => {
    setAlertsFilters((prev) => ({ ...prev, [key]: value }));
    setAlertsOffset(0);
  };

  const handleQuickRange = (hours) => {
    const sinceMs = Date.now() - hours * 60 * 60 * 1000;
    handleAlertFilterChange("sinceMs", String(sinceMs));
  };

  const handleClearRange = () => {
    handleAlertFilterChange("sinceMs", "");
  };

  const handleExportCsv = () => {
    const query = buildAlertsQuery();
    const url = `/api/alerts/export.csv?${query}`;
    window.open(url, "_blank", "noopener");
  };

  const handleAlertRowClick = async (alertId) => {
    if (!alertId) {
      return;
    }
    try {
      setAlertDetailsId(alertId);
      const data = await fetchJson(`/api/alerts/${alertId}`);
      setAlertDetails(data);
      setAlertDetailsError("");
    } catch (err) {
      setAlertDetailsError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleCloseDetails = () => {
    setAlertDetailsId(null);
    setAlertDetails(null);
    setAlertDetailsError("");
  };

  const handleCopyText = async (text) => {
    if (!text) {
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      window.prompt("Copy to clipboard:", text);
    }
  };

  const alertsItems = Array.isArray(alertsData.items) ? alertsData.items : [];
  const alertSearchTerm = alertsSearch.trim().toLowerCase();
  const filteredAlerts = alertSearchTerm
    ? alertsItems.filter((item) => {
        const haystack = [
          item.symbol,
          item.type,
          item.direction,
          item.level,
          item.notify_error
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(alertSearchTerm);
      })
    : alertsItems;
  const showingStart = filteredAlerts.length > 0 ? alertsOffset + 1 : 0;
  const showingEnd = alertsOffset + filteredAlerts.length;
  const totalAlerts = alertsData.total ?? 0;

  const suppressedReasons = [
    "all",
    ...Array.from(new Set(suppressed.map((item) => item.reason).filter(Boolean)))
  ];
  const filteredSuppressed =
    suppressedReason === "all"
      ? suppressed
      : suppressed.filter((item) => item.reason === suppressedReason);
  const nowMs = Date.now();
  const alerts24h = alertsItems.filter((alert) => getAlertTimeMs(alert) >= nowMs - 24 * 60 * 60 * 1000).length;
  const activeAlerts = alertsItems.filter((alert) => !alert.notified && !alert.notify_error).length;
  const alertErrors = alertsItems.filter((alert) => alert.notify_error).length + (pollerStatus?.last_error ? 1 : 0);
  const scannerStatusTone = getPollerStatusTone(pollerStatus);
  const scannerStatusLabel = getPollerStatusLabel(pollerStatus);
  const lastSyncTime = pollerStatus?.last_scan_at ?? pollerStatus?.last_tick_at ?? null;
  const activeTimeframes = Array.from(
    new Set(
      watchlistItems.flatMap((item) =>
        Array.isArray(item.entry_tfs) && item.entry_tfs.length > 0 ? item.entry_tfs : watchlistDefaultTfs
      )
    )
  );
  const enabledWatchlistCount = watchlistItems.filter((item) => item.enabled !== false).length;
  const activeRuleLabels = watchlistRuleOptions
    .filter(([ruleKey]) => watchlistItems.some((item) => normalizeWatchlistRules(item.rules)[ruleKey]))
    .map(([, label]) => label);
  const settingsNav = [
    ["watchlist", "Watchlist", "Symbols and monitored markets"],
    ["scanner", "Scanner", "Runtime and market monitoring"],
    ["strategies", "Strategies", "Signal rules and filters"],
    ["risk", "Risk", "Paper trade assumptions"],
    ["alerts", "Alerts", "Severity, cooldowns, delivery"],
    ["integrations", "Integrations", "External services"],
    ["system", "System/Admin", "Protected tools and debug"]
  ];
  const operationalLogs = buildOperationalLogs({ pollerStatus, suppressed, alertsItems });
  const opsLogSources = ["all", ...Array.from(new Set(operationalLogs.map((item) => item.source).filter(Boolean)))];
  const filteredOperationalLogs = operationalLogs.filter((item) => {
    const search = opsLogSearch.trim().toLowerCase();
    const matchesSearch =
      !search ||
      [item.message, item.source, item.symbol, item.traceId, item.level]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    const matchesLevel = opsLogLevel === "all" || item.level === opsLogLevel;
    const matchesSource = opsLogSource === "all" || item.source === opsLogSource;
    return matchesSearch && matchesLevel && matchesSource;
  });
  const incidentLogs = operationalLogs.filter((item) => ["WARN", "ERROR", "CRITICAL"].includes(item.level)).slice(0, 6);
  const serviceRows = buildServiceRows({
    pollerStatus,
    telegramSettings,
    scannerStatusLabel,
    scannerStatusTone,
    lastSyncTime,
    alertErrors,
    symbolsCount: watchlistItems.length || symbols.length
  });
  const latestAlert = alertDetails ?? filteredAlerts[0] ?? null;
  const supportLevels = getLevelsByRole(levels, "support");
  const resistanceLevels = getLevelsByRole(levels, "resistance");
  const keyLevel = latestAlert?.level ?? chartDetails?.level ?? levels?.final_levels?.[0] ?? "-";
  const pinnedLevels = getOverrides(watchlist, selectedSymbol, "add");
  const disabledLevels = getOverrides(watchlist, selectedSymbol, "disable");
  const effectiveLevels = buildEffectiveLevelItems(levels, pinnedLevels, disabledLevels);
  const activeSupportCount = effectiveLevels.filter((level) => level.role === "support").length;
  const activeResistanceCount = effectiveLevels.filter((level) => level.role === "resistance").length;
  const overrideCount = pinnedLevels.length + disabledLevels.length;
  const isReplayActive = replayItems.length > 0;
  const workspaceSignals = buildWorkspaceSignalRows(
    showLevelEvents ? chartLevelEvents : [],
    showSetupCandles ? chartSetupCandles : [],
    showOpenings ? chartOpenings : [],
    selectedSymbol,
    chartTf
  );
  const replayLegend = isReplayActive ? buildLegendFromCandle(replayItem?.candle, replayItem?.time) : null;
  const liveLegend =
    !isReplayActive && chartCandles.length > 0 ? buildLegendFromCandle(chartCandles[chartCandles.length - 1]) : null;
  const chartLegendDisplay = chartLegend ?? replayLegend ?? liveLegend;
  const showDashboard = view === "dashboard";
  const showReplay = view === "replay";
  const showLevels = view === "levels";
  const showSettings = view === "settings";
  const showOps = view === "ops";
  const showLegacyDashboardSections = false;
  return (
    <div className={`app ${showDashboard ? "signals-page" : showReplay ? "replay-page" : showLevels ? "levels-page" : showSettings ? "settings-page" : showOps ? "ops-page" : ""}`}>
      {error ? <div className="error">{error}</div> : null}
      {showDashboard ? (
        <>
          <PageHeader
            title="Signals"
            eyebrow="Live monitoring"
            actions={
              <>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    fetchChartData();
                    fetchAlertsPage();
                  }}
                  disabled={chartLoading}
                >
                  Refresh
                </button>
                <label className="checkbox toggle-control">
                  <input
                    type="checkbox"
                    checked={alertsAutoRefresh}
                    onChange={(event) => setAlertsAutoRefresh(event.target.checked)}
                  />
                  <span>Auto-refresh</span>
                </label>
                <button className="btn btn-secondary" type="button" onClick={() => window.open(getBinanceLink(selectedSymbol), "_blank", "noopener")}>
                  Open Binance
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => window.open(getTradingViewLink(selectedSymbol), "_blank", "noopener")}>
                  Open TradingView
                </button>
              </>
            }
          >
            Live Binance USDT perpetual alert monitoring
          </PageHeader>
          <div className="metric-strip">
            <MetricCard label="Scanner status" value={scannerStatusLabel} tone={scannerStatusTone === "danger" ? "danger" : scannerStatusTone === "warning" ? "warning" : "success"} />
            <MetricCard label="Symbols monitored" value={watchlistItems.length || symbols.length || "-"} />
            <MetricCard label="Alerts 24h" value={alerts24h} />
            <MetricCard label="Active alerts" value={activeAlerts} tone="success" />
            <MetricCard label="Errors" value={alertErrors} tone={alertErrors > 0 ? "danger" : "default"} />
            <MetricCard label="Last sync" value={lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : "-"} />
          </div>
        </>
      ) : null}
      {showReplay ? (
        <>
          <PageHeader
            title="Replay Lab"
            eyebrow="Historical simulation"
            actions={
              <>
                <button className="btn" type="button" onClick={handleReplayRun} disabled={replayLoading}>
                  {replayLoading ? "Running..." : "Run Replay"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => window.open(getTradingViewLink(selectedSymbol), "_blank", "noopener")}>
                  Open TradingView
                </button>
              </>
            }
          >
            Rebuild alert context across historical windows without changing live scanner state.
          </PageHeader>
          <div className="metric-strip">
            <MetricCard label="Replay steps" value={replaySummary?.total_steps ?? "-"} />
            <MetricCard label="Signals" value={replaySummary?.signals_total ?? "-"} />
            <MetricCard label="Trades" value={replayTradeStats.total ?? 0} />
            <MetricCard label="Win rate" value={formatPercentFraction(replayTradeStats.win_rate)} tone="success" />
            <MetricCard label="Total R" value={formatNumber(replayTradeStats.realized_r_total)} />
            <MetricCard label="Window" value={replayItems.length > 0 ? `${replayIndex + 1}/${replayItems.length}` : "-"} />
          </div>
        </>
      ) : null}
      {showLevels ? (
        <>
          <PageHeader
            title="Active S/R"
            eyebrow="Market structure"
            actions={
              <>
                <button className="btn btn-secondary" type="button" onClick={handleRefreshLevels}>
                  Refresh
                </button>
                <button className="btn" type="button" onClick={handleSaveLevels}>
                  Save Overrides
                </button>
              </>
            }
          >
            Live support and resistance levels used by the scanner.
          </PageHeader>

          <section className="card levels-filter-card">
            <h2>Controls</h2>
            <div className="levels-filter-bar">
              <label className="field">
                <span>Symbol</span>
                <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
                  {symbols.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Entry timeframe</span>
                <select value={levelsEntryTf} onChange={(event) => setLevelsEntryTf(event.target.value)}>
                  <option value="15m">15m uses 4H S/R</option>
                  <option value="1h">1h uses Daily S/R</option>
                </select>
              </label>
              <button className="btn btn-secondary" type="button" onClick={handleRefreshLevels}>
                Refresh
              </button>
              <span className="levels-last-updated">
                Last updated {lastSyncTime ? formatTimestamp(lastSyncTime) : "-"}
              </span>
            </div>
          </section>

          <div className="metric-strip levels-metrics">
            <MetricCard label="Current symbol" value={selectedSymbol || "-"} />
            <MetricCard label="Entry timeframe" value={levelsEntryTf || "-"} />
            <MetricCard
              label="HTF source / close"
              value={levels?.htf_timeframe ?? "-"}
              detail={`Close ${formatNumber(levels?.last_close_used)}`}
            />
            <MetricCard label="Active supports" value={levels ? activeSupportCount : "-"} tone="success" />
            <MetricCard label="Active resistances" value={levels ? activeResistanceCount : "-"} tone="danger" />
            <MetricCard label="Overrides" value={overrideCount} />
          </div>
        </>
      ) : null}
      {showSettings ? (
        <>
          <PageHeader
            title="Settings"
            eyebrow="Control center"
            actions={
              <button className="btn btn-secondary" type="button" onClick={handleRefreshSettings}>
                Refresh
              </button>
            }
          >
            Configure scanner behavior, watchlists, strategy rules, alerts, and system tools.
          </PageHeader>

          <div className="settings-layout">
            <SettingsRail sections={settingsNav} active={settingsSection} onSelect={setSettingsSection} />
            <div className="settings-content">
              {error ? (
                <ErrorState title="Could not load settings" onRetry={handleRefreshSettings} onViewLogs={() => window.location.assign("/ops")}>
                  Check the bot service status or retry the request.
                </ErrorState>
              ) : null}
              {watchlistFormError ? <div className="error">{watchlistFormError}</div> : null}
              {watchlistSaveStatus ? <div className="settings-feedback">{watchlistSaveStatus}</div> : null}

              {settingsSection === "watchlist" ? (
                <>
                  <section className="card settings-card">
                    <div className="card-header">
                      <div>
                        <h2>Watchlist</h2>
                        <span className="muted">Manage symbols monitored by the scanner.</span>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="metric-strip settings-metrics">
                        <MetricCard label="Total symbols" value={watchlistItems.length || "-"} />
                        <MetricCard label="Enabled symbols" value={enabledWatchlistCount || "-"} tone="success" />
                        <MetricCard label="Active timeframes" value={activeTimeframes.length ? activeTimeframes.join(", ") : "-"} />
                        <MetricCard label="Rules enabled" value={activeRuleLabels.length ? activeRuleLabels.join(", ") : "-"} />
                      </div>
                    </div>
                  </section>

                  <section className="card settings-card">
                    <div className="card-header">
                      <h2>Add Symbols</h2>
                    </div>
                    <div className="card-body">
                      <div className="settings-form-grid">
                        <label className="field">
                          <span>Add symbol</span>
                          <input
                            type="text"
                            value={watchlistFormSymbol}
                            onChange={(event) => setWatchlistFormSymbol(event.target.value.toUpperCase())}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                handleAddWatchlistSymbol();
                              }
                            }}
                            placeholder="BTCUSDT"
                          />
                        </label>
                        <div className="field">
                          <span>Default timeframes</span>
                          <div className="settings-chip-row">
                            {watchlistTfOptions.map((tf) => (
                              <label key={`tf-${tf}`} className="settings-chip settings-chip-control">
                                <input
                                  type="checkbox"
                                  checked={watchlistFormTfs.includes(tf)}
                                  onChange={() => handleToggleWatchlistTf(tf)}
                                />
                                <span>{tf}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="settings-action-cell">
                          <button className="btn" type="button" onClick={handleAddWatchlistSymbol}>
                            Add symbol
                          </button>
                        </div>
                      </div>
                      <div className="settings-bulk-row">
                        <label className="field watchlist-bulk-field">
                          <span>Bulk add symbols</span>
                          <textarea
                            value={watchlistBulkSymbols}
                            onChange={(event) => setWatchlistBulkSymbols(event.target.value.toUpperCase())}
                            placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
                            rows={3}
                          />
                        </label>
                        <button className="btn btn-secondary" type="button" onClick={handleAddWatchlistSymbolsBulk}>
                          Bulk add
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="card settings-card">
                    <div className="card-header settings-table-header">
                      <div>
                        <h2>Watchlist Table</h2>
                        <span className="muted">
                          Showing {filteredWatchlistItems.length} of {watchlistItems.length} symbols.
                        </span>
                      </div>
                      <div className="settings-table-actions">
                        <input
                          type="text"
                          value={watchlistFilter}
                          onChange={(event) => setWatchlistFilter(event.target.value.toUpperCase())}
                          placeholder="Find symbol"
                        />
                        <button className="btn btn-small btn-secondary" type="button" onClick={handleSelectAllVisibleWatchlistSymbols}>
                          Select visible
                        </button>
                        <button className="btn btn-small btn-secondary" type="button" onClick={handleClearWatchlistSelection}>
                          Clear
                        </button>
                        <button
                          className="btn btn-small btn-danger"
                          type="button"
                          disabled={watchlistSelectedSymbols.length === 0}
                          onClick={handleRemoveSelectedWatchlistSymbols}
                        >
                          Remove selected ({watchlistSelectedSymbols.length})
                        </button>
                      </div>
                    </div>
                    <div className="card-body">
                      {watchlist && Array.isArray(watchlist.symbols) ? (
                        filteredWatchlistItems.length > 0 ? (
                          <div className="table-wrap settings-watchlist-table">
                            <table>
                              <thead>
                                <tr>
                                  <th>Select</th>
                                  <th>Symbol</th>
                                  <th>Enabled</th>
                                  <th>Timeframes</th>
                                  <th>Rules</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredWatchlistItems.map((item) => {
                                  const entryTfs =
                                    Array.isArray(item.entry_tfs) && item.entry_tfs.length > 0
                                      ? item.entry_tfs
                                      : watchlistDefaultTfs;
                                  const rules = normalizeWatchlistRules(item.rules);
                                  return (
                                    <tr key={`settings-wl-${item.symbol}`}>
                                      <td>
                                        <input
                                          type="checkbox"
                                          checked={watchlistSelectedSymbols.includes(item.symbol)}
                                          onChange={() => handleToggleWatchlistSelection(item.symbol)}
                                          aria-label={`Select ${item.symbol}`}
                                        />
                                      </td>
                                      <td className="settings-symbol-cell">{item.symbol}</td>
                                      <td>
                                        <StatusBadge tone={item.enabled === false ? "muted" : "success"}>
                                          {item.enabled === false ? "Disabled" : "Enabled"}
                                        </StatusBadge>
                                      </td>
                                      <td>
                                        <div className="settings-chip-row">
                                          {watchlistTfOptions.map((tf) => (
                                            <label
                                              key={`settings-wl-${item.symbol}-${tf}`}
                                              className={`settings-chip settings-chip-control ${entryTfs.includes(tf) ? "settings-chip-active" : ""}`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={entryTfs.includes(tf)}
                                                onChange={() => handleToggleWatchlistEntryTf(item.symbol, tf)}
                                              />
                                              <span>{tf}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </td>
                                      <td>
                                        <div className="settings-chip-row">
                                          {watchlistRuleOptions.map(([ruleKey, label]) => (
                                            <label
                                              key={`settings-wl-${item.symbol}-${ruleKey}`}
                                              className={`settings-chip settings-chip-control ${rules[ruleKey] ? "settings-chip-active" : ""}`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={rules[ruleKey]}
                                                onChange={() => handleToggleWatchlistRule(item.symbol, ruleKey)}
                                              />
                                              <span>{label}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </td>
                                      <td>
                                        <div className="row-actions">
                                          <button
                                            className="btn btn-small btn-secondary"
                                            type="button"
                                            onClick={() => handleSelectWatchlistSymbol(item.symbol)}
                                          >
                                            Edit
                                          </button>
                                          <button
                                            className="btn btn-small btn-danger"
                                            type="button"
                                            onClick={() => handleRemoveWatchlistSymbol(item.symbol)}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <EmptyState title="No symbols in watchlist" actions={<button className="btn btn-small" type="button" onClick={handleAddWatchlistSymbol}>Add symbol</button>}>
                            Add symbols such as BTCUSDT, ETHUSDT, or SOLUSDT to start monitoring futures alerts.
                          </EmptyState>
                        )
                      ) : (
                        <LoadingSkeleton label="Loading watchlist" rows={6} />
                      )}
                    </div>
                  </section>
                </>
              ) : null}

              {settingsSection === "scanner" ? (
                <div className="settings-section-grid">
                  <SettingsInfoCard
                    title="Runtime"
                    items={[
                      ["Scanner status", scannerStatusLabel],
                      ["Mode", pollerStatus?.mode ?? "-"],
                      ["Last tick", formatTimestamp(pollerStatus?.last_tick_at)],
                      ["Last scan", formatTimestamp(pollerStatus?.last_scan_at)]
                    ]}
                  />
                  <SettingsInfoCard
                    title="Timeframes"
                    items={[
                      ["Entry timeframes", activeTimeframes.length ? activeTimeframes.join(", ") : "-"],
                      ["Chart timeframe", chartTf],
                      ["Levels timeframe", levelsEntryTf],
                      ["Replay timeframe", replayTf]
                    ]}
                  />
                  <SettingsInfoCard
                    title="Market Data"
                    items={[
                      ["Active symbols", symbols.length || watchlistItems.length || "-"],
                      ["Selected symbol", selectedSymbol || "-"],
                      ["Last scan count", pollerStatus?.last_scan_count ?? "-"],
                      ["Last new alerts", pollerStatus?.last_new_alerts ?? "-"]
                    ]}
                  />
                  <SettingsInfoCard
                    title="Detection Rules"
                    items={[
                      ["DI/ADX", activeRuleLabels.includes("DI") ? "Enabled" : "Per-symbol"],
                      ["Volume", activeRuleLabels.includes("Vol") ? "Enabled" : "Per-symbol"],
                      ["Pullback", activeRuleLabels.includes("Pullback") ? "Enabled" : "Per-symbol"],
                      ["Fake volume", activeRuleLabels.includes("Fake vol") ? "Enabled" : "Per-symbol"]
                    ]}
                  />
                </div>
              ) : null}

              {settingsSection === "strategies" ? (
                <div className="settings-section-grid">
                  <section className="card settings-card settings-wide-card">
                    <div className="card-header">
                      <h2>Strategy Summary</h2>
                    </div>
                    <div className="card-body">
                      <SettingsMetaGrid
                        items={[
                          ["Strategy", "default@1"],
                          ["Symbols using strategy", watchlistItems.length || "-"],
                          ["Active rule families", activeRuleLabels.length ? activeRuleLabels.join(", ") : "-"],
                          ["S/R confirmation", "Configured per scanner rules"]
                        ]}
                      />
                      <p className="muted">
                        Strategy controls currently live at the symbol rule level. Use the Watchlist table to enable or disable
                        DI, Volume, Pullback, and Fake Volume filters per market.
                      </p>
                    </div>
                  </section>
                  <SettingsInfoCard
                    title="Directional Filters"
                    items={[
                      ["Long/short logic", "Scanner controlled"],
                      ["Entry timeframes", activeTimeframes.length ? activeTimeframes.join(", ") : "-"],
                      ["Higher timeframe S/R", levels?.htf_timeframe ?? "-"]
                    ]}
                  />
                  <SettingsInfoCard
                    title="Volume Rules"
                    items={[
                      ["Volume filter", activeRuleLabels.includes("Vol") ? "Enabled" : "Per-symbol"],
                      ["Pullback volume", activeRuleLabels.includes("Pullback") ? "Enabled" : "Per-symbol"],
                      ["Fake volume", activeRuleLabels.includes("Fake vol") ? "Enabled" : "Per-symbol"]
                    ]}
                  />
                </div>
              ) : null}

              {settingsSection === "risk" ? (
                <div className="settings-section-grid">
                  <section className="card settings-card settings-wide-card">
                    <div className="card-header">
                      <h2>Risk</h2>
                    </div>
                    <div className="card-body">
                      <EmptyState title="No editable risk controls exposed">
                        Risk and paper trading assumptions are not currently exposed by the Settings API. Paper trade performance remains available on the Paper Trades page.
                      </EmptyState>
                      <div className="settings-warning-note">
                        Changing leverage affects simulated risk calculations only unless connected to live execution.
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {settingsSection === "alerts" ? (
                <section className="card settings-card">
                  <div className="card-header">
                    <div>
                      <h2>Alerts</h2>
                      <span className="muted">Configure signal quality, cooldowns, rate limits, and quiet hours.</span>
                    </div>
                    <button className="btn btn-small" type="button" onClick={handleSaveQuality}>
                      Save alert settings
                    </button>
                  </div>
                  <div className="card-body">
                    {qualityError ? <div className="error">{qualityError}</div> : null}
                    {qualitySettings ? (
                      <div className="settings-form-columns">
                        <SettingsFieldGroup title="Severity Thresholds">
                          {["break", "retest", "setup", "fakeout"].map((key) => (
                            <label className="field" key={`min-${key}`}>
                              <span>{key}</span>
                              <input
                                type="number"
                                value={qualitySettings.min_score_by_type?.[key] ?? ""}
                                onChange={(event) =>
                                  setQualitySettings((prev) =>
                                    updateQuality(prev, ["min_score_by_type", key], event.target.value)
                                  )
                                }
                              />
                            </label>
                          ))}
                        </SettingsFieldGroup>
                        <SettingsFieldGroup title="Alert Cooldown">
                          {["break", "retest", "setup", "fakeout"].map((key) => (
                            <label className="field" key={`cooldown-${key}`}>
                              <span>{key} minutes</span>
                              <input
                                type="number"
                                value={qualitySettings.cooldown_minutes_by_type?.[key] ?? ""}
                                onChange={(event) =>
                                  setQualitySettings((prev) =>
                                    updateQuality(prev, ["cooldown_minutes_by_type", key], event.target.value)
                                  )
                                }
                              />
                            </label>
                          ))}
                        </SettingsFieldGroup>
                        <SettingsFieldGroup title="Duplicate Suppression">
                          <label className="field">
                            <span>Per symbol / hour</span>
                            <input
                              type="number"
                              value={qualitySettings.max_alerts_per_symbol_per_hour ?? ""}
                              onChange={(event) =>
                                setQualitySettings((prev) =>
                                  updateQuality(prev, ["max_alerts_per_symbol_per_hour"], event.target.value)
                                )
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Global / hour</span>
                            <input
                              type="number"
                              value={qualitySettings.max_alerts_global_per_hour ?? ""}
                              onChange={(event) =>
                                setQualitySettings((prev) =>
                                  updateQuality(prev, ["max_alerts_global_per_hour"], event.target.value)
                                )
                              }
                            />
                          </label>
                        </SettingsFieldGroup>
                        <SettingsFieldGroup title="Quiet Hours">
                          <label className="field">
                            <span>Enabled</span>
                            <select
                              value={qualitySettings.quiet_hours?.enabled ? "yes" : "no"}
                              onChange={(event) =>
                                setQualitySettings((prev) =>
                                  updateQuality(prev, ["quiet_hours", "enabled"], event.target.value === "yes")
                                )
                              }
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Start</span>
                            <input
                              type="text"
                              value={qualitySettings.quiet_hours?.start ?? ""}
                              onChange={(event) =>
                                setQualitySettings((prev) =>
                                  updateQuality(prev, ["quiet_hours", "start"], event.target.value)
                                )
                              }
                            />
                          </label>
                          <label className="field">
                            <span>End</span>
                            <input
                              type="text"
                              value={qualitySettings.quiet_hours?.end ?? ""}
                              onChange={(event) =>
                                setQualitySettings((prev) =>
                                  updateQuality(prev, ["quiet_hours", "end"], event.target.value)
                                )
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Timezone</span>
                            <input
                              type="text"
                              value={qualitySettings.quiet_hours?.tz ?? ""}
                              onChange={(event) =>
                                setQualitySettings((prev) =>
                                  updateQuality(prev, ["quiet_hours", "tz"], event.target.value)
                                )
                              }
                            />
                          </label>
                        </SettingsFieldGroup>
                      </div>
                    ) : (
                      <LoadingSkeleton label="Loading alert settings" rows={6} />
                    )}
                    {qualitySaveStatus ? <p className="settings-feedback">{qualitySaveStatus}</p> : null}
                  </div>
                </section>
              ) : null}

              {settingsSection === "integrations" ? (
                <div className="settings-section-grid">
                  <section className="card settings-card settings-wide-card">
                    <div className="card-header">
                      <div>
                        <h2>Telegram Alerts</h2>
                        <span className="muted">Protected admin action. Token is required to save or test delivery.</span>
                      </div>
                      <StatusBadge tone={telegramSettings?.enabled ? "success" : "muted"}>
                        {telegramSettings?.enabled ? "Connected" : "Not configured"}
                      </StatusBadge>
                    </div>
                    <div className="card-body">
                      {telegramSettingsError ? <div className="error">{telegramSettingsError}</div> : null}
                      <div className="settings-form-grid settings-form-grid-telegram">
                        <label className="checkbox toggle-control">
                          <input
                            type="checkbox"
                            checked={telegramForm.enabled}
                            onChange={(event) =>
                              setTelegramForm((prev) => ({ ...prev, enabled: event.target.checked }))
                            }
                          />
                          <span>Telegram alerts enabled</span>
                        </label>
                        <label className="field">
                          <span>Bot token</span>
                          <input
                            type="password"
                            value={telegramForm.bot_token}
                            onChange={(event) =>
                              setTelegramForm((prev) => ({ ...prev, bot_token: event.target.value }))
                            }
                            placeholder={
                              telegramSettings?.has_bot_token ? "Token saved; leave blank to keep it" : "Telegram bot token"
                            }
                            autoComplete="off"
                          />
                        </label>
                        <label className="field">
                          <span>Chat ID</span>
                          <input
                            type="text"
                            value={telegramForm.chat_id}
                            onChange={(event) =>
                              setTelegramForm((prev) => ({ ...prev, chat_id: event.target.value }))
                            }
                            placeholder="Telegram chat ID"
                          />
                        </label>
                        <button className="btn" type="button" onClick={handleSaveTelegramSettings}>
                          Save Telegram
                        </button>
                      </div>
                      <div className="settings-test-row">
                        <input
                          type="text"
                          value={telegramText}
                          onChange={(event) => setTelegramText(event.target.value)}
                          placeholder="Test message (optional)"
                        />
                        <button className="btn btn-secondary" type="button" onClick={handleSendTelegramTest}>
                          Test Telegram Alert
                        </button>
                      </div>
                      <div className="settings-chip-row">
                        <StatusBadge tone={telegramSettings?.has_bot_token ? "success" : "warning"}>
                          {telegramSettings?.has_bot_token ? "Bot token configured" : "No bot token saved"}
                        </StatusBadge>
                        {telegramSettingsStatus ? <span className="settings-feedback">{telegramSettingsStatus}</span> : null}
                        {telegramFeedback ? (
                          <span className={telegramFeedback.ok ? "settings-feedback" : "error-text"}>
                            {telegramFeedback.message}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </section>
                  <SettingsIntegrationCard
                    name="Binance"
                    status="Configured"
                    description="Market data links open for the selected symbol."
                    action={
                      <button className="btn btn-small btn-secondary" type="button" onClick={() => window.open(getBinanceLink(selectedSymbol), "_blank", "noopener")}>
                        Open Binance
                      </button>
                    }
                  />
                  <SettingsIntegrationCard
                    name="TradingView"
                    status="Configured"
                    description="Chart links open for the selected symbol."
                    action={
                      <button className="btn btn-small btn-secondary" type="button" onClick={() => window.open(getTradingViewLink(selectedSymbol), "_blank", "noopener")}>
                        Open TradingView
                      </button>
                    }
                  />
                </div>
              ) : null}

              {settingsSection === "system" ? (
                <div className="settings-section-grid">
                  <section className="card settings-card settings-wide-card">
                    <div className="card-header">
                      <div>
                        <h2>System/Admin</h2>
                        <span className="muted">Administrative tools for maintenance, export, and debugging.</span>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="settings-admin-token-row">
                        <label className="field">
                          <span>Admin token</span>
                          <input
                            type="password"
                            value={adminTokenDraft}
                            onChange={(event) => setAdminTokenDraft(event.target.value)}
                            placeholder="Required for protected admin actions"
                            autoComplete="off"
                          />
                        </label>
                        <button className="btn" type="button" onClick={handleSaveAdminTokenDraft}>
                          Save token
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={handleClearAdminTokenDraft}>
                          Clear
                        </button>
                      </div>
                      <p className="muted">Required for protected admin actions. The token is stored in this browser session.</p>
                    </div>
                  </section>
                  <section className="card settings-card settings-wide-card">
                    <div className="card-header">
                      <h2>Service Controls</h2>
                    </div>
                    <div className="card-body">
                      {pollerError ? <div className="error">{pollerError}</div> : null}
                      {pollerStatus ? (
                        <SettingsMetaGrid
                          items={[
                            ["Status", scannerStatusLabel],
                            ["Mode", pollerStatus.mode ?? "-"],
                            ["Last tick", formatTimestamp(pollerStatus.last_tick_at)],
                            ["Last error", pollerStatus.last_error || "-"]
                          ]}
                        />
                      ) : (
                        <LoadingSkeleton label="Loading service controls" rows={3} />
                      )}
                      <div className="settings-chip-row">
                        <button
                          className="btn btn-small btn-success"
                          type="button"
                          onClick={() => handleSetPollerMode("run")}
                          disabled={!pollerStatus || pollerStatus.mode === "run"}
                        >
                          Run
                        </button>
                        <button
                          className="btn btn-small btn-warning"
                          type="button"
                          onClick={() => handleSetPollerMode("pause_new")}
                          disabled={!pollerStatus || pollerStatus.mode === "pause_new"}
                        >
                          Pause New
                        </button>
                        <button
                          className="btn btn-small btn-danger"
                          type="button"
                          onClick={() => handleSetPollerMode("pause_all")}
                          disabled={!pollerStatus || pollerStatus.mode === "pause_all"}
                        >
                          Pause All
                        </button>
                      </div>
                    </div>
                  </section>
                  <section className="card settings-card settings-wide-card">
                    <div className="card-header">
                      <h2>Advanced / Debug</h2>
                    </div>
                    <div className="card-body">
                      {watchlist ? (
                        <pre>{JSON.stringify(watchlist, null, 2)}</pre>
                      ) : (
                        <EmptyState title="No system tools available">
                          Admin tools will appear here when enabled by the backend.
                        </EmptyState>
                      )}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {showDashboard || showReplay ? (
      <section className={`card ${showDashboard ? "chart-workspace-card" : "replay-chart-card"}`}>
        <h2>Chart Workspace</h2>
        {chartError ? <div className="error">{chartError}</div> : null}
        <div className="chart-toolbar">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={`chart-${symbol}`} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={chartTf} onChange={(event) => setChartTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
          <div className="inline-form">
            <button className="btn btn-small" type="button" onClick={fetchChartData} disabled={chartLoading || isReplayActive}>
              Refresh
            </button>
            <button
              className="btn btn-small"
              type="button"
              onClick={() => window.open(getBinanceLink(selectedSymbol), "_blank", "noopener")}
            >
              Open Binance
            </button>
            <button
              className="btn btn-small"
              type="button"
              onClick={() => window.open(getTradingViewLink(selectedSymbol), "_blank", "noopener")}
            >
              Open TradingView
            </button>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={chartAutoRefresh}
              onChange={(event) => setChartAutoRefresh(event.target.checked)}
            />
            <span>Auto refresh (30s)</span>
          </label>
        </div>
        <div className="toggle-grid">
          <label className="checkbox">
            <input type="checkbox" checked={showZones} onChange={(event) => setShowZones(event.target.checked)} />
            <span>Active S/R</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={showSma7} onChange={(event) => setShowSma7(event.target.checked)} />
            <span>SMA 7/21/50</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showLevelEvents}
              onChange={(event) => setShowLevelEvents(event.target.checked)}
            />
            <span>Level Events</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showSetupCandles}
              onChange={(event) => setShowSetupCandles(event.target.checked)}
            />
            <span>Setup Candles</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={showOpenings} onChange={(event) => setShowOpenings(event.target.checked)} />
            <span>Openings</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={showDiWidget} onChange={(event) => setShowDiWidget(event.target.checked)} />
            <span>DI / ADX</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={showRsiWidget} onChange={(event) => setShowRsiWidget(event.target.checked)} />
            <span>RSI/ATR Widget</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showVolumeWidget}
              onChange={(event) => setShowVolumeWidget(event.target.checked)}
            />
            <span>Volume</span>
          </label>
        </div>

        {isReplayActive ? <p className="muted">Replay mode active - live refresh paused.</p> : null}
        {chartLoading ? <p className="muted">Loading chart...</p> : null}
        {chartLegendDisplay ? (
          <div className="chart-legend">
            <span>{formatTimestamp(chartLegendDisplay.time)}</span>
            <span>O {formatNumber(chartLegendDisplay.open)}</span>
            <span>H {formatNumber(chartLegendDisplay.high)}</span>
            <span>L {formatNumber(chartLegendDisplay.low)}</span>
            <span>C {formatNumber(chartLegendDisplay.close)}</span>
            <span className={chartLegendDisplay.changePct >= 0 ? "legend-up" : "legend-down"}>
              {chartLegendDisplay.changePct >= 0 ? "+" : ""}
              {chartLegendDisplay.changePct.toFixed(2)}%
            </span>
          </div>
        ) : null}

        {(showDiWidget || showRsiWidget || showVolumeWidget) ? (
          <div className="di-grid">
            {showDiWidget ? (
              <div>
                <span>DI / ADX</span>
                <strong>+{formatNumber(chartDiPeak?.di_plus?.last)} / -{formatNumber(chartDiPeak?.di_minus?.last)}</strong>
                <small>ADX {formatNumber(chartDiPeak?.adx14_last)}</small>
                {chartDiError ? <small className="error-text">{chartDiError}</small> : null}
              </div>
            ) : null}
            {showRsiWidget ? (
              <div>
                <span>RSI / ATR</span>
                <strong>RSI {formatNumber(chartRsi?.rsi14_last)}</strong>
                <small>ATR x{formatNumber(chartRsi?.atr_mult)} / Stop {formatNumber(chartRsi?.atr_stop_distance)}</small>
                {chartRsiError ? <small className="error-text">{chartRsiError}</small> : null}
              </div>
            ) : null}
            {showVolumeWidget ? (
              <div>
                <span>Volume</span>
                <strong>Ratio {formatNumber(chartVol?.vol_ratio)}</strong>
                <small>
                  MA5 slope ok: {String(chartVol?.vol_ma5_slope_ok ?? "-")} / Pullback decline:{" "}
                  {String(chartVol?.pullback_vol_decline ?? "-")}
                </small>
                {chartVolError ? <small className="error-text">{chartVolError}</small> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="chart-stack">
          <div className="chart-canvas" ref={chartContainerRef} />
          <div className="chart-canvas chart-canvas-small" ref={volumeContainerRef} />
          <div
            className={`chart-canvas chart-canvas-indicator ${showDiWidget ? "" : "chart-canvas-hidden"}`}
            ref={indicatorContainerRef}
          />
        </div>

        {isReplayActive ? (
          <p className="muted">Replay mode active - workspace signals hidden.</p>
        ) : workspaceSignals.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Direction</th>
                  <th>Level</th>
                  <th>Time</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {workspaceSignals.map((row) => (
                  <tr key={row.id} className="clickable" onClick={() => setChartDetails(row.details)}>
                    <td>{row.type}</td>
                    <td>{row.direction ?? "-"}</td>
                    <td>{formatNumber(row.level)}</td>
                    <td>{formatTimestamp(row.time)}</td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No signal markers yet.</p>
        )}

        {chartDetails ? (
          <div className="drawer">
            <div className="drawer-header">
              <strong>Signal Details</strong>
              <button className="btn btn-small" type="button" onClick={() => setChartDetails(null)}>
                Close
              </button>
            </div>
            <div className="drawer-meta">
              <span>{chartDetails.type}</span>
              <span>{chartDetails.direction}</span>
              <span>Level {formatNumber(chartDetails.level)}</span>
              <span>{formatTimestamp(chartDetails.time)}</span>
            </div>
            <div className="drawer-meta">
              <span>Entry {formatNumber(chartDetails.entry)}</span>
              <span>SL {formatNumber(chartDetails.sl)}</span>
              <span>{chartDetails.sl_reason ?? "-"}</span>
            </div>
            {chartDetails.candle ? (
              <div className="drawer-meta">
                <span>
                  Candle O/H/L/C/V: {chartDetails.candle.open}/{chartDetails.candle.high}/{chartDetails.candle.low}/
                  {chartDetails.candle.close}/{chartDetails.candle.volume}
                </span>
              </div>
            ) : null}
            {chartDetails.level_event ? (
              <div className="drawer-meta">
                <span>break {chartDetails.level_event.break_index ?? "-"}</span>
                <span>retest {chartDetails.level_event.retest_index ?? "-"}</span>
                <span>fakeout {chartDetails.level_event.fakeout_index ?? "-"}</span>
                <span>setup {chartDetails.setup_index ?? "-"}</span>
              </div>
            ) : null}
            <div className="inline-form">
              <button
                className="btn btn-small"
                type="button"
                onClick={() => handleCopyText(JSON.stringify(chartDetails, null, 2))}
              >
                Copy JSON
              </button>
              <button
                className="btn btn-small"
                type="button"
                onClick={() => window.open(getBinanceLink(chartDetails.symbol ?? selectedSymbol), "_blank", "noopener")}
              >
                Open Binance
              </button>
            </div>
            <pre>{JSON.stringify(chartDetails.context ?? {}, null, 2)}</pre>
          </div>
        ) : null}
      </section>
      ) : null}

      {showReplay ? (
      <section className="card">
        <h2>Replay</h2>
        {replayError ? <div className="error">{replayError}</div> : null}
        <div className="di-controls">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={`replay-${symbol}`} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Chart TF</span>
            <select value={replayTf} onChange={(event) => setReplayTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
            </select>
          </label>
          <label className="field">
            <span>Step</span>
            <select value={replayStep} onChange={(event) => setReplayStep(Number(event.target.value))}>
              <option value={1}>1</option>
              <option value={3}>3</option>
              <option value={6}>6</option>
            </select>
          </label>
          <label className="field">
            <span>Warmup</span>
            <input
              type="number"
              value={replayWarmup}
              onChange={(event) => setReplayWarmup(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="di-controls">
          <label className="field">
            <span>From</span>
            <input
              type="datetime-local"
              value={replayFromMs}
              onChange={(event) => setReplayFromMs(event.target.value)}
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="datetime-local"
              value={replayToMs}
              onChange={(event) => setReplayToMs(event.target.value)}
            />
          </label>
          <div className="inline-form">
            <button className="btn btn-small" type="button" onClick={() => handleReplayQuickRange(24)}>
              Last 24h
            </button>
            <button className="btn btn-small" type="button" onClick={() => handleReplayQuickRange(24 * 7)}>
              Last 7d
            </button>
            <button className="btn btn-small" type="button" onClick={() => handleReplayQuickRange(24 * 30)}>
              Last 30d
            </button>
          </div>
          <button className="btn" type="button" onClick={handleReplayRun} disabled={replayLoading}>
            {replayLoading ? "Running..." : "Run Replay"}
          </button>
        </div>

        <p className="muted">
          Runs both entry timeframes for the selected window: 15m uses 4H S/R, 1h uses Daily S/R. Chart controls show
          the selected timeframe only; trade metrics below include both.
        </p>
        <p className="muted">Selected window: {replayWindowLabel}</p>

        {replayTfSummaries.some((item) => item.summary) ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entry TF</th>
                  <th>Window</th>
                  <th>Steps</th>
                  <th>Signals</th>
                  <th>Trades</th>
                  <th>W/L/O</th>
                  <th>Win Rate</th>
                  <th>Total R</th>
                  <th>Avg Max RR</th>
                </tr>
              </thead>
              <tbody>
                {replayTfSummaries.map(({ tf, summary }) => {
                  const perf = summary?.performance;
                  return (
                    <tr key={`replay-tf-summary-${tf}`}>
                      <td>{tf}</td>
                      <td>
                        {summary ? `${formatTimestamp(summary.from_ms)} -> ${formatTimestamp(summary.to_ms)}` : "-"}
                      </td>
                      <td>{summary?.total_steps ?? "-"}</td>
                      <td>{summary?.signals_total ?? "-"}</td>
                      <td>{perf?.trades ?? "-"}</td>
                      <td>
                        {perf ? `${perf.wins ?? 0} / ${perf.losses ?? 0} / ${perf.open ?? 0}` : "-"}
                      </td>
                      <td>{perf ? formatPercentFraction(perf.win_rate) : "-"}</td>
                      <td>{perf ? formatNumber(perf.realized_r_total) : "-"}</td>
                      <td>{perf ? formatNumber(perf.max_rr_avg) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {replaySummary ? (
          <div>
            <div className="di-grid">
              <div>
                <span>Total Steps</span>
                <strong>{replaySummary.total_steps}</strong>
              </div>
              <div>
                <span>Signals</span>
                <strong>{replaySummary.signals_total}</strong>
              </div>
              <div>
                <span>Break / Retest / Setup / Fakeout</span>
                <strong>
                  {replaySummary.by_type?.break ?? 0} / {replaySummary.by_type?.retest ?? 0} /{" "}
                  {replaySummary.by_type?.setup ?? 0} / {replaySummary.by_type?.fakeout ?? 0}
                </strong>
              </div>
              <div>
                <span>Long / Short</span>
                <strong>
                  {replaySummary.by_direction?.long ?? 0} / {replaySummary.by_direction?.short ?? 0}
                </strong>
              </div>
            </div>
            {replaySummary.performance ? (
              <>
                <div className="di-grid">
                  <div>
                    <span>Performance Trades</span>
                    <strong>{replaySummary.performance.trades ?? 0}</strong>
                  </div>
                  <div>
                    <span>Win Rate</span>
                    <strong>{formatPercentFraction(replaySummary.performance.win_rate)}</strong>
                  </div>
                  <div>
                    <span>Total Realized R</span>
                    <strong>{formatNumber(replaySummary.performance.realized_r_total)}</strong>
                  </div>
                  <div>
                    <span>Avg Max RR</span>
                    <strong>{formatNumber(replaySummary.performance.max_rr_avg)}</strong>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Setup</th>
                        <th>Trades</th>
                        <th>W/L/O</th>
                        <th>Win Rate</th>
                        <th>Total R</th>
                        <th>Avg Max RR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(replaySummary.performance.groups?.by_type ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="muted">
                            No replay performance rows yet.
                          </td>
                        </tr>
                      ) : (
                        replaySummary.performance.groups.by_type.map((row) => (
                          <tr key={`perf-type-${row.key}`}>
                            <td>{row.key}</td>
                            <td>{row.trades}</td>
                            <td>
                              {row.wins} / {row.losses} / {row.open}
                            </td>
                            <td>{formatPercentFraction(row.win_rate)}</td>
                            <td>{formatNumber(row.realized_r_total)}</td>
                            <td>{formatNumber(row.max_rr_avg)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {replayItems.length > 0 ? (
          <div className="replay-controls">
            <div className="inline-form">
              <input
                type="range"
                min={0}
                max={Math.max(replayItems.length - 1, 0)}
                value={replayIndex}
                onChange={(event) => setReplayIndex(Number(event.target.value))}
              />
              <span className="muted">
                {replayIndex + 1} / {replayItems.length}
              </span>
            </div>
            <div className="muted">
              Selected time: {replayItem ? formatTimestamp(replayItem.time) : "-"}
            </div>
          </div>
        ) : (
          <p className="muted">Run replay to load timeline.</p>
        )}

        {replayItem ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Direction</th>
                  <th>Level</th>
                  <th>Entry</th>
                  <th>SL</th>
                </tr>
              </thead>
              <tbody>
                {replayItem.signals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No signals on this candle.
                    </td>
                  </tr>
                ) : (
                  replayItem.signals.map((signal, idx) => (
                    <tr
                      key={`replay-signal-${idx}`}
                      className="clickable"
                      onClick={() => handleReplaySignalClick(signal)}
                    >
                      <td>{signal.type}</td>
                      <td>{signal.direction}</td>
                      <td>{signal.level}</td>
                      <td>{signal.entry}</td>
                      <td>{signal.sl ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {replayTradeOutcomes.length > 0 ? (
          <div>
            <h3>Replay Trade Outcomes</h3>
            <div className="di-controls">
              <label className="field">
                <span>Side</span>
                <select value={replaySideFilter} onChange={(event) => setReplaySideFilter(event.target.value)}>
                  <option value="all">All</option>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <label className="field">
                <span>Outcome</span>
                <select value={replayOutcomeFilter} onChange={(event) => setReplayOutcomeFilter(event.target.value)}>
                  <option value="all">All</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="open">Open</option>
                </select>
              </label>
              <label className="field">
                <span>Sort</span>
                <select value={replaySortBy} onChange={(event) => setReplaySortBy(event.target.value)}>
                  <option value="time_desc">Newest first</option>
                  <option value="time_asc">Oldest first</option>
                  <option value="max_rr_desc">Max RR (high to low)</option>
                  <option value="max_dd_desc">Max drawdown R (high to low)</option>
                  <option value="duration_rr2_asc">Time to RR2 (fast to slow)</option>
                  <option value="direction">Direction (long then short)</option>
                </select>
              </label>
            </div>

            <div className="di-grid">
              <div>
                <span>Trades (filtered / total)</span>
                <strong>
                  {replayTradeRows.length} / {replayTradeOutcomes.length}
                </strong>
              </div>
              <div>
                <span>Wins / Losses / Open</span>
                <strong>
                  {replayTradeStats.wins} / {replayTradeStats.losses} / {replayTradeStats.open}
                </strong>
              </div>
              <div>
                <span>Filtered Win Rate</span>
                <strong>{formatPercentFraction(replayTradeStats.win_rate)}</strong>
              </div>
              <div>
                <span>Filtered Total R</span>
                <strong>{formatNumber(replayTradeStats.realized_r_total)}</strong>
              </div>
              <div>
                <span>Max Drawdown (R)</span>
                <strong>{formatNumber(replayTradeStats.max_drawdown_r)}</strong>
              </div>
              <div>
                <span>Long Win/Loss Ratio</span>
                <strong>{formatWinLossRatio(replayTradeStats.by_side.long)}</strong>
              </div>
              <div>
                <span>Short Win/Loss Ratio</span>
                <strong>{formatWinLossRatio(replayTradeStats.by_side.short)}</strong>
              </div>
              <div>
                <span>Average Win RR</span>
                <strong>{formatNumber(replayTradeStats.avg_win_rr)}</strong>
              </div>
              <div>
                <span>Max Losing Streak</span>
                <strong>{replayTradeStats.max_losing_streak}</strong>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entry TF</th>
                    <th>Trades</th>
                    <th>Wins / Losses / Open</th>
                    <th>Win Rate</th>
                    <th>Total R</th>
                    <th>Max Drawdown R</th>
                    <th>Avg Win RR</th>
                  </tr>
                </thead>
                <tbody>
                  {replayTradeStatsByTf.map(({ tf, stats }) => (
                    <tr key={`trade-stats-${tf}`}>
                      <td>{tf}</td>
                      <td>{stats.total}</td>
                      <td>
                        {stats.wins} / {stats.losses} / {stats.open}
                      </td>
                      <td>{formatPercentFraction(stats.win_rate)}</td>
                      <td>{formatNumber(stats.realized_r_total)}</td>
                      <td>{formatNumber(stats.max_drawdown_r)}</td>
                      <td>{formatNumber(stats.avg_win_rr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TF</th>
                    <th>Signal Time</th>
                    <th>Type</th>
                    <th>Direction</th>
                    <th>Entry</th>
                    <th>SL</th>
                    <th>Signal TF Bias</th>
                    <th>Outcome</th>
                    <th>Max RR</th>
                    <th>Max DD (R)</th>
                    <th>Outcome Duration</th>
                    <th>To SL</th>
                    <th>To RR2</th>
                    <th>To RR5</th>
                    <th>To RR10</th>
                  </tr>
                </thead>
                <tbody>
                  {replayTradeRows.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="muted">
                        No replay trades match filters.
                      </td>
                    </tr>
                  ) : (
                    replayTradeRows.map((trade) => (
                      <tr key={trade.id}>
                        <td>{trade.tf}</td>
                        <td>{formatTimestamp(trade.signal_time)}</td>
                        <td>{trade.type}</td>
                        <td>{trade.direction}</td>
                        <td>{formatNumber(trade.entry)}</td>
                        <td>{formatNumber(trade.sl)}</td>
                        <td>{trade.signal_tf_bias ?? "-"}</td>
                        <td>{trade.outcome}</td>
                        <td>{formatNumber(trade.max_rr)}</td>
                        <td>{formatNumber(trade.max_drawdown_r)}</td>
                        <td>{formatDurationMs(trade.outcome_duration_ms)}</td>
                        <td>{formatDurationMs(trade.time_to_sl_ms)}</td>
                        <td>{formatDurationMs(trade.time_to_rr2_ms)}</td>
                        <td>{formatDurationMs(trade.time_to_rr5_ms)}</td>
                        <td>{formatDurationMs(trade.time_to_rr10_ms)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {replayDetails ? (
          <div className="drawer">
            <div className="drawer-header">
              <strong>Replay Signal</strong>
              <button className="btn btn-small" type="button" onClick={() => setReplayDetails(null)}>
                Close
              </button>
            </div>
            <div className="drawer-meta">
              <span>{replayDetails.type}</span>
              <span>{replayDetails.direction}</span>
              <span>Level {replayDetails.level}</span>
              <span>{formatTimestamp(replayDetails.time)}</span>
            </div>
            <div className="drawer-meta">
              <span>Entry {replayDetails.entry}</span>
              <span>SL {replayDetails.sl}</span>
              <span>{replayDetails.sl_reason}</span>
            </div>
            {replayDetails.trigger_candle ? (
              <div className="drawer-meta">
                <span>
                  Candle O/H/L/C: {replayDetails.trigger_candle.open}/{replayDetails.trigger_candle.high}/
                  {replayDetails.trigger_candle.low}/{replayDetails.trigger_candle.close}
                </span>
              </div>
            ) : null}
            {replayDetails.level_event_indices ? (
              <div className="drawer-meta">
                <span>break {replayDetails.level_event_indices.break_index ?? "-"}</span>
                <span>retest {replayDetails.level_event_indices.retest_index ?? "-"}</span>
                <span>fakeout {replayDetails.level_event_indices.fakeout_index ?? "-"}</span>
                <span>setup {replayDetails.setup_index ?? "-"}</span>
              </div>
            ) : null}
            <div className="inline-form">
              <button className="btn btn-small" type="button" onClick={() => handleCopyText(JSON.stringify(replayDetails, null, 2))}>
                Copy JSON
              </button>
              <button className="btn btn-small" type="button" onClick={() => window.open(getBinanceLink(selectedSymbol), "_blank", "noopener")}>
                Open Binance
              </button>
            </div>
            <pre>{JSON.stringify(replayDetails.context ?? {}, null, 2)}</pre>
          </div>
        ) : null}
      </section>
      ) : null}

      {showDashboard ? (
      <section className="card live-alert-stream-card">
        <h2>Live Alert Stream</h2>
        <div className="tabs">
          <button
            className={`tab ${alertsTab === "history" ? "active" : ""}`}
            type="button"
            onClick={() => setAlertsTab("history")}
          >
            History
          </button>
          <button
            className={`tab ${alertsTab === "suppressed" ? "active" : ""}`}
            type="button"
            onClick={() => setAlertsTab("suppressed")}
          >
            Suppressed
          </button>
        </div>
        {alertsTab === "history" ? (
          <div>
            {alertsError ? <div className="error">{alertsError}</div> : null}
            <div className="di-controls">
              <label className="field">
                <span>Symbol</span>
                <select
                  value={alertsFilters.symbol}
                  onChange={(event) => handleAlertFilterChange("symbol", event.target.value)}
                >
                  <option value="">All</option>
                  {symbols.map((symbol) => (
                    <option key={`alert-${symbol}`} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>TF</span>
                <select value={alertsFilters.tf} onChange={(event) => handleAlertFilterChange("tf", event.target.value)}>
                  <option value="">All</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                  <option value="1w">1w</option>
                </select>
              </label>
              <label className="field">
                <span>Type</span>
                <select
                  value={alertsFilters.type}
                  onChange={(event) => handleAlertFilterChange("type", event.target.value)}
                >
                  <option value="">All</option>
                  <option value="break">break</option>
                  <option value="retest">retest</option>
                  <option value="setup">setup</option>
                  <option value="fakeout">fakeout</option>
                </select>
              </label>
              <label className="field">
                <span>Direction</span>
                <select
                  value={alertsFilters.direction}
                  onChange={(event) => handleAlertFilterChange("direction", event.target.value)}
                >
                  <option value="">All</option>
                  <option value="long">long</option>
                  <option value="short">short</option>
                </select>
              </label>
              <label className="field">
                <span>Notified</span>
                <select
                  value={alertsFilters.notified}
                  onChange={(event) => handleAlertFilterChange("notified", event.target.value)}
                >
                  <option value="">All</option>
                  <option value="1">Notified</option>
                  <option value="0">Not notified</option>
                </select>
              </label>
            </div>
            <div className="inline-form">
              <button className="btn" type="button" onClick={() => handleQuickRange(1)}>
                Last 1h
              </button>
              <button className="btn" type="button" onClick={() => handleQuickRange(6)}>
                Last 6h
              </button>
              <button className="btn" type="button" onClick={() => handleQuickRange(24)}>
                Last 24h
              </button>
              <button className="btn" type="button" onClick={() => handleQuickRange(168)}>
                Last 7d
              </button>
              <button className="btn" type="button" onClick={handleClearRange}>
                Clear Range
              </button>
            </div>
            <div className="inline-form">
              <input
                type="text"
                value={alertsSearch}
                onChange={(event) => setAlertsSearch(event.target.value)}
                placeholder="Search symbol/type/level/error"
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={alertsAutoRefresh}
                  onChange={(event) => setAlertsAutoRefresh(event.target.checked)}
                />
                Auto refresh
              </label>
              <button className="btn" type="button" onClick={handleExportCsv}>
                Export CSV
              </button>
            </div>
            <div className="pagination">
              <span>
                Showing {showingStart}-{showingEnd} of {totalAlerts}
              </span>
              <div className="pagination-actions">
                <button
                  className="btn btn-small"
                  type="button"
                  disabled={alertsOffset === 0}
                  onClick={() => setAlertsOffset((prev) => Math.max(0, prev - alertsLimit))}
                >
                  Prev
                </button>
                <button
                  className="btn btn-small"
                  type="button"
                  disabled={alertsOffset + alertsLimit >= totalAlerts}
                  onClick={() => setAlertsOffset((prev) => prev + alertsLimit)}
                >
                  Next
                </button>
              </div>
            </div>
            {filteredAlerts.length === 0 ? (
              <EmptyState title="No live alerts yet">
                Your scanner is online. New signals will appear here when strategy conditions are met.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Severity</th>
                      <th>Time</th>
                      <th>Symbol</th>
                      <th>TF</th>
                      <th>Direction</th>
                      <th>Strategy</th>
                      <th>Entry</th>
                      <th>SL</th>
                      <th>TP</th>
                      <th>S/R</th>
                      <th>Confidence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert) => (
                      <tr
                        key={alert.id ?? `${alert.symbol}-${alert.time}`}
                        className="clickable"
                        onClick={() => handleAlertRowClick(alert.id)}
                      >
                        <td>
                          <StatusBadge tone={getAlertStatusTone(alert)}>{getAlertStatusLabel(alert)}</StatusBadge>
                        </td>
                        <td>
                          <SeverityBadge severity={getAlertSeverity(alert)} />
                        </td>
                        <td>{alert.created_at ? new Date(alert.created_at).toLocaleString() : "-"}</td>
                        <td>{alert.symbol}</td>
                        <td>{alert.tf}</td>
                        <td>
                          <StatusBadge tone={alert.direction === "long" ? "success" : alert.direction === "short" ? "danger" : "muted"}>
                            {alert.direction ?? "-"}
                          </StatusBadge>
                        </td>
                        <td>{alert.type ?? alert.payload?.strategy?.id ?? "-"}</td>
                        <td>{formatNumber(alert.entry)}</td>
                        <td>{formatNumber(alert.sl)}</td>
                        <td>{formatNumber(getAlertTakeProfit(alert))}</td>
                        <td>{formatNumber(alert.level)}</td>
                        <td>
                          {formatAlertConfidence(alert)}
                          {alert.vol_ok !== undefined ? (
                            <span className={`badge ${alert.vol_ok ? "ok" : "bad"}`}>VOL</span>
                          ) : null}
                          {alert.di_ok !== undefined ? (
                            <span className={`badge ${alert.di_ok ? "ok" : "bad"}`}>DI</span>
                          ) : null}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-small"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAlertRowClick(alert.id);
                              }}
                            >
                              Open
                            </button>
                            <button
                              className="btn btn-small btn-secondary"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                window.location.assign("/replay");
                              }}
                            >
                              Replay
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {alertDetailsId ? (
              <div className="drawer">
                <div className="drawer-header">
                  <strong>Alert {alertDetailsId}</strong>
                  <button className="btn btn-small" type="button" onClick={handleCloseDetails}>
                    Close
                  </button>
                </div>
                {alertDetailsError ? <div className="error">{alertDetailsError}</div> : null}
                {alertDetails ? (
                  <div className="drawer-body">
                    <div className="drawer-meta">
                      <span>
                        {alertDetails.symbol} {alertDetails.tf} {alertDetails.type} {alertDetails.direction}
                      </span>
                      <span>S/R Level: {alertDetails.level ?? "-"}</span>
                    </div>
                    <div className="drawer-meta">
                      <span>Entry: {alertDetails.entry ?? "-"}</span>
                      <span>SL: {alertDetails.sl ?? "-"}</span>
                    </div>
                    <div className="drawer-meta">
                      <span>Notify error: {alertDetails.notify_error ?? "-"}</span>
                    </div>
                    {alertDetails.payload?.candle ? (
                      <div className="drawer-meta">
                        <span>
                          Candle O/H/L/C/V: {alertDetails.payload.candle.open}/{alertDetails.payload.candle.high}/
                          {alertDetails.payload.candle.low}/{alertDetails.payload.candle.close}/
                          {alertDetails.payload.candle.volume}
                        </span>
                      </div>
                    ) : null}
                    {alertDetails.payload?.level_event ? (
                      <div className="drawer-meta">
                        <span>
                          Indices: break {alertDetails.payload.level_event.break_index ?? "-"}, retest{" "}
                          {alertDetails.payload.level_event.retest_index ?? "-"}, fakeout{" "}
                          {alertDetails.payload.level_event.fakeout_index ?? "-"}
                        </span>
                      </div>
                    ) : null}
                    <div className="inline-form">
                      <button
                        className="btn btn-small"
                        type="button"
                        onClick={() => handleCopyText(formatTelegramText(alertDetails))}
                      >
                        Copy Telegram Text
                      </button>
                      <button
                        className="btn btn-small"
                        type="button"
                        onClick={() => handleCopyText(JSON.stringify(alertDetails, null, 2))}
                      >
                        Copy JSON
                      </button>
                      <button
                        className="btn btn-small"
                        type="button"
                        onClick={() => window.open(getBinanceLink(alertDetails.symbol), "_blank", "noopener")}
                      >
                        Open Binance Chart
                      </button>
                    </div>
                    <pre>{JSON.stringify(alertDetails.payload ?? alertDetails, null, 2)}</pre>
                  </div>
                ) : (
                  <p className="muted">Loading alert details...</p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            {suppressedError ? <div className="error">{suppressedError}</div> : null}
            <div className="inline-form">
              <label className="field">
                <span>Reason</span>
                <select value={suppressedReason} onChange={(event) => setSuppressedReason(event.target.value)}>
                  {suppressedReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filteredSuppressed.length === 0 ? (
              <p className="muted">No suppressed items yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Symbol</th>
                      <th>TF</th>
                      <th>Type</th>
                      <th>Dir</th>
                      <th>Level</th>
                      <th>Score</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppressed.map((item, idx) => (
                      <tr key={`${item.time}-${idx}`}>
                        <td>{formatTimestamp(item.time)}</td>
                        <td>{item.symbol}</td>
                        <td>{item.tf}</td>
                        <td>{item.type}</td>
                        <td>{item.direction}</td>
                        <td>{item.level ?? "-"}</td>
                        <td>{item.score ?? "-"}</td>
                        <td>
                          {item.reason}
                          {item.details && item.details.length > 0 ? ` (${item.details.join(", ")})` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
      ) : null}

      {showDashboard ? (
        <>
          <section className="card signals-side-card signal-intelligence-card">
            <h2>Signal Intelligence</h2>
            <div className="intel-stack">
              <div className="intel-row">
                <span>Direction</span>
                <StatusBadge tone={latestAlert?.direction === "long" ? "success" : latestAlert?.direction === "short" ? "danger" : "muted"}>
                  {latestAlert?.direction ?? chartDetails?.direction ?? "-"}
                </StatusBadge>
              </div>
              <div className="intel-row">
                <span>Setup quality</span>
                <strong>{formatAlertConfidence(latestAlert)}</strong>
              </div>
              <div className="intel-row">
                <span>ADX</span>
                <strong>{formatNumber(chartDiPeak?.adx14_last)}</strong>
              </div>
              <div className="intel-row">
                <span>DI+ / DI-</span>
                <strong>
                  {formatNumber(chartDiPeak?.di_plus?.last)} / {formatNumber(chartDiPeak?.di_minus?.last)}
                </strong>
              </div>
              <div className="intel-row">
                <span>Volume ratio</span>
                <strong>{formatNumber(chartVol?.vol_ratio)}</strong>
              </div>
              <div className="intel-row">
                <span>Pullback / fake volume</span>
                <strong>
                  {String(chartVol?.pullback_vol_decline ?? "-")} / {String(latestAlert?.vol_ok ?? "-")}
                </strong>
              </div>
              <div className="intel-row">
                <span>Key S/R level</span>
                <strong>{formatNumber(keyLevel)}</strong>
              </div>
            </div>
          </section>

          <section className="card signals-side-card bot-status-card">
            <h2>Bot Status</h2>
            <div className="intel-stack">
              <div className="intel-row">
                <span>Status</span>
                <StatusBadge tone={scannerStatusTone}>{scannerStatusLabel}</StatusBadge>
              </div>
              <div className="intel-row">
                <span>Last heartbeat</span>
                <strong>{formatTimestamp(pollerStatus?.last_tick_at)}</strong>
              </div>
              <div className="intel-row">
                <span>Latency</span>
                <strong>-</strong>
              </div>
              <div className="intel-row">
                <span>Symbols monitored</span>
                <strong>{watchlistItems.length || symbols.length || "-"}</strong>
              </div>
              <div className="intel-row">
                <span>Active timeframes</span>
                <strong>{activeTimeframes.length > 0 ? activeTimeframes.join(", ") : "-"}</strong>
              </div>
              <div className="intel-row">
                <span>Errors last hour</span>
                <strong className={alertErrors > 0 ? "error-text" : ""}>{alertErrors}</strong>
              </div>
            </div>
          </section>

          <section className="card signals-side-card sr-summary-card">
            <h2>Active S/R Summary</h2>
            <div className="sr-summary">
              <div>
                <span>Support levels</span>
                <strong>{supportLevels.length > 0 ? supportLevels.map((level) => formatNumber(level.center)).join(", ") : "-"}</strong>
              </div>
              <div>
                <span>Resistance levels</span>
                <strong>{resistanceLevels.length > 0 ? resistanceLevels.map((level) => formatNumber(level.center)).join(", ") : "-"}</strong>
              </div>
              <div>
                <span>Source timeframe</span>
                <strong>{levels?.htf_timeframe ?? "-"}</strong>
              </div>
              <div>
                <span>Last updated</span>
                <strong>{lastSyncTime ? formatTimestamp(lastSyncTime) : "-"}</strong>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {showOps ? (
        <>
          <PageHeader
            title="System Health"
            eyebrow="Operations"
            actions={
              <>
                <button className="btn btn-secondary" type="button" onClick={handleRefreshSettings}>
                  Refresh
                </button>
                <button className="btn btn-secondary" type="button" onClick={handleSendTelegramTest}>
                  Test Telegram Alert
                </button>
              </>
            }
          >
            Monitor scanner uptime, integrations, service status, and operational logs.
          </PageHeader>

          {pollerError ? (
            <ErrorState title="Could not load system health" onRetry={handleRefreshSettings} onViewLogs={() => setOpsLogLevel("ERROR")}>
              Check the bot service status or retry the request.
            </ErrorState>
          ) : null}

          <div className="metric-strip ops-status-strip">
            <MetricCard label="Scanner status" value={<StatusBadge tone={scannerStatusTone}>{scannerStatusLabel}</StatusBadge>} />
            <MetricCard label="Last heartbeat" value={formatTimestamp(pollerStatus?.last_tick_at)} />
            <MetricCard label="API latency" value="-" />
            <MetricCard label="Binance connection" value={<StatusBadge tone={pollerStatus?.is_running ? "success" : "muted"}>{pollerStatus?.is_running ? "Connected" : "Unknown"}</StatusBadge>} />
            <MetricCard label="Telegram status" value={<StatusBadge tone={telegramSettings?.enabled ? "success" : "muted"}>{telegramSettings?.enabled ? "Connected" : "Disabled"}</StatusBadge>} />
            <MetricCard label="Errors last hour" value={alertErrors} tone={alertErrors > 0 ? "danger" : "default"} />
            <MetricCard label="Queue depth" value="-" />
            <MetricCard label="Last sync" value={lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : "-"} />
          </div>

          <div className="ops-dashboard-grid">
            <main className="ops-main-column">
              <section className="card ops-service-card">
                <div className="card-header">
                  <div>
                    <h2>Service Status</h2>
                    <span className="muted">Scanner, integrations, storage, and worker health.</span>
                  </div>
                </div>
                <div className="card-body">
                  {pollerStatus ? (
                    <div className="table-wrap ops-service-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Service</th>
                            <th>Status</th>
                            <th>Last checked</th>
                            <th>Latency</th>
                            <th>Errors</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {serviceRows.map((service) => (
                            <tr key={service.name}>
                              <td>
                                <strong>{service.name}</strong>
                                <span className="ops-service-subtitle">{service.description}</span>
                              </td>
                              <td><StatusBadge tone={service.tone}>{service.status}</StatusBadge></td>
                              <td>{service.lastChecked}</td>
                              <td>{service.latency}</td>
                              <td className={Number(service.errors) > 0 ? "error-text" : ""}>{service.errors}</td>
                              <td>
                                <div className="row-actions">
                                  {service.action === "telegram" ? (
                                    <button className="btn btn-small btn-secondary" type="button" onClick={handleSendTelegramTest}>
                                      Test
                                    </button>
                                  ) : service.action === "logs" ? (
                                    <button className="btn btn-small btn-secondary" type="button" onClick={() => setOpsLogSource(service.sourceFilter)}>
                                      Open logs
                                    </button>
                                  ) : (
                                    <button className="btn btn-small btn-secondary" type="button" onClick={handleRefreshSettings}>
                                      Retry
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <LoadingSkeleton label="Loading service status" rows={6} />
                  )}
                </div>
              </section>

              <section className="card ops-logs-card">
                <div className="card-header ops-logs-header">
                  <div>
                    <h2>Operational Logs</h2>
                    <span className="muted">{filteredOperationalLogs.length} events visible</span>
                  </div>
                  <div className="ops-log-filters">
                    <input
                      type="search"
                      value={opsLogSearch}
                      onChange={(event) => setOpsLogSearch(event.target.value)}
                      placeholder="Search logs"
                    />
                    <select value={opsLogLevel} onChange={(event) => setOpsLogLevel(event.target.value)}>
                      <option value="all">All levels</option>
                      <option value="DEBUG">DEBUG</option>
                      <option value="INFO">INFO</option>
                      <option value="WARN">WARN</option>
                      <option value="ERROR">ERROR</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                    <select value={opsLogSource} onChange={(event) => setOpsLogSource(event.target.value)}>
                      {opsLogSources.map((source) => (
                        <option key={`ops-source-${source}`} value={source}>
                          {source === "all" ? "All sources" : source}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-small btn-secondary" type="button" onClick={handleRefreshSettings}>
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {filteredOperationalLogs.length > 0 ? (
                    <div className="table-wrap ops-log-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Level</th>
                            <th>Source</th>
                            <th>Symbol</th>
                            <th>Message</th>
                            <th>Trace / ID</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOperationalLogs.map((log) => (
                            <tr key={log.id} className="clickable" onClick={() => setOpsSelectedLog(log)}>
                              <td className="mono-cell">{formatTimestamp(log.time)}</td>
                              <td><LogLevelBadge level={log.level} /></td>
                              <td>{log.source}</td>
                              <td>{log.symbol ?? "-"}</td>
                              <td className="ops-log-message">{log.message}</td>
                              <td className="mono-cell">{log.traceId ?? "-"}</td>
                              <td>
                                <button className="btn btn-small btn-ghost" type="button" onClick={(event) => {
                                  event.stopPropagation();
                                  setOpsSelectedLog(log);
                                }}>
                                  Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      title="No logs found"
                      actions={
                        <button className="btn btn-small btn-secondary" type="button" onClick={() => {
                          setOpsLogSearch("");
                          setOpsLogLevel("all");
                          setOpsLogSource("all");
                        }}>
                          Clear filters
                        </button>
                      }
                    >
                      No operational events match the current filters.
                    </EmptyState>
                  )}
                  {opsSelectedLog ? (
                    <div className="drawer ops-log-detail">
                      <div className="drawer-header">
                        <strong>Log Detail</strong>
                        <button className="btn btn-small btn-secondary" type="button" onClick={() => setOpsSelectedLog(null)}>
                          Close
                        </button>
                      </div>
                      <div className="drawer-meta">
                        <span>{formatTimestamp(opsSelectedLog.time)}</span>
                        <LogLevelBadge level={opsSelectedLog.level} />
                        <span>{opsSelectedLog.source}</span>
                        <span>{opsSelectedLog.symbol ?? "-"}</span>
                      </div>
                      <p className="ops-log-detail-message">{opsSelectedLog.message}</p>
                      <details>
                        <summary>Advanced details</summary>
                        <pre>{JSON.stringify(opsSelectedLog.raw ?? opsSelectedLog, null, 2)}</pre>
                      </details>
                    </div>
                  ) : null}
                </div>
              </section>
            </main>

            <aside className="ops-side-column">
              <section className="card ops-side-card">
                <div className="card-header">
                  <h2>Connection Health</h2>
                </div>
                <div className="card-body">
                  <div className="ops-connection-list">
                    <ConnectionHealthRow name="Binance" tone={pollerStatus?.is_running ? "success" : "muted"} status={pollerStatus?.is_running ? "Connected" : "Unknown"} detail={`Last scan ${formatTimestamp(pollerStatus?.last_scan_at)}`} />
                    <ConnectionHealthRow name="Telegram" tone={telegramSettings?.enabled ? "success" : "muted"} status={telegramSettings?.enabled ? "Connected" : "Disabled"} detail={telegramSettings?.has_bot_token ? "Bot token configured" : "No bot token saved"} action={<button className="btn btn-small btn-secondary" type="button" onClick={handleSendTelegramTest}>Test</button>} />
                    <ConnectionHealthRow name="Webhook" tone="muted" status="Not configured" detail="No webhook controls exposed by backend" />
                    <ConnectionHealthRow name="Internal API" tone="success" status="Healthy" detail="Health endpoint available" />
                    <ConnectionHealthRow name="Storage" tone="success" status="Available" detail="Alert and journal APIs responding" />
                  </div>
                </div>
              </section>

              <section className="card ops-side-card">
                <div className="card-header">
                  <h2>Recent Incidents</h2>
                </div>
                <div className="card-body">
                  {incidentLogs.length > 0 ? (
                    <div className="ops-incident-list">
                      {incidentLogs.map((log) => (
                        <button className="ops-incident-item" key={`incident-${log.id}`} type="button" onClick={() => setOpsSelectedLog(log)}>
                          <LogLevelBadge level={log.level} />
                          <strong>{log.source}</strong>
                          <span>{log.message}</span>
                          <small>{formatTimestamp(log.time)}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No recent errors">
                      The scanner has not reported warnings or errors in the selected time range.
                    </EmptyState>
                  )}
                </div>
              </section>

              <section className="card ops-side-card">
                <div className="card-header">
                  <h2>Admin / Maintenance</h2>
                </div>
                <div className="card-body">
                  <div className="settings-admin-token-row ops-admin-token-row">
                    <label className="field">
                      <span>Admin token</span>
                      <input
                        type="password"
                        value={adminTokenDraft}
                        onChange={(event) => setAdminTokenDraft(event.target.value)}
                        placeholder="Required for protected admin actions"
                        autoComplete="off"
                      />
                    </label>
                    <button className="btn btn-small" type="button" onClick={handleSaveAdminTokenDraft}>
                      Save
                    </button>
                    <button className="btn btn-small btn-secondary" type="button" onClick={handleClearAdminTokenDraft}>
                      Clear
                    </button>
                  </div>
                  <div className="ops-maintenance-actions">
                    <button className="btn btn-small btn-success" type="button" onClick={() => handleSetPollerMode("run")} disabled={!pollerStatus || pollerStatus.mode === "run"}>
                      Run scanner
                    </button>
                    <button className="btn btn-small btn-warning" type="button" onClick={() => handleSetPollerMode("pause_new")} disabled={!pollerStatus || pollerStatus.mode === "pause_new"}>
                      Pause new alerts
                    </button>
                    <button className="btn btn-small btn-danger" type="button" onClick={() => handleSetPollerMode("pause_all")} disabled={!pollerStatus || pollerStatus.mode === "pause_all"}>
                      Pause all
                    </button>
                    <button className="btn btn-small btn-secondary" type="button" onClick={handleSendTelegramTest}>
                      Test Telegram Alert
                    </button>
                  </div>
                  {telegramFeedback ? (
                    <span className={telegramFeedback.ok ? "settings-feedback" : "error-text"}>{telegramFeedback.message}</span>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {false && showOps ? (
      <section className="card">
        <h2>System Health</h2>
        {pollerError ? <div className="error">{pollerError}</div> : null}
        {pollerStatus ? (
          <div className="bias-grid">
            <div>
              <span>Status</span>
              <strong>
                {pollerStatus.is_running
                  ? pollerStatus.mode === "pause_all"
                    ? "Paused (All)"
                    : pollerStatus.mode === "pause_new"
                      ? "Paused (New Alerts)"
                      : "Running"
                  : "Stopped"}
              </strong>
            </div>
            <div>
              <span>Last Tick</span>
              <strong>{formatTimestamp(pollerStatus.last_tick_at)}</strong>
            </div>
            <div>
              <span>Last Scan</span>
              <strong>{formatTimestamp(pollerStatus.last_scan_at)}</strong>
            </div>
            <div>
              <span>Last Scan Count</span>
              <strong>{pollerStatus.last_scan_count ?? "-"}</strong>
            </div>
            <div>
              <span>Last New Alerts</span>
              <strong>{pollerStatus.last_new_alerts ?? "-"}</strong>
            </div>
            <div>
              <span>Suppressed New Alerts</span>
              <strong>
                {pollerStatus.mode === "pause_new" ? pollerStatus.last_suppressed_new_alerts ?? "-" : "-"}
              </strong>
            </div>
            <div>
              <span>Last Error</span>
              <strong className={pollerStatus.last_error ? "error-text" : ""}>
                {pollerStatus.last_error || "-"}
              </strong>
            </div>
          </div>
        ) : (
          <p className="muted">Loading poller status...</p>
        )}
        <div className="inline-form">
          <button
            className="btn"
            type="button"
            onClick={() => handleSetPollerMode("run")}
            disabled={!pollerStatus || pollerStatus.mode === "run"}
          >
            Run
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => handleSetPollerMode("pause_new")}
            disabled={!pollerStatus || pollerStatus.mode === "pause_new"}
          >
            Pause New
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => handleSetPollerMode("pause_all")}
            disabled={!pollerStatus || pollerStatus.mode === "pause_all"}
          >
            Pause All
          </button>
        </div>
        <div className="levels-grid">
          <div>
            <h3>Telegram Notifier</h3>
            {telegramSettingsError ? <div className="error">{telegramSettingsError}</div> : null}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={telegramForm.enabled}
                onChange={(event) =>
                  setTelegramForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              Enabled
            </label>
            <label className="field">
              <span>Bot token</span>
              <input
                type="password"
                value={telegramForm.bot_token}
                onChange={(event) =>
                  setTelegramForm((prev) => ({ ...prev, bot_token: event.target.value }))
                }
                placeholder={
                  telegramSettings?.has_bot_token ? "Token saved; leave blank to keep it" : "Telegram bot token"
                }
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Chat ID</span>
              <input
                type="text"
                value={telegramForm.chat_id}
                onChange={(event) =>
                  setTelegramForm((prev) => ({ ...prev, chat_id: event.target.value }))
                }
                placeholder="Telegram chat ID"
              />
            </label>
            <div className="inline-form inline-form-tight">
              <button className="btn" type="button" onClick={handleSaveTelegramSettings}>
                Save Telegram
              </button>
              <span className="muted">
                {telegramSettings?.has_bot_token ? "Bot token configured" : "No bot token saved"}
              </span>
            </div>
            {telegramSettingsStatus ? <p className="muted">{telegramSettingsStatus}</p> : null}
          </div>
        </div>
        <div className="inline-form">
          <input
            type="text"
            value={telegramText}
            onChange={(event) => setTelegramText(event.target.value)}
            placeholder="Test message (optional)"
          />
          <button className="btn" type="button" onClick={handleSendTelegramTest}>
            Test Telegram Alert
          </button>
        </div>
        {telegramFeedback ? (
          <p className={telegramFeedback.ok ? "muted" : "error-text"}>{telegramFeedback.message}</p>
        ) : null}
      </section>
      ) : null}

      {false && showOps ? (
      <section className="card">
        <h2>Alert Quality</h2>
        {qualityError ? <div className="error">{qualityError}</div> : null}
        {qualitySettings ? (
          <div className="levels-grid">
            <div>
              <h3>Min Score</h3>
              <label className="field">
                <span>Break</span>
                <input
                  type="number"
                  value={qualitySettings.min_score_by_type?.break ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["min_score_by_type", "break"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Retest</span>
                <input
                  type="number"
                  value={qualitySettings.min_score_by_type?.retest ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["min_score_by_type", "retest"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Setup</span>
                <input
                  type="number"
                  value={qualitySettings.min_score_by_type?.setup ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["min_score_by_type", "setup"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Fakeout</span>
                <input
                  type="number"
                  value={qualitySettings.min_score_by_type?.fakeout ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["min_score_by_type", "fakeout"], event.target.value)
                    )
                  }
                />
              </label>
            </div>
            <div>
              <h3>Cooldown (min)</h3>
              <label className="field">
                <span>Break</span>
                <input
                  type="number"
                  value={qualitySettings.cooldown_minutes_by_type?.break ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["cooldown_minutes_by_type", "break"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Retest</span>
                <input
                  type="number"
                  value={qualitySettings.cooldown_minutes_by_type?.retest ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["cooldown_minutes_by_type", "retest"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Setup</span>
                <input
                  type="number"
                  value={qualitySettings.cooldown_minutes_by_type?.setup ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["cooldown_minutes_by_type", "setup"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Fakeout</span>
                <input
                  type="number"
                  value={qualitySettings.cooldown_minutes_by_type?.fakeout ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["cooldown_minutes_by_type", "fakeout"], event.target.value)
                    )
                  }
                />
              </label>
            </div>
            <div>
              <h3>Rate Limits</h3>
              <label className="field">
                <span>Per Symbol / Hour</span>
                <input
                  type="number"
                  value={qualitySettings.max_alerts_per_symbol_per_hour ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["max_alerts_per_symbol_per_hour"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Global / Hour</span>
                <input
                  type="number"
                  value={qualitySettings.max_alerts_global_per_hour ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["max_alerts_global_per_hour"], event.target.value)
                    )
                  }
                />
              </label>
            </div>
            <div>
              <h3>Quiet Hours</h3>
              <label className="field">
                <span>Enabled</span>
                <select
                  value={qualitySettings.quiet_hours?.enabled ? "yes" : "no"}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["quiet_hours", "enabled"], event.target.value === "yes")
                    )
                  }
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label className="field">
                <span>Start</span>
                <input
                  type="text"
                  value={qualitySettings.quiet_hours?.start ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["quiet_hours", "start"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>End</span>
                <input
                  type="text"
                  value={qualitySettings.quiet_hours?.end ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["quiet_hours", "end"], event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>TZ</span>
                <input
                  type="text"
                  value={qualitySettings.quiet_hours?.tz ?? ""}
                  onChange={(event) =>
                    setQualitySettings((prev) =>
                      updateQuality(prev, ["quiet_hours", "tz"], event.target.value)
                    )
                  }
                />
              </label>
            </div>
          </div>
        ) : (
          <p className="muted">Loading quality settings...</p>
        )}
        <button className="btn" type="button" onClick={handleSaveQuality}>
          Save Alert Settings
        </button>
        {qualitySaveStatus ? <p className="muted">{qualitySaveStatus}</p> : null}
      </section>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>Watchlist</h2>
        {watchlist ? (
          <pre>{JSON.stringify(watchlist, null, 2)}</pre>
        ) : (
          <p className="muted">Loading watchlist...</p>
        )}
      </section>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>Indicator Snapshot</h2>
        {indicatorError ? <div className="error">{indicatorError}</div> : null}
        {indicators ? (
          <div className="indicator-grid">
            <div>
              <span>RSI(14)</span>
              <strong>{latestValue(indicators.rsi14)}</strong>
            </div>
            <div>
              <span>ATR(5)</span>
              <strong>{latestValue(indicators.atr5)}</strong>
            </div>
            <div>
              <span>SMA(7)</span>
              <strong>{latestValue(indicators.sma7)}</strong>
            </div>
            <div>
              <span>DI+</span>
              <strong>{latestValue(indicators.di_plus)}</strong>
            </div>
            <div>
              <span>DI-</span>
              <strong>{latestValue(indicators.di_minus)}</strong>
            </div>
            <div>
              <span>ADX(14)</span>
              <strong>{latestValue(indicators.adx14)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Loading indicators...</p>
        )}
      </section>
      ) : null}

      {showLevels ? (
        <>
          <section className="card levels-effective-card">
            <h2>Effective Levels</h2>
            {levelsError ? (
              <ErrorState
                title="Could not load S/R levels"
                onRetry={handleRefreshLevels}
                onViewLogs={() => window.location.assign("/ops")}
              >
                Check the scanner status or retry the request.
              </ErrorState>
            ) : null}
            {!levels && !levelsError ? <LoadingSkeleton label="Loading effective levels" rows={5} /> : null}
            {levels && effectiveLevels.length === 0 ? (
              <EmptyState
                title="No effective levels"
                actions={
                  <button className="btn btn-small" type="button" onClick={handleRefreshLevels}>
                    Refresh
                  </button>
                }
              >
                No detected or pinned levels are currently active for this selection.
              </EmptyState>
            ) : null}
            {levels && effectiveLevels.length > 0 ? (
              <div className="level-card-list">
                {effectiveLevels.map((level) => (
                  <LevelCard
                    key={level.id}
                    level={level}
                    onRemovePinned={handleRemovePinned}
                    onRemoveDisabled={handleRemoveDisabled}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="card levels-detected-card">
            <h2>Detected Pattern Levels</h2>
            {levels ? (
              <div className="levels-meta-grid">
                <div>
                  <span>HTF source</span>
                  <strong>{levels.htf_timeframe ?? "-"}</strong>
                </div>
                <div>
                  <span>Lookback</span>
                  <strong>{levels.lookback_window ?? "-"}</strong>
                </div>
                <div>
                  <span>Last HTF close</span>
                  <strong>{formatNumber(levels.last_close_used)}</strong>
                </div>
              </div>
            ) : null}
            {!levels && !levelsError ? <LoadingSkeleton label="Loading detected levels" rows={4} /> : null}
            {levels && (!Array.isArray(levels.final_levels_detailed) || levels.final_levels_detailed.length === 0) ? (
              <EmptyState
                title="No pattern levels detected"
                actions={
                  <button className="btn btn-small" type="button" onClick={handleRefreshLevels}>
                    Refresh
                  </button>
                }
              >
                The scanner has not detected active support or resistance levels for this symbol and timeframe yet.
              </EmptyState>
            ) : null}
            {levels && Array.isArray(levels.final_levels_detailed) && levels.final_levels_detailed.length > 0 ? (
              <div className="level-card-list">
                {levels.final_levels_detailed.map((level, idx) => (
                  <LevelCard key={`${level.role}-${level.center}-${idx}`} level={normalizeDetectedLevel(level, levels)} />
                ))}
              </div>
            ) : null}
          </section>

          <section className="card levels-overrides-card">
            <h2>Override Controls</h2>
            <OverridePanel
              title="Pinned Levels"
              value={pinnedInput}
              onChange={setPinnedInput}
              onAdd={handleAddPinned}
              items={pinnedLevels}
              onRemove={handleRemovePinned}
              placeholder="Add pinned level"
              tone="pinned"
            />
            <OverridePanel
              title="Disabled Levels"
              value={disabledInput}
              onChange={setDisabledInput}
              onAdd={handleAddDisabled}
              items={disabledLevels}
              onRemove={handleRemoveDisabled}
              placeholder="Disable level"
              tone="disabled"
            />
          </section>

          <section className="card levels-rules-card">
            <h2>Level Rules</h2>
            <div className="level-rules-list">
              <p>Entry timeframes use higher-timeframe S/R where configured.</p>
              <p>Pinned levels are manually forced into effective levels.</p>
              <p>Disabled levels are excluded from scanner decisions.</p>
            </div>
          </section>
        </>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>DI Peak</h2>
        {diPeakError ? <div className="error">{diPeakError}</div> : null}
        <div className="di-controls">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={diTf} onChange={(event) => setDiTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
        </div>
        {diPeak ? (
          <div className="di-grid">
            <div>
              <span>DI+</span>
              <strong>{formatNumber(diPeak.di_plus?.last)}</strong>
              <small>
                Zone {formatNumber(diPeak.di_plus?.peak)} | Distance {formatNumber(diPeak.di_plus?.distance_pct)}
              </small>
              <span className="badge">{diPeak.di_plus?.in_peak_zone ? "Zone" : "Out"}</span>
              <span className="badge">{diPeak.di_plus?.is_peak ? "Peak" : "No Peak"}</span>
            </div>
            <div>
              <span>DI-</span>
              <strong>{formatNumber(diPeak.di_minus?.last)}</strong>
              <small>
                Zone {formatNumber(diPeak.di_minus?.peak)} | Distance {formatNumber(diPeak.di_minus?.distance_pct)}
              </small>
              <span className="badge">{diPeak.di_minus?.in_peak_zone ? "Zone" : "Out"}</span>
              <span className="badge">{diPeak.di_minus?.is_peak ? "Peak" : "No Peak"}</span>
            </div>
            <div>
              <span>Not At Peak (Long)</span>
              <strong>{String(diPeak.not_at_peak_long)}</strong>
            </div>
            <div>
              <span>Not At Peak (Short)</span>
              <strong>{String(diPeak.not_at_peak_short)}</strong>
            </div>
            <div>
              <span>ADX(14)</span>
              <strong>{formatNumber(diPeak.adx14_last)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Loading DI peak...</p>
        )}
      </section>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>Volume</h2>
        {volError ? <div className="error">{volError}</div> : null}
        <div className="di-controls">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={volTf} onChange={(event) => setVolTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
        </div>
        {volData ? (
          <div className="di-grid">
            <div>
              <span>Vol Ratio</span>
              <strong>{formatNumber(volData.vol_ratio)}</strong>
            </div>
            <div>
              <span>MA5 Slope (%)</span>
              <strong>{formatNumber(volData.vol_ma5_slope_pct)}</strong>
              <span className="badge">{volData.vol_ma5_slope_ok ? "Slope OK" : "Slope Low"}</span>
            </div>
            <div>
              <span>Pullback Decline</span>
              <strong>{String(volData.pullback_vol_decline)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Loading volume...</p>
        )}
      </section>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>RSI / ATR</h2>
        {rsiError ? <div className="error">{rsiError}</div> : null}
        <div className="di-controls">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={rsiTf} onChange={(event) => setRsiTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
        </div>
        {rsiData ? (
          <div className="di-grid">
            <div>
              <span>RSI(14)</span>
              <strong>{formatNumber(rsiData.rsi14_last)}</strong>
            </div>
            <div>
              <span>RSI Distance</span>
              <strong>{formatNumber(rsiData.rsi_distance)}</strong>
            </div>
            <div>
              <span>ATR(5)</span>
              <strong>{formatNumber(rsiData.atr5_last)}</strong>
            </div>
            <div>
              <span>ATR Mult</span>
              <strong>{formatNumber(rsiData.atr_mult)}</strong>
            </div>
            <div>
              <span>ATR Stop Dist</span>
              <strong>{formatNumber(rsiData.atr_stop_distance)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Loading RSI/ATR...</p>
        )}
      </section>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>Level Events</h2>
        {levelEventsError ? <div className="error">{levelEventsError}</div> : null}
        <div className="di-controls">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={levelEventsTf} onChange={(event) => setLevelEventsTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
        </div>
        {levelEvents ? (
          levelEvents.events.length === 0 ? (
            <p className="muted">No level events yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Direction</th>
                    <th>Last Break</th>
                    <th>Retest</th>
                    <th>Fakeout</th>
                  </tr>
                </thead>
                <tbody>
                  {levelEvents.events.map((event) => (
                    <tr key={`${event.level}-${event.last_break?.index ?? "none"}`}>
                      <td>{event.level}</td>
                      <td>{event.direction ?? "-"}</td>
                      <td>{event.last_break ? new Date(event.last_break.time).toLocaleString() : "-"}</td>
                      <td>{String(event.retest_touched)}</td>
                      <td>{event.last_fakeout ? new Date(event.last_fakeout.time).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="muted">Loading level events...</p>
        )}
      </section>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>Setup Candles</h2>
        {setupError ? <div className="error">{setupError}</div> : null}
        <div className="di-controls">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={setupTf} onChange={(event) => setSetupTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
        </div>
        {setupCandles ? (
          setupCandles.items.length === 0 ? (
            <p className="muted">No setup candles yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Direction</th>
                    <th>Time</th>
                    <th>Entry</th>
                    <th>SL</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {setupCandles.items.map((item) => (
                    <tr key={`${item.level}-${item.setup_index}-${item.direction}`}>
                      <td>{item.level}</td>
                      <td>{item.direction}</td>
                      <td>{new Date(item.time).toLocaleString()}</td>
                      <td>{item.entry}</td>
                      <td>{item.sl}</td>
                      <td>{formatNumber(Math.abs(item.entry - item.sl))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="muted">Loading setup candles...</p>
        )}
      </section>
      ) : null}

      {showLegacyDashboardSections ? (
      <section className="card">
        <h2>Openings</h2>
        {openingsError ? <div className="error">{openingsError}</div> : null}
        <div className="di-controls">
          <label className="field">
            <span>Symbol</span>
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={openingsTf} onChange={(event) => setOpeningsTf(event.target.value)}>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
        </div>
        {openings ? (
          <div>
            <div className="bias-grid">
              <div>
                <span>Last Candle</span>
                <strong>{openings.last_candle_time ? new Date(openings.last_candle_time).toLocaleString() : "-"}</strong>
              </div>
            </div>
            {openings.signals.length === 0 ? (
              <p className="muted">No openings on last candle.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Direction</th>
                      <th>Level</th>
                      <th>Entry</th>
                      <th>SL</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                  {openings.signals.map((signal, idx) => (
                      <tr key={`${signal.type}-${signal.level}-${idx}`}>
                        <td>{signal.type}</td>
                        <td>
                          {signal.direction}
                          <span className={`badge ${signal.context?.vol_ma5_slope_ok ? "ok" : "bad"}`}>
                            VOL
                          </span>
                          <span
                            className={`badge ${
                              signal.direction === "long"
                                ? signal.context?.not_at_peak_long
                                  ? "ok"
                                  : "bad"
                                : signal.context?.not_at_peak_short
                                  ? "ok"
                                  : "bad"
                            }`}
                          >
                            DI
                          </span>
                        </td>
                        <td>{signal.level}</td>
                        <td>{signal.entry}</td>
                        <td>{signal.sl ?? "-"}</td>
                        <td>{signal.sl_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {openings.signals.length > 0 ? (
              <div className="openings-details">
                {openings.signals.map((signal, idx) => (
                  <div key={`detail-${signal.type}-${idx}`} className="openings-detail">
                    <span>
                      {signal.type} @ {signal.level}: candle O/H/L/C/V{" "}
                      {signal.candle
                        ? `${signal.candle.open}/${signal.candle.high}/${signal.candle.low}/${signal.candle.close}/${signal.candle.volume}`
                        : "-"}
                    </span>
                    <span>
                      indices: break {signal.level_event?.break_index ?? "-"}, retest{" "}
                      {signal.level_event?.retest_index ?? "-"}, fakeout {signal.level_event?.fakeout_index ?? "-"}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted">Loading openings...</p>
        )}
      </section>
      ) : null}
    </div>
  );
}

function SettingsRail({ sections, active, onSelect }) {
  return (
    <nav className="settings-rail" aria-label="Settings sections">
      {sections.map(([id, label, description]) => (
        <button
          key={id}
          className={`settings-rail-item ${active === id ? "active" : ""}`}
          type="button"
          onClick={() => onSelect(id)}
        >
          <strong>{label}</strong>
          <span>{description}</span>
        </button>
      ))}
    </nav>
  );
}

function SettingsMetaGrid({ items }) {
  return (
    <div className="settings-meta-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value === null || value === undefined || value === "" ? "-" : value}</strong>
        </div>
      ))}
    </div>
  );
}

function SettingsInfoCard({ title, items }) {
  return (
    <section className="card settings-card">
      <div className="card-header">
        <h2>{title}</h2>
      </div>
      <div className="card-body">
        <SettingsMetaGrid items={items} />
      </div>
    </section>
  );
}

function SettingsFieldGroup({ title, children }) {
  return (
    <div className="settings-field-group">
      <h3>{title}</h3>
      <div className="settings-field-list">{children}</div>
    </div>
  );
}

function SettingsIntegrationCard({ name, status, description, action }) {
  return (
    <section className="card settings-card">
      <div className="card-header">
        <div>
          <h2>{name}</h2>
          <span className="muted">{description}</span>
        </div>
        <StatusBadge tone={status === "Configured" ? "success" : "muted"}>{status}</StatusBadge>
      </div>
      {action ? <div className="card-body">{action}</div> : null}
    </section>
  );
}

function LogLevelBadge({ level }) {
  const normalized = String(level || "INFO").toUpperCase();
  const tone =
    normalized === "ERROR" || normalized === "CRITICAL"
      ? "danger"
      : normalized === "WARN" || normalized === "WARNING"
        ? "warning"
        : normalized === "INFO"
          ? "primary"
          : "muted";
  return <StatusBadge tone={tone}>{normalized}</StatusBadge>;
}

function ConnectionHealthRow({ name, status, tone, detail, action }) {
  return (
    <div className="ops-connection-row">
      <div>
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>
      <StatusBadge tone={tone}>{status}</StatusBadge>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function buildOperationalLogs({ pollerStatus, suppressed, alertsItems }) {
  const logs = [];
  if (pollerStatus?.last_error) {
    logs.push({
      id: "poller-last-error",
      time: pollerStatus.last_tick_at ?? Date.now(),
      level: "ERROR",
      source: "Scanner",
      symbol: null,
      message: pollerStatus.last_error,
      traceId: pollerStatus.mode ?? "poller",
      raw: pollerStatus
    });
  }
  (Array.isArray(alertsItems) ? alertsItems : [])
    .filter((alert) => alert?.notify_error)
    .forEach((alert, index) => {
      logs.push({
        id: `alert-notify-${alert.id ?? index}`,
        time: alert.time ?? alert.created_at ?? Date.now(),
        level: "ERROR",
        source: "Telegram",
        symbol: alert.symbol,
        message: alert.notify_error,
        traceId: alert.id ?? alert.signal_id ?? "-",
        raw: alert
      });
    });
  (Array.isArray(suppressed) ? suppressed : []).forEach((item, index) => {
    logs.push({
      id: `suppressed-${item.time ?? index}-${item.symbol ?? "unknown"}`,
      time: item.time ?? Date.now(),
      level: "WARN",
      source: "Alert Quality",
      symbol: item.symbol,
      message: `${item.reason ?? "Suppressed alert"}${Array.isArray(item.details) && item.details.length ? `: ${item.details.join("; ")}` : ""}`,
      traceId: `${item.type ?? "signal"}:${item.tf ?? "-"}`,
      raw: item
    });
  });
  if (logs.length === 0 && pollerStatus) {
    logs.push({
      id: "scanner-heartbeat",
      time: pollerStatus.last_tick_at ?? Date.now(),
      level: "INFO",
      source: "Scanner",
      symbol: null,
      message: "Scanner heartbeat received.",
      traceId: pollerStatus.mode ?? "poller",
      raw: pollerStatus
    });
  }
  return logs.sort((a, b) => Number(b.time ?? 0) - Number(a.time ?? 0));
}

function buildServiceRows({
  pollerStatus,
  telegramSettings,
  scannerStatusLabel,
  scannerStatusTone,
  lastSyncTime,
  alertErrors,
  symbolsCount
}) {
  return [
    {
      name: "Scanner",
      description: `${symbolsCount || "-"} symbols monitored`,
      status: scannerStatusLabel,
      tone: scannerStatusTone,
      lastChecked: formatTimestamp(pollerStatus?.last_tick_at),
      latency: "-",
      errors: pollerStatus?.last_error ? 1 : 0,
      action: "logs",
      sourceFilter: "Scanner"
    },
    {
      name: "Binance data stream",
      description: "Market data and candle ingestion",
      status: pollerStatus?.is_running ? "Connected" : "Unknown",
      tone: pollerStatus?.is_running ? "success" : "muted",
      lastChecked: formatTimestamp(pollerStatus?.last_scan_at),
      latency: "-",
      errors: 0,
      action: "retry"
    },
    {
      name: "Alert worker",
      description: "Signal evaluation and notification dispatch",
      status: pollerStatus?.mode === "pause_all" ? "Paused" : pollerStatus?.mode === "pause_new" ? "Delayed" : "Healthy",
      tone: pollerStatus?.mode === "pause_all" || pollerStatus?.mode === "pause_new" ? "warning" : "success",
      lastChecked: formatTimestamp(lastSyncTime),
      latency: "-",
      errors: alertErrors,
      action: "logs",
      sourceFilter: "Alert Quality"
    },
    {
      name: "Telegram",
      description: "Alert delivery channel",
      status: telegramSettings?.enabled ? "Connected" : "Disabled",
      tone: telegramSettings?.enabled ? "success" : "muted",
      lastChecked: "-",
      latency: "-",
      errors: 0,
      action: "telegram"
    },
    {
      name: "Webhook",
      description: "External webhook delivery",
      status: "Not configured",
      tone: "muted",
      lastChecked: "-",
      latency: "-",
      errors: 0,
      action: "retry"
    },
    {
      name: "Database / storage",
      description: "Alerts, journal, and settings persistence",
      status: "Available",
      tone: "success",
      lastChecked: formatTimestamp(lastSyncTime),
      latency: "-",
      errors: 0,
      action: "retry"
    },
    {
      name: "Scheduler",
      description: "Poller loop and timed refresh",
      status: pollerStatus?.is_running ? "Healthy" : "Disconnected",
      tone: pollerStatus?.is_running ? "success" : "danger",
      lastChecked: formatTimestamp(pollerStatus?.last_tick_at),
      latency: "-",
      errors: pollerStatus?.last_error ? 1 : 0,
      action: "logs",
      sourceFilter: "Scanner"
    },
    {
      name: "Paper trading engine",
      description: "Forward test processing",
      status: "Available",
      tone: "success",
      lastChecked: formatTimestamp(lastSyncTime),
      latency: "-",
      errors: 0,
      action: "retry"
    }
  ];
}

function latestValue(series) {
  if (!Array.isArray(series) || series.length === 0) {
    return "-";
  }
  const value = series[series.length - 1];
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toFixed(2);
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toFixed(2);
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function formatDateTimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocalMs(value) {
  if (!value) {
    return NaN;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function formatDurationMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) {
    return "-";
  }
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatWinLossRatio(sideStats) {
  if (!sideStats) {
    return "-";
  }
  const wins = Number(sideStats.wins ?? 0);
  const losses = Number(sideStats.losses ?? 0);
  if (losses <= 0) {
    return wins > 0 ? "inf" : "-";
  }
  return formatNumber(wins / losses);
}

function compareNullableNumber(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  const aValid = Number.isFinite(aNum);
  const bValid = Number.isFinite(bNum);
  if (!aValid && !bValid) {
    return 0;
  }
  if (!aValid) {
    return 1;
  }
  if (!bValid) {
    return -1;
  }
  return aNum - bNum;
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function evaluateReplaySignalOutcome(signal, candles) {
  const entry = signal.entry;
  const sl = signal.sl;
  const direction = signal.direction;
  const signalTime = signal.signal_time;
  const risk = Math.abs(entry - sl);
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(signalTime) || risk <= 0) {
    return null;
  }

  const rr2Target = direction === "long" ? entry + risk * 2 : entry - risk * 2;
  const rr5Target = direction === "long" ? entry + risk * 5 : entry - risk * 5;
  const rr10Target = direction === "long" ? entry + risk * 10 : entry - risk * 10;

  let maxRr = 0;
  let maxDrawdownR = 0;
  let outcome = "open";
  let outcomeTime = null;
  let outcomeCandleIndex = -1;
  let rr5Time = null;
  let rr10Time = null;

  for (let idx = 0; idx < candles.length; idx += 1) {
    const candle = candles[idx];
    if (!candle || candle.time <= signalTime) {
      continue;
    }
    const high = toFiniteNumber(candle.high);
    const low = toFiniteNumber(candle.low);
    if (high === null || low === null) {
      continue;
    }

    if (direction === "long") {
      const favorableR = Math.max(0, (high - entry) / risk);
      const adverseR = Math.max(0, (entry - low) / risk);
      const slHit = low <= sl;
      const rr2Hit = high >= rr2Target;
      if (slHit && rr2Hit) {
        outcome = "loss";
        outcomeTime = candle.time;
        outcomeCandleIndex = idx;
        maxDrawdownR = Math.max(maxDrawdownR, 1);
        break;
      }
      if (slHit) {
        outcome = "loss";
        outcomeTime = candle.time;
        outcomeCandleIndex = idx;
        maxDrawdownR = Math.max(maxDrawdownR, 1);
        break;
      }
      if (rr2Hit) {
        outcome = "win";
        outcomeTime = candle.time;
        outcomeCandleIndex = idx;
        maxRr = Math.max(maxRr, 2);
        maxDrawdownR = Math.max(maxDrawdownR, Math.min(1, adverseR));
        rr5Time = candle.time;
        rr10Time = candle.time;
        if (high < rr5Target) {
          rr5Time = null;
        }
        if (high < rr10Target) {
          rr10Time = null;
        }
        break;
      }
      maxRr = Math.max(maxRr, favorableR);
      maxDrawdownR = Math.max(maxDrawdownR, adverseR);
    } else if (direction === "short") {
      const favorableR = Math.max(0, (entry - low) / risk);
      const adverseR = Math.max(0, (high - entry) / risk);
      const slHit = high >= sl;
      const rr2Hit = low <= rr2Target;
      if (slHit && rr2Hit) {
        outcome = "loss";
        outcomeTime = candle.time;
        outcomeCandleIndex = idx;
        maxDrawdownR = Math.max(maxDrawdownR, 1);
        break;
      }
      if (slHit) {
        outcome = "loss";
        outcomeTime = candle.time;
        outcomeCandleIndex = idx;
        maxDrawdownR = Math.max(maxDrawdownR, 1);
        break;
      }
      if (rr2Hit) {
        outcome = "win";
        outcomeTime = candle.time;
        outcomeCandleIndex = idx;
        maxRr = Math.max(maxRr, 2);
        maxDrawdownR = Math.max(maxDrawdownR, Math.min(1, adverseR));
        rr5Time = candle.time;
        rr10Time = candle.time;
        if (low > rr5Target) {
          rr5Time = null;
        }
        if (low > rr10Target) {
          rr10Time = null;
        }
        break;
      }
      maxRr = Math.max(maxRr, favorableR);
      maxDrawdownR = Math.max(maxDrawdownR, adverseR);
    } else {
      return null;
    }
  }

  if (outcome === "win" && outcomeCandleIndex >= 0) {
    for (let idx = outcomeCandleIndex; idx < candles.length; idx += 1) {
      const candle = candles[idx];
      if (!candle || candle.time < outcomeTime) {
        continue;
      }
      const high = toFiniteNumber(candle.high);
      const low = toFiniteNumber(candle.low);
      if (high === null || low === null) {
        continue;
      }
      if (direction === "long") {
        maxRr = Math.max(maxRr, Math.max(0, (high - entry) / risk));
        if (rr5Time === null && high >= rr5Target) {
          rr5Time = candle.time;
        }
        if (rr10Time === null && high >= rr10Target) {
          rr10Time = candle.time;
        }
      } else {
        maxRr = Math.max(maxRr, Math.max(0, (entry - low) / risk));
        if (rr5Time === null && low <= rr5Target) {
          rr5Time = candle.time;
        }
        if (rr10Time === null && low <= rr10Target) {
          rr10Time = candle.time;
        }
      }
    }
  } else {
    rr5Time = null;
    rr10Time = null;
  }

  maxRr = Math.max(0, maxRr);
  maxDrawdownR = Math.max(0, maxDrawdownR);

  const slTime = outcome === "loss" ? outcomeTime : null;
  const rr2Time = outcome === "win" ? outcomeTime : null;

  const toDuration = (hitTime) => (hitTime === null ? null : Math.max(0, hitTime - signalTime));
  const outcomeDuration = outcomeTime === null ? null : toDuration(outcomeTime);

  return {
    outcome,
    outcome_time: outcomeTime,
    outcome_duration_ms: outcomeDuration,
    time_to_sl_ms: toDuration(slTime),
    time_to_rr2_ms: toDuration(rr2Time),
    time_to_rr5_ms: toDuration(rr5Time),
    time_to_rr10_ms: toDuration(rr10Time),
    max_rr: maxRr,
    max_drawdown_r: maxDrawdownR,
    realized_r: outcome === "win" ? 2 : outcome === "loss" ? -1 : 0,
  };
}

function buildReplayTradeOutcomes(items, symbol, tf) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const candles = items
    .map((item) => ({
      time: Number(item?.time ?? 0),
      high: toFiniteNumber(item?.candle?.high),
      low: toFiniteNumber(item?.candle?.low),
    }))
    .filter((item) => Number.isFinite(item.time) && item.time > 0 && item.high !== null && item.low !== null)
    .sort((a, b) => a.time - b.time);

  const rows = [];
  items.forEach((item, itemIndex) => {
    const signals = Array.isArray(item?.signals) ? item.signals : [];
    signals.forEach((signal, signalIndex) => {
      const direction = String(signal?.direction || "").toLowerCase();
      if (direction !== "long" && direction !== "short") {
        return;
      }
      const entry = toFiniteNumber(signal?.entry);
      const sl = toFiniteNumber(signal?.sl);
      const signalTime = toFiniteNumber(signal?.time ?? item?.time);
      if (entry === null || sl === null || signalTime === null || signalTime <= 0) {
        return;
      }
      const risk = Math.abs(entry - sl);
      if (!(risk > 0)) {
        return;
      }

      const outcome = evaluateReplaySignalOutcome(
        {
          direction,
          entry,
          sl,
          signal_time: signalTime,
        },
        candles
      );
      if (!outcome) {
        return;
      }

      rows.push({
        id: `${symbol || "SYM"}-${tf || "TF"}-${itemIndex}-${signalIndex}-${signalTime}`,
        symbol: symbol || "-",
        tf: tf || "-",
        type: signal?.type || "-",
        direction,
        signal_time: signalTime,
        entry,
        sl,
        risk,
        signal_tf_bias: String(signal?.context?.signal_tf_bias || "neutral").toLowerCase(),
        ...outcome,
      });
    });
  });

  return rows.sort((a, b) => b.signal_time - a.signal_time);
}

function summarizeReplayOutcomes(trades) {
  const rows = Array.isArray(trades) ? trades : [];
  const bySide = {
    long: { trades: 0, wins: 0, losses: 0, open: 0 },
    short: { trades: 0, wins: 0, losses: 0, open: 0 },
  };
  let wins = 0;
  let losses = 0;
  let open = 0;
  let winsRrSum = 0;
  let realizedRTotal = 0;

  rows.forEach((trade) => {
    const side = trade.direction === "short" ? "short" : "long";
    bySide[side].trades += 1;
    if (trade.outcome === "win") {
      wins += 1;
      bySide[side].wins += 1;
      winsRrSum += Number(trade.max_rr ?? 0);
      realizedRTotal += Number(trade.realized_r ?? 2);
    } else if (trade.outcome === "loss") {
      losses += 1;
      bySide[side].losses += 1;
      realizedRTotal += Number(trade.realized_r ?? -1);
    } else {
      open += 1;
      bySide[side].open += 1;
      realizedRTotal += Number(trade.realized_r ?? 0);
    }
  });

  const resolved = rows
    .filter((trade) => trade.outcome === "win" || trade.outcome === "loss")
    .sort((a, b) => (a.outcome_time ?? a.signal_time) - (b.outcome_time ?? b.signal_time));
  let cumulativeR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  let losingStreak = 0;
  let maxLosingStreak = 0;
  resolved.forEach((trade) => {
    cumulativeR += Number(trade.realized_r ?? 0);
    peakR = Math.max(peakR, cumulativeR);
    maxDrawdownR = Math.max(maxDrawdownR, peakR - cumulativeR);
    if (trade.outcome === "loss") {
      losingStreak += 1;
      maxLosingStreak = Math.max(maxLosingStreak, losingStreak);
    } else if (trade.outcome === "win") {
      losingStreak = 0;
    }
  });

  return {
    total: rows.length,
    wins,
    losses,
    open,
    win_rate: wins + losses > 0 ? wins / (wins + losses) : null,
    realized_r_total: realizedRTotal,
    avg_win_rr: wins > 0 ? winsRrSum / wins : 0,
    max_losing_streak: maxLosingStreak,
    max_drawdown_r: maxDrawdownR,
    by_side: bySide,
  };
}

function formatAlertStatus(alert) {
  if (alert.notified) {
    return "Notified ✅";
  }
  if (alert.notify_error) {
    if (String(alert.notify_error).includes("quiet_hours")) {
      return "Silent (quiet hours)";
    }
    return `Error: ${alert.notify_error}`;
  }
  return "Pending";
}

function getAlertTimeMs(alert) {
  const candidates = [alert?.created_at, alert?.time, alert?.created_at_ms, alert?.payload?.created_at_ms];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const parsed = typeof candidate === "number" ? candidate : new Date(candidate).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function getAlertStatusTone(alert) {
  if (alert?.notify_error) {
    return "danger";
  }
  if (alert?.notified) {
    return "success";
  }
  return "primary";
}

function getAlertStatusLabel(alert) {
  if (alert?.notify_error) {
    return "Failed";
  }
  if (alert?.notified) {
    return "Active";
  }
  return "New";
}

function getAlertSeverity(alert) {
  const raw = alert?.severity ?? alert?.payload?.severity ?? alert?.meta?.severity;
  if (raw) {
    return raw;
  }
  const score = Number(alert?.score ?? alert?.payload?.score ?? alert?.context?.score);
  if (Number.isFinite(score)) {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
  }
  return "low";
}

function getAlertTakeProfit(alert) {
  return (
    alert?.tp ??
    alert?.take_profit ??
    alert?.take_profit_price ??
    alert?.payload?.tp ??
    alert?.payload?.take_profit ??
    alert?.payload?.target?.price ??
    null
  );
}

function formatAlertConfidence(alert) {
  if (!alert) {
    return "-";
  }
  const score = alert.score ?? alert.payload?.score ?? alert.context?.score;
  if (score !== null && score !== undefined && !Number.isNaN(Number(score))) {
    return `${Number(score).toFixed(0)}%`;
  }
  return getAlertSeverity(alert);
}

function getPollerStatusLabel(pollerStatus) {
  if (!pollerStatus) {
    return "Checking";
  }
  if (!pollerStatus.is_running) {
    return "Disconnected";
  }
  if (pollerStatus.mode === "pause_all") {
    return "Paused";
  }
  if (pollerStatus.mode === "pause_new") {
    return "Degraded";
  }
  return "Online";
}

function getPollerStatusTone(pollerStatus) {
  if (!pollerStatus || !pollerStatus.is_running) {
    return "danger";
  }
  if (pollerStatus.mode === "pause_all" || pollerStatus.mode === "pause_new" || pollerStatus.last_error) {
    return "warning";
  }
  return "success";
}

function getLevelsByRole(levels, role) {
  const detailed = Array.isArray(levels?.final_levels_detailed) ? levels.final_levels_detailed : [];
  return detailed.filter((level) => level?.role === role).slice(0, 4);
}

function formatTelegramText(alert) {
  if (!alert) {
    return "";
  }
  const payload = alert.payload || {};
  const context = payload.context || alert.context || {};
  const type = String(alert.type || payload.type || "-").toUpperCase();
  const symbol = String(alert.symbol || payload.symbol || "-");
  const tf = String(alert.tf || payload.tf || "-");
  const direction = String(alert.direction || payload.direction || "-").toLowerCase();
  const directionTag = direction === "long" || direction === "short" ? direction.toUpperCase() : "-";
  const level = alert.level ?? payload.level;
  const levelRole = String(payload.level_role ?? payload.level_event?.role ?? "").toLowerCase();
  const entry = toFiniteNumber(alert.entry ?? payload.entry);
  const sl = toFiniteNumber(alert.sl ?? payload.sl);
  const slReason = String(alert.sl_reason ?? payload.sl_reason ?? "-");
  const time = alert.time ?? payload.time;
  const signalTfBias = String(context.signal_tf_bias ?? alert.signal_tf_bias ?? payload.signal_tf_bias ?? "-");

  const volOk = context.volume_spike_ok ?? context.vol_ma5_slope_ok;
  const pullbackVol = context.pullback_vol_decline;
  const diOk =
    direction === "long" ? context.not_at_peak_long : direction === "short" ? context.not_at_peak_short : null;
  const rsiDistance = toFiniteNumber(context.rsi_distance);
  const atrStopDistance = toFiniteNumber(context.atr_stop_distance);
  const srHtf = context.sr_htf_timeframe;
  const srLookback = context.sr_lookback;
  const activeSupport = context.active_support;
  const activeResistance = context.active_resistance;

  const risk = entry !== null && sl !== null ? Math.abs(entry - sl) : null;
  const riskPct = risk !== null && entry !== null && entry !== 0 ? risk / Math.abs(entry) : null;
  let rr2 = null;
  if (entry !== null && risk !== null) {
    if (direction === "long") {
      rr2 = entry + risk * 2;
    } else if (direction === "short") {
      rr2 = entry - risk * 2;
    }
  }

  const parts = [];
  parts.push(`${type} ${directionTag} | ${symbol} ${tf}`);
  parts.push(`Time: ${formatTelegramTime(time)}`);
  if (level !== undefined && level !== null) {
    parts.push(`${formatLevelLabel(levelRole, direction)}: ${formatNumber(level)}`);
  }
  if (srHtf) {
    const srParts = [`HTF: ${srHtf}`, `lookback: ${srLookback ?? "-"}`];
    if (activeSupport) {
      srParts.push(`support: ${formatNumber(activeSupport.center)}`);
    }
    if (activeResistance) {
      srParts.push(`resistance: ${formatNumber(activeResistance.center)}`);
    }
    parts.push(`S/R: ${srParts.join(" | ")}`);
  }
  parts.push(`Entry: ${formatNumber(entry)} | SL: ${formatNumber(sl)} | SL reason: ${slReason}`);
  if (risk !== null) {
    parts.push(`Risk (1R): ${formatNumber(risk)} (${formatPercentFraction(riskPct)}) | TP@2R: ${formatNumber(rr2)}`);
  } else {
    parts.push("Risk (1R): - | TP@2R: -");
  }
  parts.push(`Signal TF bias: ${signalTfBias}`);
  parts.push(
    `Checks: VOL_OK=${formatTelegramBool(volOk)} | DI_OK=${formatTelegramBool(diOk)} | PULLBACK_VOL=${formatTelegramBool(pullbackVol)}`
  );
  const indicators = [];
  if (rsiDistance !== null) {
    indicators.push(`RSI distance: ${formatNumber(rsiDistance)}`);
  }
  if (atrStopDistance !== null) {
    indicators.push(`ATR stop distance: ${formatNumber(atrStopDistance)}`);
  }
  if (indicators.length > 0) {
    parts.push(`Indicators: ${indicators.join(" | ")}`);
  }
  return parts.join("\n");
}

function formatLevelLabel(role, direction) {
  if (role === "resistance" || direction === "long") {
    return "Resistance";
  }
  if (role === "support" || direction === "short") {
    return "Support";
  }
  return "Level";
}

function formatTelegramBool(value) {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "-";
}

function formatPercentFraction(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "-";
  }
  return `${(num * 100).toFixed(2)}%`;
}

function formatTelegramTime(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) {
    return "-";
  }
  const iso = new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
  return `${iso} (${Math.trunc(ms)})`;
}

function getBinanceLink(symbol) {
  if (!symbol) {
    return "https://www.binance.com/en/futures";
  }
  return `https://www.binance.com/en/futures/${symbol}`;
}

function getTradingViewLink(symbol) {
  if (!symbol) {
    return "https://www.tradingview.com/chart/";
  }
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}`;
}

function tfToSeconds(tf) {
  switch (tf) {
    case "15m":
      return 15 * 60;
    case "1h":
      return 60 * 60;
    case "4h":
      return 4 * 60 * 60;
    case "1d":
      return 24 * 60 * 60;
    case "1w":
      return 7 * 24 * 60 * 60;
    default:
      return 0;
  }
}

function findMarkerDetails(timeSec, map, tf) {
  if (!map || map.size === 0) {
    return null;
  }
  if (map.has(timeSec)) {
    return map.get(timeSec);
  }
  const maxGap = tfToSeconds(tf);
  if (!maxGap) {
    return null;
  }
  let best = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const [key, details] of map.entries()) {
    const diff = Math.abs(key - timeSec);
    if (diff < bestDiff && diff <= maxGap) {
      best = details;
      bestDiff = diff;
    }
  }
  return best;
}

function buildWorkspaceMarkers(levelEvents, setupItems, openings) {
  const markers = [];
  if (Array.isArray(levelEvents)) {
    levelEvents.forEach((event) => {
      const direction = event.direction;
      if (event.last_break?.time) {
        markers.push({ type: "break", direction, time: Math.floor(event.last_break.time / 1000) });
      }
      if (event.retest_time) {
        markers.push({ type: "retest", direction, time: Math.floor(event.retest_time / 1000) });
      }
      if (event.last_fakeout?.time) {
        markers.push({ type: "fakeout", direction, time: Math.floor(event.last_fakeout.time / 1000) });
      }
    });
  }
  if (Array.isArray(setupItems)) {
    setupItems.forEach((item) => {
      if (item.time) {
        markers.push({ type: "setup", direction: item.direction, time: Math.floor(item.time / 1000) });
      }
    });
  }
  if (Array.isArray(openings)) {
    openings.forEach((signal) => {
      if (signal?.time) {
        markers.push({ type: signal.type || "opening", direction: signal.direction, time: Math.floor(signal.time / 1000) });
      }
    });
  }

  const mapped = markers.map((marker) => {
    const isBull = marker.direction === "up" || marker.direction === "long";
    let color = "#6F7D91";
    let shape = "circle";
    let position = isBull ? "belowBar" : "aboveBar";
    let text = marker.type?.toUpperCase?.() ?? "M";
    switch (marker.type) {
      case "break":
        color = isBull ? "#10B981" : "#EF4444";
        shape = isBull ? "arrowUp" : "arrowDown";
        position = isBull ? "aboveBar" : "belowBar";
        text = "B";
        break;
      case "retest":
        color = "#6F7D91";
        shape = "circle";
        text = "R";
        break;
      case "fakeout":
        color = "#F59E0B";
        shape = "circle";
        text = "F";
        break;
      case "setup":
        color = isBull ? "#10B981" : "#EF4444";
        shape = isBull ? "arrowUp" : "arrowDown";
        text = "S";
        break;
      default:
        break;
    }
    return {
      time: marker.time,
      position,
      color,
      shape,
      text
    };
  });
  return mapped.sort((a, b) => a.time - b.time);
}

function buildWorkspaceSignalRows(levelEvents, setupItems, openings, symbol, tf) {
  const rows = [];
  if (Array.isArray(levelEvents)) {
    levelEvents.forEach((event, idx) => {
      const direction = event.direction;
      const levelEvent = {
        break_index: event.last_break?.index ?? null,
        retest_index: event.retest_index ?? null,
        fakeout_index: event.last_fakeout?.index ?? null
      };
      if (event.last_break?.time) {
        rows.push({
          id: `break-${event.level}-${event.last_break.time}-${idx}`,
          type: "break",
          direction,
          level: event.level,
          time: event.last_break.time,
          source: "level_event",
          details: {
            symbol,
            tf,
            type: "break",
            direction,
            level: event.level,
            time: event.last_break.time,
            entry: event.last_break.close,
            sl: null,
            sl_reason: null,
            level_event: levelEvent,
            context: {}
          }
        });
      }
      if (event.retest_time) {
        rows.push({
          id: `retest-${event.level}-${event.retest_time}-${idx}`,
          type: "retest",
          direction,
          level: event.level,
          time: event.retest_time,
          source: "level_event",
          details: {
            symbol,
            tf,
            type: "retest",
            direction,
            level: event.level,
            time: event.retest_time,
            entry: null,
            sl: null,
            sl_reason: null,
            level_event: levelEvent,
            context: {}
          }
        });
      }
      if (event.last_fakeout?.time) {
        rows.push({
          id: `fakeout-${event.level}-${event.last_fakeout.time}-${idx}`,
          type: "fakeout",
          direction,
          level: event.level,
          time: event.last_fakeout.time,
          source: "level_event",
          details: {
            symbol,
            tf,
            type: "fakeout",
            direction,
            level: event.level,
            time: event.last_fakeout.time,
            entry: event.last_fakeout.close,
            sl: null,
            sl_reason: null,
            level_event: levelEvent,
            context: {}
          }
        });
      }
    });
  }
  if (Array.isArray(setupItems)) {
    setupItems.forEach((item, idx) => {
      rows.push({
        id: `setup-${item.level}-${item.setup_index ?? idx}`,
        type: "setup",
        direction: item.direction,
        level: item.level,
        time: item.time,
        source: "setup",
        details: {
          symbol,
          tf,
          type: "setup",
          direction: item.direction,
          level: item.level,
          time: item.time,
          entry: item.entry,
          sl: item.sl,
          sl_reason: "setup_candle",
          setup_index: item.setup_index ?? null,
          level_event: null,
          context: {}
        }
      });
    });
  }
  if (Array.isArray(openings)) {
    openings.forEach((signal, idx) => {
      rows.push({
        id: `opening-${signal.type}-${signal.time}-${idx}`,
        type: signal.type ?? "opening",
        direction: signal.direction,
        level: signal.level,
        time: signal.time,
        source: "opening",
        details: {
          symbol: signal.symbol ?? symbol,
          tf: signal.tf ?? tf,
          ...signal,
          level_event: signal.level_event ?? signal.level_event_indices ?? null
        }
      });
    });
  }
  return rows.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
}

function buildMarkerDetailsMap(levelEvents, setupItems, openings, symbol, tf, candles = []) {
  const rows = buildWorkspaceSignalRows(levelEvents, setupItems, openings, symbol, tf);
  const candleByTime = new Map();
  if (Array.isArray(candles)) {
    candles.forEach((candle) => {
      if (candle?.time) {
        candleByTime.set(candle.time, candle);
      }
    });
  }
  const priority = { opening: 0, setup: 1, level_event: 2 };
  rows.sort((a, b) => {
    const pa = priority[a.source] ?? 3;
    const pb = priority[b.source] ?? 3;
    if (pa !== pb) {
      return pa - pb;
    }
    return (b.time ?? 0) - (a.time ?? 0);
  });
  const map = new Map();
  rows.forEach((row) => {
    if (!row.time) {
      return;
    }
    if (row.details && !row.details.candle) {
      const candle = candleByTime.get(row.time);
      if (candle) {
        row.details.candle = candle;
      }
    }
    const timeSec = Math.floor(row.time / 1000);
    if (!map.has(timeSec)) {
      map.set(timeSec, row.details);
    }
  });
  return map;
}

function toChartCandles(candles) {
  if (!Array.isArray(candles)) {
    return [];
  }
  return candles.map((candle) => ({
    time: Math.floor(candle.time / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }));
}

function toVolumeSeries(candles) {
  if (!Array.isArray(candles)) {
    return [];
  }
  return candles.map((candle) => ({
    time: Math.floor(candle.time / 1000),
    value: candle.volume
  }));
}

function computeSmaSeries(candles, period, field = "close") {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }
  const values = candles.map((candle) => Number(candle[field] ?? candle.close ?? 0));
  const result = [];
  for (let idx = 0; idx < values.length; idx += 1) {
    if (idx + 1 < period) {
      continue;
    }
    const window = values.slice(idx + 1 - period, idx + 1);
    const sum = window.reduce((acc, val) => acc + val, 0);
    const average = sum / period;
    result.push({ time: Math.floor(candles[idx].time / 1000), value: average });
  }
  return result;
}

function computeDmiAdxSeries(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) {
    return { diPlus: [], diMinus: [], adx: [] };
  }

  let smoothedTr = 0;
  let smoothedPlusDm = 0;
  let smoothedMinusDm = 0;
  let adxValue = null;
  const dxSeed = [];
  const diPlus = [];
  const diMinus = [];
  const adx = [];

  for (let idx = 1; idx < candles.length; idx += 1) {
    const prev = candles[idx - 1];
    const curr = candles[idx];
    const high = Number(curr.high);
    const low = Number(curr.low);
    const prevHigh = Number(prev.high);
    const prevLow = Number(prev.low);
    const prevClose = Number(prev.close);
    if (![high, low, prevHigh, prevLow, prevClose].every(Number.isFinite)) {
      continue;
    }

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

    if (idx <= period) {
      smoothedTr += tr;
      smoothedPlusDm += plusDm;
      smoothedMinusDm += minusDm;
    } else {
      smoothedTr = smoothedTr - smoothedTr / period + tr;
      smoothedPlusDm = smoothedPlusDm - smoothedPlusDm / period + plusDm;
      smoothedMinusDm = smoothedMinusDm - smoothedMinusDm / period + minusDm;
    }

    if (idx < period || smoothedTr === 0) {
      continue;
    }

    const time = Math.floor(curr.time / 1000);
    const plusDi = (smoothedPlusDm / smoothedTr) * 100;
    const minusDi = (smoothedMinusDm / smoothedTr) * 100;
    const denom = plusDi + minusDi;
    const dx = denom > 0 ? (Math.abs(plusDi - minusDi) / denom) * 100 : 0;
    diPlus.push({ time, value: plusDi });
    diMinus.push({ time, value: minusDi });

    if (adxValue === null) {
      dxSeed.push(dx);
      if (dxSeed.length === period) {
        adxValue = dxSeed.reduce((acc, value) => acc + value, 0) / period;
        adx.push({ time, value: adxValue });
      }
    } else {
      adxValue = ((adxValue * (period - 1)) + dx) / period;
      adx.push({ time, value: adxValue });
    }
  }

  return { diPlus, diMinus, adx };
}

function buildLegendFromCandle(candle, timeOverride) {
  if (!candle) {
    return null;
  }
  const open = candle.open ?? 0;
  const close = candle.close ?? 0;
  const changePct = open ? ((close - open) / open) * 100 : 0;
  return {
    time: timeOverride ?? candle.time ?? null,
    open,
    high: candle.high ?? open,
    low: candle.low ?? open,
    close,
    changePct
  };
}

function getTimeRange(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return null;
  }
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  if (!first || !last) {
    return null;
  }
  return { start: Math.floor(first / 1000), end: Math.floor(last / 1000) };
}

function buildReplayCandles(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item) => item && item.candle)
    .map((item) => ({
      time: item.time,
      open: item.candle.open,
      high: item.candle.high,
      low: item.candle.low,
      close: item.candle.close,
      volume: item.candle.volume
    }));
}

function buildReplayLevels(item) {
  if (!item) {
    return [];
  }
  if (Array.isArray(item.levels_detailed) && item.levels_detailed.length > 0) {
    return item.levels_detailed;
  }
  if (!Array.isArray(item.levels)) {
    return [];
  }
  const tol = Number(item.tol_pct_used ?? 0);
  const lastClose = item.candle?.close;
  return item.levels.map((level) => {
    let role = "mixed";
    if (lastClose && tol > 0) {
      const dist = Math.abs(level - lastClose) / lastClose;
      if (dist <= tol) {
        role = "mixed";
      } else if (level < lastClose) {
        role = "support";
      } else {
        role = "resistance";
      }
    }
    return {
      center: level,
      role,
      zone_low: level * (1 - tol),
      zone_high: level * (1 + tol),
      strength: 0
    };
  });
}

function filterLevelsForChart(levels, candles, maxLevels = 8) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return [];
  }

  const normalized = levels
    .map((level) => {
      const center = toFiniteNumber(level?.center);
      if (center === null) {
        return null;
      }
      const roleRaw = level?.role;
      const role = roleRaw === "support" || roleRaw === "resistance" ? roleRaw : "mixed";
      const defaultHalfWidth = Math.max(Math.abs(center) * 0.0015, 1);
      let zoneLow = toFiniteNumber(level?.zone_low);
      let zoneHigh = toFiniteNumber(level?.zone_high);
      if (zoneLow === null) {
        zoneLow = center - defaultHalfWidth;
      }
      if (zoneHigh === null) {
        zoneHigh = center + defaultHalfWidth;
      }
      if (zoneHigh < zoneLow) {
        const tmp = zoneLow;
        zoneLow = zoneHigh;
        zoneHigh = tmp;
      }
      return {
        ...level,
        center,
        role,
        zone_low: zoneLow,
        zone_high: zoneHigh,
        strength: toFiniteNumber(level?.strength) ?? 0
      };
    })
    .filter(Boolean);

  const candleList = Array.isArray(candles) ? candles : [];
  const highs = candleList.map((item) => toFiniteNumber(item?.high)).filter((item) => item !== null);
  const lows = candleList.map((item) => toFiniteNumber(item?.low)).filter((item) => item !== null);
  const lastClose = toFiniteNumber(candleList[candleList.length - 1]?.close);

  let candidates = normalized;
  if (highs.length > 0 && lows.length > 0) {
    const minLow = Math.min(...lows);
    const maxHigh = Math.max(...highs);
    const range = Math.max(maxHigh - minLow, Math.abs(lastClose ?? minLow) * 0.02, 1);
    const bandLow = minLow - range * 0.6;
    const bandHigh = maxHigh + range * 0.6;
    const inBand = normalized.filter((level) => level.center >= bandLow && level.center <= bandHigh);
    if (inBand.length > 0) {
      candidates = inBand;
    }
  }

  const anchor =
    lastClose ??
    (highs.length > 0 && lows.length > 0 ? (Math.min(...lows) + Math.max(...highs)) / 2 : normalized[0].center);

  const sorted = [...candidates].sort((a, b) => {
    const distA = Math.abs(a.center - anchor);
    const distB = Math.abs(b.center - anchor);
    if (distA !== distB) {
      return distA - distB;
    }
    return (b.strength ?? 0) - (a.strength ?? 0);
  });

  if (sorted.length <= maxLevels) {
    return sorted;
  }

  const caps = { support: 3, resistance: 3, mixed: 2 };
  const used = { support: 0, resistance: 0, mixed: 0 };
  const selected = [];

  for (const level of sorted) {
    const roleKey = level.role ?? "mixed";
    if (used[roleKey] >= caps[roleKey]) {
      continue;
    }
    selected.push(level);
    used[roleKey] += 1;
    if (selected.length >= maxLevels) {
      break;
    }
  }

  if (selected.length > 0) {
    return selected;
  }
  return sorted.slice(0, maxLevels);
}

function buildReplayMarkers(signals) {
  if (!Array.isArray(signals)) {
    return [];
  }
  const mapped = signals
    .filter((signal) => signal && signal.time)
    .map((signal) => {
      const direction = signal.direction;
      const isBull = direction === "up" || direction === "long";
      let color = "#6F7D91";
      let shape = "circle";
      let position = isBull ? "belowBar" : "aboveBar";
      let text = signal.type?.toUpperCase?.() ?? "M";
      switch (signal.type) {
        case "break":
          color = isBull ? "#10B981" : "#EF4444";
          shape = isBull ? "arrowUp" : "arrowDown";
          position = isBull ? "aboveBar" : "belowBar";
          text = "B";
          break;
        case "fakeout":
          color = "#F59E0B";
          shape = "circle";
          text = "F";
          break;
        case "retest":
          color = isBull ? "#22D3EE" : "#3B82F6";
          shape = "circle";
          text = "R";
          break;
        case "setup":
          color = isBull ? "#10B981" : "#EF4444";
          shape = isBull ? "arrowUp" : "arrowDown";
          text = "S";
          break;
        default:
          break;
      }
      return {
        time: Math.floor(signal.time / 1000),
        position,
        color,
        shape,
        text
      };
    });
  return mapped.sort((a, b) => a.time - b.time);
}

function LevelCard({ level, onRemovePinned, onRemoveDisabled }) {
  const isSupport = level.role === "support";
  const roleLabel = isSupport ? "Support" : level.role === "resistance" ? "Resistance" : "Level";
  const statusTone = level.status === "pinned" ? "primary" : level.status === "disabled" ? "danger" : "success";
  return (
    <div className={`structure-level-card level-${level.role || "mixed"}`}>
      <div className="level-main">
        <LevelBadge role={level.role} />
        <strong>{formatNumber(level.price)}</strong>
      </div>
      <div className="level-details">
        <span>{level.source ?? "scanner"}</span>
        <span>{level.pattern ?? "-"}</span>
        <span>Open {formatNumber(level.open)}</span>
      </div>
      <div className="level-status">
        <StatusBadge tone={statusTone}>{level.status ?? "active"}</StatusBadge>
        {level.status === "pinned" && onRemovePinned ? (
          <button className="btn btn-small btn-ghost" type="button" onClick={() => onRemovePinned(level.price)}>
            Remove
          </button>
        ) : null}
        {level.status === "disabled" && onRemoveDisabled ? (
          <button className="btn btn-small btn-ghost" type="button" onClick={() => onRemoveDisabled(level.price)}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LevelBadge({ role }) {
  const label = role === "support" ? "Support" : role === "resistance" ? "Resistance" : "Level";
  const tone = role === "support" ? "success" : role === "resistance" ? "danger" : "muted";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function OverridePanel({ title, value, onChange, onAdd, items, onRemove, placeholder, tone }) {
  return (
    <div className="override-panel">
      <h3>{title}</h3>
      <div className="override-input-row">
        <input type="number" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
        <button className="btn" type="button" onClick={onAdd}>
          Add
        </button>
      </div>
      {Array.isArray(items) && items.length > 0 ? (
        <div className="override-list">
          {items.map((item) => (
            <div className="override-item" key={item}>
              <StatusBadge tone={tone === "pinned" ? "primary" : "danger"}>{tone === "pinned" ? "Pinned" : "Disabled"}</StatusBadge>
              <strong>{formatNumber(item)}</strong>
              <button className="btn btn-small btn-ghost" type="button" onClick={() => onRemove(item)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">None</p>
      )}
    </div>
  );
}

function normalizeDetectedLevel(item, levels) {
  const role = item?.role === "support" || item?.role === "resistance" ? item.role : "mixed";
  return {
    id: `detected-${role}-${item?.center}`,
    role,
    price: item?.center,
    source: levels?.htf_timeframe ? `HTF ${levels.htf_timeframe}` : "scanner",
    pattern: item?.pattern ? String(item.pattern).replace("_", " -> ") : "detected",
    open: item?.trigger_open,
    status: "active"
  };
}

function buildEffectiveLevelItems(levels, pinnedLevels = [], disabledLevels = []) {
  if (!levels) {
    return [];
  }
  const disabledSet = new Set(disabledLevels.map((item) => Number(item)));
  const detailed = Array.isArray(levels.final_levels_detailed) ? levels.final_levels_detailed : [];
  const detailedByPrice = new Map(
    detailed.map((item) => [Number(item.center), normalizeDetectedLevel(item, levels)])
  );
  const finalPrices = Array.isArray(levels.final_levels) ? levels.final_levels : [];
  const rows = finalPrices.map((price) => {
    const numeric = Number(price);
    const existing = detailedByPrice.get(numeric);
    return {
      id: `effective-${numeric}`,
      ...(existing ?? {
        role: "mixed",
        price: numeric,
        source: levels?.htf_timeframe ? `HTF ${levels.htf_timeframe}` : "scanner",
        pattern: "effective",
        open: null
      }),
      price: numeric,
      status: disabledSet.has(numeric) ? "disabled" : "active"
    };
  });
  pinnedLevels.forEach((price) => {
    const numeric = Number(price);
    if (!rows.some((row) => Number(row.price) === numeric)) {
      rows.push({
        id: `pinned-${numeric}`,
        role: inferLevelRole(numeric, levels?.last_close_used),
        price: numeric,
        source: "manual override",
        pattern: "pinned",
        open: null,
        status: "pinned"
      });
    }
  });
  disabledLevels.forEach((price) => {
    const numeric = Number(price);
    const existing = rows.find((row) => Number(row.price) === numeric);
    if (existing) {
      existing.status = "disabled";
    }
  });
  return rows.sort((a, b) => Number(a.price) - Number(b.price));
}

function inferLevelRole(price, reference) {
  const numeric = Number(price);
  const ref = Number(reference);
  if (!Number.isFinite(numeric) || !Number.isFinite(ref)) {
    return "mixed";
  }
  return numeric <= ref ? "support" : "resistance";
}

function LevelList({ items, emptyLabel }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }
  return (
    <ul className="level-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function DetailedLevelList({ items, emptyLabel }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }
  return (
    <ul className="level-list">
      {items.map((item) => (
        <li key={`${item.role}-${item.center}`}>
          <span>
            {item.role === "support" ? "Support" : item.role === "resistance" ? "Resistance" : "Level"}{" "}
            {formatNumber(item.center)}
          </span>
          <small>
            {item.pattern ? item.pattern.replace("_", "->") : "manual"} | open {formatNumber(item.trigger_open)}
          </small>
        </li>
      ))}
    </ul>
  );
}

function EditableList({ items, onRemove }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="muted">None</p>;
  }
  return (
    <ul className="level-list">
      {items.map((item) => (
        <li key={item}>
          <span>{item}</span>
          <button className="btn btn-small" type="button" onClick={() => onRemove(item)}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

function parseWatchlistSymbolInput(input) {
  if (!input) {
    return [];
  }
  const unique = new Set();
  return String(input)
    .split(/[\s,;]+/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => {
      if (!item || unique.has(item)) {
        return false;
      }
      unique.add(item);
      return true;
    });
}

function validateWatchlistSymbol(symbol) {
  if (!symbol) {
    return "Symbol is required.";
  }
  if (symbol.length < 6 || symbol.length > 20) {
    return "Symbol must be 6-20 characters.";
  }
  if (!/^[A-Z0-9]+$/.test(symbol)) {
    return "Symbol must be A-Z or 0-9.";
  }
  return "";
}

function buildWatchlistSymbolEntry(template, symbol, entryTfs) {
  const setups = template?.setups
    ? structuredClone(template.setups)
    : { continuation: true, retest: true, fakeout: true, setup_candle: true };
  const rules = normalizeWatchlistRules(template?.rules);
  const levels = template?.levels
    ? structuredClone(template.levels)
    : {
        htf_timeframe: "auto",
        lookback_window: 14,
        overrides: { add: [], disable: [] }
      };
  levels.htf_timeframe = levels.htf_timeframe ?? "auto";
  levels.lookback_window = levels.lookback_window ?? 14;
  levels.overrides = { add: [], disable: [] };
  return {
    symbol,
    enabled: true,
    entry_tfs: entryTfs,
    setups,
    rules,
    levels
  };
}

function normalizeWatchlistRules(rules) {
  return {
    di_peak_filter: rules?.di_peak_filter ?? true,
    volume_spike_filter: rules?.volume_spike_filter ?? true,
    fakeout_volume_filter: rules?.fakeout_volume_filter ?? true,
    pullback_volume_filter: rules?.pullback_volume_filter ?? true
  };
}

function updateOverrides(watchlist, symbol, key, value) {
  if (!watchlist || !symbol) {
    return watchlist;
  }
  const next = structuredClone(watchlist);
  const entry = next.symbols?.find((item) => item.symbol === symbol);
  if (!entry) {
    return watchlist;
  }
  const list = entry.levels?.overrides?.[key] ?? [];
  if (!list.includes(value)) {
    list.push(value);
  }
  entry.levels.overrides[key] = list;
  return next;
}

function removeOverride(watchlist, symbol, key, value) {
  if (!watchlist || !symbol) {
    return watchlist;
  }
  const next = structuredClone(watchlist);
  const entry = next.symbols?.find((item) => item.symbol === symbol);
  if (!entry) {
    return watchlist;
  }
  const list = entry.levels?.overrides?.[key] ?? [];
  entry.levels.overrides[key] = list.filter((item) => item !== value);
  return next;
}

function getOverrides(watchlist, symbol, key) {
  if (!watchlist || !symbol) {
    return [];
  }
  const entry = watchlist.symbols?.find((item) => item.symbol === symbol);
  return entry?.levels?.overrides?.[key] ?? [];
}

function updateQuality(prev, path, value) {
  if (!prev) {
    return prev;
  }
  const next = structuredClone(prev);
  let target = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!target[key]) {
      target[key] = {};
    }
    target = target[key];
  }
  const lastKey = path[path.length - 1];
  const numericFields = new Set([
    "min_score_by_type.break",
    "min_score_by_type.retest",
    "min_score_by_type.setup",
    "min_score_by_type.fakeout",
    "cooldown_minutes_by_type.break",
    "cooldown_minutes_by_type.retest",
    "cooldown_minutes_by_type.setup",
    "cooldown_minutes_by_type.fakeout",
    "max_alerts_per_symbol_per_hour",
    "max_alerts_global_per_hour"
  ]);
  const pathKey = path.join(".");
  if (numericFields.has(pathKey)) {
    const num = Number(value);
    target[lastKey] = Number.isFinite(num) ? num : target[lastKey];
  } else {
    target[lastKey] = value;
  }
  return next;
}
