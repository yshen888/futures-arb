# ⚡ Futures Arbitrage Scanner

A high-performance, real-time cryptocurrency futures arbitrage scanner that connects to multiple exchanges simultaneously to identify profitable trading opportunities across different platforms.

## Why Arbitrage Scanning Matters

In cryptocurrency markets, price discrepancies between exchanges create profitable arbitrage opportunities. This tool focuses on:

1. **Real-Time Price Monitoring**: Streams live price data from multiple major exchanges (Binance, Bybit, Hyperliquid, Kraken, OKX, Gate.io) to detect price differences instantly.

2. **Arbitrage Opportunity Detection**: Identifies profitable opportunities where you can buy on one exchange and sell on another for a guaranteed profit, accounting for fees and slippage.

3. **Spread Analysis**: Provides a comprehensive spread matrix showing price differences between all exchange pairs, helping traders understand market dynamics.

This tool provides the foundational data for developing sophisticated arbitrage trading strategies in the fast-moving cryptocurrency futures markets.

## Features

- **Multi-Exchange Connectivity**: Connects to 5 major exchanges (Binance, Bybit, Hyperliquid, OKX, Gate.io) via WebSockets
- **Real-Time Arbitrage Detection**: Identifies and displays arbitrage opportunities with configurable profit thresholds
- **Interactive Spread Matrix**: Visual matrix showing real-time spreads between all exchange pairs
- **Multi-Symbol Support**: Monitor BTCUSDT, ETHUSDT, XRPUSDT, and SOLUSDT with easy symbol switching
- **Smart Price Formatting**: Adaptive decimal precision based on asset price ranges
- **Live Price Charts**: Real-time price visualization with interactive legends
- **Professional Dashboard**: Clean, responsive UI optimized for trading professionals

## Architecture

### Go Backend

The backend is built in Go, leveraging its powerful concurrency features for optimal performance:

- **Concurrent Data Streams**: Each exchange connection runs in its own goroutine for simultaneous data ingestion
- **Channels for Communication**: Go channels safely pass price and trade data between exchange connectors and processors
- **Thread-Safe State Management**: Mutexes protect shared data structures ensuring data integrity
- **WebSocket Broadcasting**: Efficient real-time data distribution to all connected clients
- **Scalable Design**: Easy addition of new exchanges and trading pairs

### Frontend

Single-page application built with vanilla JavaScript for maximum performance:

- **uPlot Charting**: Fast, memory-efficient real-time price visualization
- **WebSocket Client**: Persistent connection for live data streaming
- **Dynamic Updates**: Real-time UI updates as new data arrives
- **Professional Interface**: Clean, data-focused design optimized for traders

## Quick Start

1. **Run the backend server**:
   ```bash
   go run main.go
   ```

2. **Open your browser**:
   Navigate to `http://localhost:8080`

## Supported Trading Pairs

The scanner currently supports:
- **BTCUSDT** - Bitcoin perpetual futures
- **ETHUSDT** - Ethereum perpetual futures
- **XRPUSDT** - XRP perpetual futures
- **SOLUSDT** - Solana perpetual futures

Symbol selection is available through the dropdown in the dashboard.

## Exchange Coverage

- **Binance Futures** - World's largest crypto derivatives exchange
- **Bybit Futures** - Major derivatives platform with high liquidity
- **Hyperliquid** - Decentralized perpetual futures exchange
- **OKX Futures** - Global exchange with advanced trading features
- **Gate.io Futures** - Comprehensive derivatives platform

*Note: Kraken Futures support is temporarily disabled but can be re-enabled in the future.*

## Configuration

Arbitrage detection threshold can be adjusted in the frontend (default: 0.05%). The system automatically:
- Filters opportunities below the minimum profit threshold
- Prevents spam alerts with intelligent rate limiting
- Calculates spreads accounting for exchange-specific factors

## Testing

Run the backend tests:

```bash
go test -v
```

## Performance

- **Sub-millisecond latency** for arbitrage detection
- **High-frequency updates** with throttled UI rendering
- **Memory efficient** data structures and chart rendering
- **Concurrent processing** of multiple exchange feeds