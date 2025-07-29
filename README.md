# Futures Arbitrage Scanner

Real-time cross-exchange arbitrage scanner for cryptocurrency futures, starting with Binance futures WebSocket integration.

## Features

- **Real-time data**: Direct WebSocket connection to Binance futures
- **Arbitrage detection**: Automated detection of price differences > 0.05%
- **3D visualization**: Three.js-powered real-time price visualization
- **Scalable architecture**: Designed to easily add more exchanges

## Quick Start

```bash
# Start the server
go run main.go

# Open browser to
http://localhost:8080
```

## Architecture

- **Backend**: Go with gorilla/websocket
- **Frontend**: Three.js with WebGL rendering
- **Data source**: Binance futures WebSocket streams (no auth required)

## Monitored Symbols

- BTCUSDT
- ETHUSDT  
- ADAUSDT
- DOTUSDT
- LINKUSDT

## Testing

```bash
go test -v
```

## Adding New Exchanges

The codebase is designed for easy expansion. To add a new exchange:

1. Create exchange-specific connection function (similar to `connectBinanceFutures`)
2. Add exchange name to frontend arrays
3. Update price visualization colors
4. Test with existing arbitrage detection logic