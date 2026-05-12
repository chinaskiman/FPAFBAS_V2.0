from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal

from .candle_cache import Candle
from .pivots import find_pivot_highs, find_pivot_lows

Bias = Literal["bullish", "bearish", "neutral"]


@dataclass(frozen=True)
class SwingPoint:
    index: int
    time: int
    price: float

    def to_dict(self) -> dict:
        return {"index": self.index, "time": self.time, "price": self.price}


def extract_swings(candles: List[Candle], left: int = 2, right: int = 2) -> tuple[List[SwingPoint], List[SwingPoint]]:
    highs = [candle.high for candle in candles]
    lows = [candle.low for candle in candles]
    times = [candle.close_time for candle in candles]
    pivot_high = find_pivot_highs(highs, left, right)
    pivot_low = find_pivot_lows(lows, left, right)

    high_points = [
        SwingPoint(index=idx, time=times[idx], price=highs[idx])
        for idx, flag in enumerate(pivot_high)
        if flag
    ]
    low_points = [
        SwingPoint(index=idx, time=times[idx], price=lows[idx])
        for idx, flag in enumerate(pivot_low)
        if flag
    ]
    return high_points, low_points


def classify_bias(high_points: List[SwingPoint], low_points: List[SwingPoint]) -> Bias:
    if len(high_points) < 2 or len(low_points) < 2:
        return "neutral"
    latest_high, prev_high = high_points[-1], high_points[-2]
    latest_low, prev_low = low_points[-1], low_points[-2]

    if latest_high.price > prev_high.price and latest_low.price > prev_low.price:
        return "bullish"
    if latest_high.price < prev_high.price and latest_low.price < prev_low.price:
        return "bearish"
    return "neutral"


def compute_timeframe_bias(candles: List[Candle]) -> dict:
    highs, lows = extract_swings(candles)
    bias = classify_bias(highs, lows)
    return {
        "bias": bias,
        "highs": [point.to_dict() for point in highs[-3:]],
        "lows": [point.to_dict() for point in lows[-3:]],
    }


def compute_hwc_bias(weekly: List[Candle], daily: List[Candle]) -> dict:
    weekly_bias = compute_timeframe_bias(weekly)
    daily_bias = compute_timeframe_bias(daily)
    hwc = _combine_biases(weekly_bias["bias"], daily_bias["bias"])
    return {
        "weekly": weekly_bias,
        "daily": daily_bias,
        "hwc_bias": hwc,
    }


def compute_mwc_bias(daily: List[Candle], four_hour: List[Candle]) -> dict:
    daily_bias = compute_timeframe_bias(daily)
    four_hour_bias = compute_timeframe_bias(four_hour)
    mwc = _combine_biases(daily_bias["bias"], four_hour_bias["bias"])
    return {
        "daily": daily_bias,
        "four_hour": four_hour_bias,
        "mwc_bias": mwc,
    }


def _combine_biases(first: Bias, second: Bias) -> Bias:
    if first == "bullish" and second == "bullish":
        return "bullish"
    if first == "bearish" and second == "bearish":
        return "bearish"
    return "neutral"
