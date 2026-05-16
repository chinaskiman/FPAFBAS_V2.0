from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal

from .candle_cache import Candle
from .pivots import find_pivot_highs, find_pivot_lows

Bias = Literal["bullish", "bearish", "neutral"]


@dataclass(frozen=True)
class BiasPoint:
    index: int
    time: int
    price: float


def extract_bias_points(candles: List[Candle], left: int = 2, right: int = 2) -> tuple[List[BiasPoint], List[BiasPoint]]:
    highs = [candle.high for candle in candles]
    lows = [candle.low for candle in candles]
    times = [candle.close_time for candle in candles]
    pivot_high = find_pivot_highs(highs, left, right)
    pivot_low = find_pivot_lows(lows, left, right)

    high_points = [
        BiasPoint(index=idx, time=times[idx], price=highs[idx])
        for idx, flag in enumerate(pivot_high)
        if flag
    ]
    low_points = [
        BiasPoint(index=idx, time=times[idx], price=lows[idx])
        for idx, flag in enumerate(pivot_low)
        if flag
    ]
    return high_points, low_points


def classify_timeframe_bias(high_points: List[BiasPoint], low_points: List[BiasPoint]) -> Bias:
    if len(high_points) < 2 or len(low_points) < 2:
        return "neutral"
    latest_high, prev_high = high_points[-1], high_points[-2]
    latest_low, prev_low = low_points[-1], low_points[-2]

    if latest_high.price > prev_high.price and latest_low.price > prev_low.price:
        return "bullish"
    if latest_high.price < prev_high.price and latest_low.price < prev_low.price:
        return "bearish"
    return "neutral"


def compute_signal_timeframe_bias(candles: List[Candle]) -> Bias:
    highs, lows = extract_bias_points(candles)
    return classify_timeframe_bias(highs, lows)
