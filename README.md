# ⚡ Crypto Futures Arbitrage Scanner

A high-performance, low-latency cryptocurrency futures arbitrage scanner built in Go and vanilla JavaScript. It connects to multiple exchanges via WebSockets to identify and display real-time arbitrage opportunities.

## Market Microstructure & Arbitrage

In electronic markets, a single asset does not have a single price. Instead, the price is determined by the constantly changing order books of numerous, disconnected trading venues. The study of this fragmented market landscape—its participants, rules, and information flows—is known as **market microstructure**.

Price discrepancies between these venues are structural inefficiencies. **Arbitrage** is the strategy of exploiting these inefficiencies by simultaneously buying an asset on one venue where it is underpriced and selling it on another where it is overpriced, capturing the spread for a low-risk profit.

This project provides the foundational data-gathering and analysis tool to observe these microstructure phenomena and identify arbitrage opportunities in real-time. It is a necessary first step for the development of any systematic trading strategy that relies on cross-venue market data.

## Features

- **Multi-Exchange Connectivity**: Real-time data ingestion from Binance, Bybit, Hyperliquid, OKX, and Gate.io via persistent WebSocket connections.
- **Real-Time Arbitrage Calculation**: Identifies and displays arbitrage opportunities that exceed a user-configurable profit threshold.
- **Interactive Spread Matrix**: A visual matrix showing the real-time percentage spread between all connected exchange pairs for a given trading symbol.
- **Multi-Symbol Support**: Monitor BTCUSDT, ETHUSDT, XRPUSDT, and SOLUSDT with an interactive dropdown menu.
- **Adaptive Price Formatting**: UI automatically adjusts decimal precision based on the asset's price, ensuring clarity for both high and low-value assets.
- **Live Price Charts**: Real-time price visualization using uPlot, with an interactive legend displaying the latest price from each exchange.

## Architecture

The system is designed with a focus on performance, concurrency, and low latency. It is composed of a Go backend for data processing and a vanilla JavaScript frontend for data visualization.

### Go Backend

The backend is engineered to handle high-throughput data streams concurrently.

- **Concurrent Data Ingestion**: Each exchange connection runs in a dedicated `goroutine`. This isolates I/O operations and ensures that a delay from one exchange does not block or impact data processing from others.
- **Channel-Based Communication**: Data from exchange goroutines is passed to the central processor via buffered Go `channels`. This decouples the data ingestion logic from the processing logic and avoids mutex contention in the data path, which is critical for low-latency systems.
- **Thread-Safe State Management**: Shared data structures, such as the latest prices used for arbitrage calculation, are protected by mutexes to ensure data integrity across concurrent operations.
- **WebSocket Broadcasting**: A central broadcaster efficiently distributes processed data (prices, spreads, arbitrage opportunities) to all connected frontend clients over a single WebSocket connection.

### Frontend

The frontend is a single-page application built with vanilla JavaScript for maximum performance and minimal overhead.

- **No Framework Overhead**: By avoiding heavy frameworks (e.g., React, Vue), the application minimizes abstraction layers, reduces initial load time, and allows for direct manipulation of the DOM for performance-critical updates.
- **High-Performance Charting**: The UI uses `uPlot`, a fast and memory-efficient charting library specifically designed for visualizing high-frequency time-series data without performance degradation.
- **Efficient DOM Updates**: The application logic is written to perform minimal and targeted DOM updates upon receiving new data from the WebSocket. This avoids costly re-renders and ensures the UI remains responsive under a high message load.

## Quick Start

1.  **Run the backend server**:
    ```bash
    go run main.go
    ```

2.  **Open your browser**:
    Navigate to `http://localhost:8080`

## Supported Trading Pairs

- **BTCUSDT**
- **ETHUSDT**
- **XRPUSDT**
- **SOLUSDT**

## Exchange Coverage

- **Binance Futures**
- **Bybit Futures**
- **Hyperliquid** (Decentralized)
- **OKX Futures**
- **Gate.io Futures**

*Note: Kraken Futures support is implemented but disabled by default. It can be re-enabled in `main.go`.*

## Configuration

The **minimum arbitrage profit threshold** can be configured in the frontend UI. The default is `0.05%`. The system only displays opportunities that exceed this threshold after accounting for estimated trading fees.

## Testing

Run the backend unit tests:

```bash
go test -v ./...
```

## Performance

- **Latency**: The arbitrage detection logic in the Go backend executes in sub-millisecond time. End-to-end latency is primarily a factor of network RTT between the server and the exchange APIs.
- **Throughput**: The backend is designed to process thousands of price updates per second without significant performance degradation.
- **Frontend Rendering**: UI updates are throttled to maintain responsiveness, ensuring that high-frequency data from the backend does not lock up the browser.