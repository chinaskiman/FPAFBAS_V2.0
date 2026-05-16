from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Literal

from .candle_cache import Candle

HTF_TFS = ("1w", "1d", "4h")
SUPPORTED_SR_HTFS = ("1d", "4h")
ENTRY_HTF_MAP = {"1h": "1d", "15m": "4h"}
DEFAULT_SR_LOOKBACK = 14
DEFAULT_TOL_PCT = 0.003

LevelRole = Literal["support", "resistance", "mixed"]


@dataclass(frozen=True)
class ActiveLevel:
    role: LevelRole
    level: float
    htf: str
    source_index: int
    source_close_time: int
    pattern: str
    anchor_close: float
    trigger_open: float

    def to_dict(self) -> dict:
        return {
            "center": self.level,
            "role": self.role,
            "level": self.level,
            "htf": self.htf,
            "source_index": self.source_index,
            "source_close_time": self.source_close_time,
            "pattern": self.pattern,
            "anchor_close": self.anchor_close,
            "trigger_open": self.trigger_open,
            "strength": 1.0,
            "touches": 1,
            "touch_events": 1,
            "rejections": 0,
            "flips": 0,
            "last_seen": self.source_close_time,
        }


_STATE_CACHE: dict[tuple, tuple[List[float], List[dict], List[dict], dict]] = {}


def resolve_htf_timeframe(entry_tf: str | None = None, configured_htf: str | None = None) -> str:
    if configured_htf and configured_htf != "auto":
        if configured_htf not in SUPPORTED_SR_HTFS:
            raise ValueError("htf_timeframe must be 'auto', '1d', or '4h'")
        return configured_htf
    if entry_tf in ENTRY_HTF_MAP:
        return ENTRY_HTF_MAP[entry_tf]
    return "4h"


def compute_active_levels(
    candles_by_tf: Dict[str, List[Candle]],
    entry_tf: str | None = None,
    htf_timeframe: str | None = None,
    lookback: int = DEFAULT_SR_LOOKBACK,
) -> dict:
    if lookback < 2:
        raise ValueError("lookback must be >= 2")

    htf = resolve_htf_timeframe(entry_tf, htf_timeframe)
    candles = list(candles_by_tf.get(htf) or [])
    completed = candles[-lookback:]
    last_close_time = completed[-1].close_time if completed else None
    candle_signature = tuple(
        (candle.open_time, candle.close_time, candle.open, candle.close)
        for candle in completed
    )
    cache_key = (htf, lookback, candle_signature)
    if cache_key in _STATE_CACHE:
        levels, selected, clusters, meta = _STATE_CACHE[cache_key]
        return {
            "levels": list(levels),
            "selected": [dict(item) for item in selected],
            "clusters": [dict(item) for item in clusters],
            "meta": dict(meta),
        }

    support, resistance = _detect_active_patterns(completed, htf)
    active = [item for item in (support, resistance) if item is not None]
    clusters = [item.to_dict() for item in active]
    levels = sorted(item.level for item in active)
    selected = list(clusters)
    meta = {
        "algorithm": "candle_pattern_open_close",
        "htf_timeframe": htf,
        "entry_tf": entry_tf,
        "lookback": lookback,
        "completed_candles_used": len(completed),
        "last_htf_close_time": last_close_time,
        "last_close_used": completed[-1].close if completed else None,
        "support": support.to_dict() if support else None,
        "resistance": resistance.to_dict() if resistance else None,
        "below_count": 1 if support else 0,
        "above_count": 1 if resistance else 0,
        "tol_pct_used": DEFAULT_TOL_PCT,
        "cache_key": cache_key,
    }
    _STATE_CACHE[cache_key] = (levels, selected, clusters, meta)
    return {
        "levels": list(levels),
        "selected": [dict(item) for item in selected],
        "clusters": [dict(item) for item in clusters],
        "meta": dict(meta),
    }


def compute_levels(
    candles_by_tf: Dict[str, List[Candle]],
    entry_tf: str | None = None,
    htf_timeframe: str | None = None,
    lookback: int = DEFAULT_SR_LOOKBACK,
) -> tuple[List[float], List[dict], List[dict], dict]:
    result = compute_active_levels(
        candles_by_tf,
        entry_tf=entry_tf,
        htf_timeframe=htf_timeframe,
        lookback=lookback,
    )
    meta = result["meta"]
    meta["tol_pct_used"] = DEFAULT_TOL_PCT
    return result["levels"], result["selected"], result["clusters"], meta


def apply_overrides(
    detected_levels: Iterable[float],
    pinned_levels: Iterable[float],
    disabled_levels: Iterable[float],
    tol_pct: float,
) -> dict:
    pinned = sorted(set(float(val) for val in pinned_levels))
    disabled = sorted(set(float(val) for val in disabled_levels))
    filtered_detected: List[float] = []
    for level in detected_levels:
        if _within_any(level, disabled, tol_pct):
            continue
        if _within_any(level, pinned, tol_pct):
            continue
        filtered_detected.append(level)
    final_levels = sorted(filtered_detected + pinned)
    return {
        "detected_levels": list(detected_levels),
        "pinned_levels": pinned,
        "disabled_levels": disabled,
        "final_levels": final_levels,
    }


def build_levels_detailed(
    levels: List[float],
    clusters: List[dict],
    last_close: float | None,
    tol_pct_used: float,
) -> List[dict]:
    details: List[dict] = []
    for level in levels:
        match = _find_cluster_for_level(level, clusters, tol_pct_used)
        if match and match.get("role") in {"support", "resistance"}:
            role = match["role"]
        else:
            role = "mixed"
        details.append(
            {
                "center": level,
                "role": role,
                "zone_low": level,
                "zone_high": level,
                "strength": match.get("strength", 1.0) if match else 1.0,
                "touches": match.get("touches", 1) if match else 1,
                "touch_events": match.get("touch_events", 1) if match else 1,
                "avg_rejection_strength": 0.0,
                "rejections": 0,
                "flips": 0,
                "last_touch_index": match.get("source_index") if match else None,
                "last_rejection_index": None,
                "last_flip_index": None,
                "score_tf_used": match.get("htf") if match else None,
                "tf_authority_score": 1.0 if match else 0.0,
                "tf_counts": _tf_counts(match.get("htf") if match else None),
                "pattern": match.get("pattern") if match else None,
                "source_close_time": match.get("source_close_time") if match else None,
                "anchor_close": match.get("anchor_close") if match else None,
                "trigger_open": match.get("trigger_open") if match else None,
            }
        )
    return details


def level_roles_from_details(details: Iterable[dict]) -> dict[float, str]:
    roles: dict[float, str] = {}
    for item in details:
        level = item.get("center")
        role = item.get("role")
        if level is None or role not in {"support", "resistance"}:
            continue
        roles[float(level)] = str(role)
    return roles


def _detect_active_patterns(candles: List[Candle], htf: str) -> tuple[ActiveLevel | None, ActiveLevel | None]:
    best_support: tuple[float, int, int, Candle, Candle] | None = None
    best_resistance: tuple[float, int, int, Candle, Candle] | None = None
    for idx in range(len(candles) - 1):
        candle_a = candles[idx]
        candle_b = candles[idx + 1]

        if _is_bullish(candle_a) and _is_bearish(candle_b):
            candidate = (candle_a.close, candle_b.close_time, idx + 1, candle_a, candle_b)
            if best_resistance is None or candidate[:3] > best_resistance[:3]:
                best_resistance = candidate

        if _is_bearish(candle_a) and _is_bullish(candle_b):
            candidate = (candle_a.close, -candle_b.close_time, -(idx + 1), candle_a, candle_b)
            if best_support is None or candidate[:3] < best_support[:3]:
                best_support = candidate

    support = None
    if best_support is not None:
        _, _, source_index_neg, candle_a, candle_b = best_support
        support = ActiveLevel(
            role="support",
            level=candle_b.open,
            htf=htf,
            source_index=-source_index_neg,
            source_close_time=candle_b.close_time,
            pattern="bearish_bullish",
            anchor_close=candle_a.close,
            trigger_open=candle_b.open,
        )

    resistance = None
    if best_resistance is not None:
        _, _, source_index, candle_a, candle_b = best_resistance
        resistance = ActiveLevel(
            role="resistance",
            level=candle_b.open,
            htf=htf,
            source_index=source_index,
            source_close_time=candle_b.close_time,
            pattern="bullish_bearish",
            anchor_close=candle_a.close,
            trigger_open=candle_b.open,
        )

    return support, resistance


def _is_bullish(candle: Candle) -> bool:
    return candle.close > candle.open


def _is_bearish(candle: Candle) -> bool:
    return candle.close < candle.open


def _within_any(value: float, reference: List[float], tol_pct: float) -> bool:
    for item in reference:
        if item == 0:
            if value == 0:
                return True
        elif abs(value - item) / abs(item) <= tol_pct:
            return True
    return False


def _find_cluster_for_level(level: float, clusters: List[dict], tol_pct: float) -> dict | None:
    exact = [cluster for cluster in clusters if cluster.get("center") == level]
    if exact:
        return exact[0]
    for cluster in clusters:
        center = cluster.get("center")
        if center is None:
            continue
        if center == 0 and level == 0:
            return cluster
        if center and abs(level - center) / abs(center) <= tol_pct:
            return cluster
    return None


def _tf_counts(active_tf: str | None) -> dict:
    return {tf: 1 if tf == active_tf else 0 for tf in HTF_TFS}
