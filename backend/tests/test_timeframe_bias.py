from app.candle_cache import Candle
from app.timeframe_bias import classify_timeframe_bias, extract_bias_points


def _candles_from_series(highs, lows):
    candles = []
    for idx, (high, low) in enumerate(zip(highs, lows)):
        open_time = idx * 60_000
        close_time = open_time + 59_999
        candles.append(
            Candle(
                open_time=open_time,
                close_time=close_time,
                open=low,
                high=high,
                low=low,
                close=high,
                volume=1.0,
            )
        )
    return candles


def test_classify_signal_timeframe_bias_bullish() -> None:
    highs = [1, 2, 3, 6, 4, 3, 2, 7, 4, 3, 2]
    lows = [6, 5, 4, 2, 3, 4, 5, 3, 4, 5, 6]
    candles = _candles_from_series(highs, lows)
    high_points, low_points = extract_bias_points(candles)
    assert classify_timeframe_bias(high_points, low_points) == "bullish"


def test_classify_signal_timeframe_bias_bearish() -> None:
    highs = [8, 7, 6, 9, 6, 5, 7, 4, 3, 5, 2]
    lows = [5, 4, 3, 4, 2, 1, 3, 2, 0.5, 2, 3]
    candles = _candles_from_series(highs, lows)
    high_points, low_points = extract_bias_points(candles)
    assert classify_timeframe_bias(high_points, low_points) == "bearish"


def test_classify_signal_timeframe_bias_neutral_insufficient_points() -> None:
    highs = [1, 2, 3, 2]
    lows = [3, 2, 1, 2]
    candles = _candles_from_series(highs, lows)
    high_points, low_points = extract_bias_points(candles)
    assert classify_timeframe_bias(high_points, low_points) == "neutral"
