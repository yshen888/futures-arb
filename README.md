# ⚡ Futures Arbitrage & CVD Scanner

This project is a high-performance, real-time cryptocurrency futures arbitrage scanner and Cumulative Volume Delta (CVD) analysis tool. It connects to multiple exchanges simultaneously, identifies arbitrage opportunities, and provides insights into market microstructure through live CVD tracking.

## Why Market Microstructure Data Matters

In the world of high-frequency trading, understanding market microstructure is crucial. It's not just about the price, but *how* the price is formed. This tool focuses on two key aspects:

1.  **Arbitrage Opportunities**: By streaming data from multiple exchanges (Binance, Bybit, Hyperliquid, Kraken, Deribit), the scanner can instantly spot price discrepancies. These fleeting opportunities, often lasting for milliseconds, can be capitalized on by advanced trading algorithms.

2.  **Cumulative Volume Delta (CVD)**: CVD is a powerful indicator that tracks the net difference between buying and selling volume. It provides a real-time view of market sentiment and order flow.
    *   **Rising CVD**: Indicates aggressive buying pressure, suggesting bullish sentiment.
    *   **Falling CVD**: Indicates aggressive selling pressure, suggesting bearish sentiment.
    *   **Divergences**: When price and CVD move in opposite directions, it can signal a potential trend reversal.

This tool provides the foundational data for developing sophisticated trading strategies based on these market microstructure concepts.

## Features

-   **Multi-Exchange Connectivity**: Connects to Binance, Bybit, Hyperliquid, Kraken, and Deribit futures markets via WebSockets.
-   **Real-Time Arbitrage Detection**: Identifies and displays arbitrage opportunities with a profit potential greater than 0.05%.
-   **Live CVD Analysis**: Calculates and visualizes CVD for each exchange in real-time.
-   **Interactive Frontend**: A clean and responsive UI built with vanilla JavaScript and uPlot for high-performance charting.
-   **Scalable Go Backend**: A concurrent and efficient backend that can handle high-throughput data streams.

## Architecture

### Go Backend

The backend is built in Go, leveraging its powerful concurrency features for optimal performance.

-   **Concurrent Data Streams**: Each exchange connection runs in its own goroutine, allowing for simultaneous data ingestion without blocking.
-   **Channels for Communication**: Go channels are used to safely and efficiently pass price and trade data from the exchange connectors to the main processing hub.
-   **Mutex for State Management**: Mutexes are used to protect shared data structures (like the price and CVD maps), ensuring thread safety.
-   **WebSocket Broadcasting**: A central hub efficiently broadcasts processed data (prices, arbitrage opportunities, CVD) to all connected frontend clients.

This architecture is highly scalable, allowing for the easy addition of new exchanges and data processing modules.

### Frontend

The frontend is a single-page application (SPA) built with vanilla JavaScript, HTML, and CSS.

-   **uPlot for Charting**: We use uPlot, a fast and memory-efficient charting library, to render the real-time price and CVD data.
-   **WebSocket Client**: The frontend maintains a persistent WebSocket connection to the Go backend to receive live data.
-   **Dynamic UI**: The UI is dynamically updated in real-time as new data arrives from the backend.
-   **Minimalist Design**: The focus is on a clean, data-rich interface that is both performant and easy to understand.

## Quick Start

1.  **Run the backend server**:
    ```bash
    go run main.go
    ```

2.  **Open your browser**:
    Navigate to `http://localhost:8080`

## Monitored Symbols

Currently, the scanner is configured to monitor `BTCUSDT`. This can be easily changed in the `main.go` file.

## Testing

To run the backend tests, use the following command:

```bash
go test -v
```