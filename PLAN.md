# Cross-Exchange Arbitrage Scanner - Technical Specification (Futures Only)

## Overview
WebSocket-based arbitrage scanner connecting directly to **futures trade streams** from tier 1 exchanges (no authentication required). Backend in Go using gorilla/websocket, frontend using WebGL vs Three.js analysis for real-time price visualization.

## Exchange WebSocket Futures Trade Stream Specifications

### Binance Futures (Tier 1)

**WebSocket URL**: `wss://fstream.binance.com`[1]

**Connection Details**:
- No authentication required for public market streams[1]
- 24-hour connection limit (auto-disconnect)[1]
- Ping/pong required (server pings every 3 minutes)[1]
- Max 1024 streams per connection[1]
- Rate limit: 10 messages/second per connection[1]

**Futures Trade Stream Format**:
```
Stream: @aggTrade
URL: wss://fstream.binance.com/ws/btcusdt@aggTrade
Combined: wss://fstream.binance.com/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade
```

**Go Implementation**:
```go
package main

import (
    "encoding/json"
    "log"
    "strings"
    "github.com/gorilla/websocket"
)

type BinanceFuturesTrade struct {
    EventType string `json:"e"` // "aggTrade"
    EventTime int64  `json:"E"`
    Symbol    string `json:"s"`
    TradeID   int64  `json:"a"`
    Price     string `json:"p"`
    Quantity  string `json:"q"`
    FirstTradeID int64 `json:"f"`
    LastTradeID  int64 `json:"l"`
    TradeTime    int64 `json:"T"`
    IsMaker      bool  `json:"m"`
}

func connectBinanceFutures(symbols []string, tradeChan chan maxPrice {
            maxPrice = price
            maxExchange = exchange
        }
    }

    profitPct := ((maxPrice - minPrice) / minPrice) * 100

    if profitPct > 0.05 { // Minimum 0.05% profit threshold for futures
        opportunity := ArbitrageOpportunity{
            Symbol:       symbol,
            BuyExchange:  minExchange,
            SellExchange: maxExchange,
            BuyPrice:     minPrice,
            SellPrice:    maxPrice,
            ProfitPct:    profitPct,
            Timestamp:    time.Now().UnixMilli(),
        }

        s.broadcastOpportunity(opportunity)
    }
}

func (s *FuturesScanner) handleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, err := s.upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("WebSocket upgrade error: %v", err)
        return
    }
    defer conn.Close()

    s.clientsMutex.Lock()
    s.wsClients[conn] = true
    s.clientsMutex.Unlock()

    defer func() {
        s.clientsMutex.Lock()
        delete(s.wsClients, conn)
        s.clientsMutex.Unlock()
    }()

    // Send current prices periodically
    ticker := time.NewTicker(100 * time.Millisecond)
    defer ticker.Stop()

    for {
        select {
        case 


    Futures Arbitrage Scanner
    
        body { margin: 0; padding: 0; background: #000; font-family: 'Monaco', monospace; }
        canvas { display: block; }
        #ui { 
            position: absolute; 
            top: 10px; 
            left: 10px; 
            color: #00ff00; 
            font-size: 12px;
            z-index: 100;
        }
        .exchange-panel {
            background: rgba(0,0,0,0.8);
            padding: 10px;
            margin: 5px 0;
            border: 1px solid #333;
        }
        .arbitrage-alert {
            background: rgba(255,0,0,0.9);
            color: white;
            padding: 10px;
            margin: 5px 0;
            border-radius: 5px;
            animation: pulse 1s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
    


    
        Futures Arbitrage Scanner
        
        
    
    
    
    


```

**Three.js Implementation**:
```javascript
class FuturesArbitrageVisualizer {
    constructor() {
        this.exchanges = ['binance_futures', 'bybit_futures', 'okx_futures', 'kraken_futures', 'deribit'];
        this.symbols = ['BTC-USDT', 'ETH-USDT', 'BTC-USD', 'ETH-USD'];
        this.priceHistory = {};
        this.arbitrageOpportunities = [];
        
        this.setupThreeJS();
        this.setupWebSocket();
        this.setupUI();
        this.animate();
    }

    setupThreeJS() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 50;

        // Renderer setup  
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Performance monitoring
        this.stats = new Stats();
        this.stats.showPanel(0); // FPS panel
        document.body.appendChild(this.stats.dom);

        // Price visualization objects
        this.priceNodes = new Map();
        this.connectionLines = [];
        
        this.setupPriceVisualization();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupPriceVisualization() {
        const nodeGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const nodeColors = {
            'binance_futures': 0xf0b90b,
            'bybit_futures': 0xf7931a,
            'okx_futures': 0x0052ff,
            'kraken_futures': 0x663399,
            'deribit': 0xff6600
        };

        // Create nodes for each exchange-symbol pair
        let nodeIndex = 0;
        const gridSize = Math.ceil(Math.sqrt(this.exchanges.length * this.symbols.length));
        
        this.exchanges.forEach((exchange, exchangeIdx) => {
            this.symbols.forEach((symbol, symbolIdx) => {
                const nodeMaterial = new THREE.MeshBasicMaterial({ 
                    color: nodeColors[exchange] || 0xffffff 
                });
                
                const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
                
                // Position nodes in grid layout
                const x = (exchangeIdx - (this.exchanges.length - 1) / 2) * 15;
                const y = (symbolIdx - (this.symbols.length - 1) / 2) * 10;
                
                node.position.set(x, y, 0);
                node.userData = { exchange, symbol, baseScale: 1.0 };
                
                this.scene.add(node);
                this.priceNodes.set(`${exchange}-${symbol}`, node);
                
                nodeIndex++;
            });
        });

        // Create connection lines for arbitrage opportunities
        this.lineGeometry = new THREE.BufferGeometry();
        this.lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0xff0000,
            linewidth: 3,
            transparent: true,
            opacity: 0.8
        });
    }

    setupWebSocket() {
        this.ws = new WebSocket('ws://localhost:8080/ws');
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'prices') {
                this.updatePriceVisualization(data.prices);
            } else if (data.type === 'arbitrage') {
                this.handleArbitrageOpportunity(data.opportunity);
            }
        };
        
        this.ws.onclose = () => {
            setTimeout(() => this.setupWebSocket(), 1000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    updatePriceVisualization(prices) {
        for (const [symbol, exchangePrices] of Object.entries(prices)) {
            for (const [exchange, price] of Object.entries(exchangePrices)) {
                const nodeKey = `${exchange}-${symbol}`;
                const node = this.priceNodes.get(nodeKey);
                
                if (node) {
                    // Update price history
                    if (!this.priceHistory[nodeKey]) {
                        this.priceHistory[nodeKey] = [];
                    }
                    
                    this.priceHistory[nodeKey].push({
                        price: price,
                        timestamp: Date.now()
                    });
                    
                    // Keep only last 100 data points
                    if (this.priceHistory[nodeKey].length > 100) {
                        this.priceHistory[nodeKey].shift();
                    }

                    // Animate node based on price change
                    const history = this.priceHistory[nodeKey];
                    if (history.length > 1) {
                        const priceDiff = history[history.length - 1].price - history[history.length - 2].price;
                        const percentChange = (priceDiff / history[history.length - 2].price) * 100;
                        
                        // Scale node based on activity
                        const targetScale = 1 + Math.abs(percentChange) * 10;
                        node.scale.setScalar(Math.min(targetScale, 3));
                        
                        // Color based on price direction
                        if (percentChange > 0) {
                            node.material.color.setHex(0x00ff00); // Green for up
                        } else if (percentChange  {
                            node.scale.setScalar(1);
                            const originalColor = {
                                'binance_futures': 0xf0b90b,
                                'bybit_futures': 0xf7931a,
                                'okx_futures': 0x0052ff,
                                'kraken_futures': 0x663399,
                                'deribit': 0xff6600
                            };
                            node.material.color.setHex(originalColor[exchange] || 0xffffff);
                        }, 1000);
                    }
                }
            }
        }
        
        this.updateUI(prices);
    }

    handleArbitrageOpportunity(opportunity) {
        // Create visual connection between exchanges
        const buyNode = this.priceNodes.get(`${opportunity.buy_exchange}-${opportunity.symbol}`);
        const sellNode = this.priceNodes.get(`${opportunity.sell_exchange}-${opportunity.symbol}`);
        
        if (buyNode && sellNode) {
            const points = [buyNode.position, sellNode.position];
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const lineMaterial = new THREE.LineBasicMaterial({ 
                color: 0xff00ff,
                linewidth: 5,
                transparent: true,
                opacity: 1.0
            });
            
            const line = new THREE.Line(lineGeometry, lineMaterial);
            this.scene.add(line);
            
            // Animate line opacity and remove after 3 seconds
            const startTime = Date.now();
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = elapsed / 3000;
                
                if (progress >= 1) {
                    this.scene.remove(line);
                    return;
                }
                
                line.material.opacity = 1 - progress;
                requestAnimationFrame(animate);
            };
            animate();
        }
        
        this.addArbitrageAlert(opportunity);
    }

    setupUI() {
        this.exchangesDiv = document.getElementById('exchanges');
        this.alertsDiv = document.getElementById('arbitrage-alerts');
    }

    updateUI(prices) {
        let html = '';
        
        for (const [symbol, exchangePrices] of Object.entries(prices)) {
            html += `
                ${symbol}`;
            
            for (const [exchange, price] of Object.entries(exchangePrices)) {
                const history = this.priceHistory[`${exchange}-${symbol}`];
                let changeText = '';
                
                if (history && history.length > 1) {
                    const priceDiff = history[history.length - 1].price - history[history.length - 2].price;
                    const percentChange = (priceDiff / history[history.length - 2].price) * 100;
                    const arrow = priceDiff > 0 ? '↑' : '↓';
                    const color = priceDiff > 0 ? 'color: #00ff00' : 'color: #ff0000';
                    changeText = ` ${arrow} ${percentChange.toFixed(4)}%`;
                }
                
                html += `${exchange}: $${price.toFixed(2)}${changeText}`;
            }
            
            html += '';
        }
        
        this.exchangesDiv.innerHTML = html;
    }

    addArbitrageAlert(opportunity) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'arbitrage-alert';
        alertDiv.innerHTML = `
            ARBITRAGE OPPORTUNITY
            ${opportunity.symbol}: ${opportunity.profit_pct.toFixed(3)}% profit
            Buy: ${opportunity.buy_exchange} @ $${opportunity.buy_price.toFixed(2)}
            Sell: ${opportunity.sell_exchange} @ $${opportunity.sell_price.toFixed(2)}
        `;
        
        this.alertsDiv.insertBefore(alertDiv, this.alertsDiv.firstChild);
        
        // Remove alert after 10 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 10000);
        
        // Keep only last 5 alerts
        while (this.alertsDiv.children.length > 5) {
            this.alertsDiv.removeChild(this.alertsDiv.lastChild);
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        this.stats.begin();
        
        // Rotate camera around scene
        const time = Date.now() * 0.0005;
        this.camera.position.x = Math.cos(time) * 50;
        this.camera.position.z = Math.sin(time) * 50;
        this.camera.lookAt(this.scene.position);
        
        this.renderer.render(this.scene, this.camera);
        
        this.stats.end();
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize visualizer
const visualizer = new FuturesArbitrageVisualizer();
```

## Performance Optimizations

### Connection Management
- **Single connections per exchange** with multiple symbol subscriptions
- **Exponential backoff** for reconnections[1][3]
- **Heartbeat monitoring** for connection health[1][3][5]

### Three.js Optimizations[14][18]
- **Object pooling** for frequently updated elements
- **InstancedMesh** for repeated visual elements
- **BufferGeometry** for better memory usage
- **Frustum culling** and **LOD** for performance
- **Stats.js integration** for performance monitoring[16]

### Data Processing
- **Circular buffers** (fixed size arrays) for price history
- **Concurrent processing** with goroutines
- **Symbol normalization** for cross-exchange comparison
- **Efficient arbitrage detection** algorithms

## Build Instructions

### Backend
```bash
go mod init futures-arbitrage-scanner
go get github.com/gorilla/websocket
go run main.go
```

### Frontend
- Serve HTML/JS files on local server  
- WebSocket connection to localhost:8080/ws
- Three.js r128+ for optimal performance
- Modern browser with WebGL support

This specification provides a complete foundation for building a high-performance **futures-only** cross-exchange arbitrage scanner with Three.js visualization, connecting directly to public WebSocket trade streams from major exchanges without requiring API tokens.

[1] https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams
[2] https://stackoverflow.com/questions/78411589/python-with-bybit-websocket-to-fetch-all-coins-how-to-do-it
[3] https://pkg.go.dev/github.com/dydxprotocol/slinky/providers/websockets/bybit
[4] https://www.esegece.com/help/sgcWebSockets/Components/APIs/API/API_OKX.htm
[5] https://pkg.go.dev/github.com/dydxprotocol/slinky/providers/websockets/okx
[6] https://python-kraken-sdk.readthedocs.io/en/stable/futures/websockets.html
[7] https://docs.kraken.com/api/docs/guides/futures-introduction/
[8] https://docs.rs/deribit-websocket/latest/deribit_websocket/
[9] https://www.npmjs.com/package/@andreiashu/deribit_api
[10] https://insights.deribit.com/dev-hub/how-to-maintain-and-authenticate-a-websocket-connection-to-deribit-python/
[11] https://blog.pixelfreestudio.com/webgl-vs-three-js-key-differences-for-3d-graphics/
[12] https://moldstud.com/articles/p-what-are-the-differences-between-webgl-and-threejs-development
[13] https://stackshare.io/stackups/three-js-vs-webgl
[14] https://www.linkedin.com/posts/toakshh_threejs-editor-activity-7326459661044396032-0j9x
[15] https://discourse.threejs.org/t/main-reasons-for-performance-differences-between-webgl-frameworks/40729
[16] https://discourse.threejs.org/t/how-to-test-performance-what-are-the-reasonable-limits/32430/5
[17] https://blog.fastforwardlabs.com/2017/10/04/first-look-using-three.js-for-2d-data-visualization.html
[18] https://www.linkedin.com/pulse/dynamic-lod-techniques-real-time-performance-threejs-optellix-8egae
[19] https://github.com/oliver-zehentleitner/unicorn-binance-websocket-api
[20] https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-api-general-info
[21] https://github.com/waxdred/bybit_websocket_go
[22] https://www.okx.com/en-eu/help/changes-to-v5-api-websocket-subscription-parameter-and-url
[23] https://github.com/bmoscon/cryptofeed/issues/1075
[24] https://www.binance.com/en/binance-api
[25] https://wundertrading.com/journal/en/learn/article/bybit-api
[26] https://rdrr.io/cran/okxAPI/man/websocketAPIpublic.html
[27] https://pypi.org/project/binance-futures-async/
[28] https://www.okx.com/help/okx-will-change-subscription-rules-for-tbt-order-book-channels-on-websocket-api
[29] https://www.esegece.com/help/sgcWebSockets/Components/APIs/API/API_Binance_Futures.htm
[30] https://dev.to/kylefoo/bybits-pybit-how-to-subscribe-to-kline-websocket-stream-5c2f
[31] https://rdrr.io/cran/okxAPI/src/R/websocketAPIpublic.R
[32] https://academy.binance.com/en/articles/how-to-use-binance-websocket-api
[33] https://www.bybit.com/future-activity/en/developer
[34] https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/guides/websocket
[35] https://github.com/vorandrew/deribit-ws-js
[36] https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-overview
[37] https://blog.kraken.com/product/websockets-public-api-launching-soon
[38] https://docs.cdp.coinbase.com/advanced-trade/docs/ws-best-practices
[39] https://www.esegece.com/help/sgcWebSockets/Components/APIs/API/API_Kraken_Futures.htm
[40] https://docs.cdp.coinbase.com/advanced-trade/docs/welcome
[41] https://support.kraken.com/hc/pl/articles/360022326871-Kraken-WebSocket-API-Frequently-Asked-Questions
[42] https://help.coinbase.com/en/developer-platform/websocket-feeds/advanced-trade
[43] https://github.com/btschwertfeger/python-kraken-sdk
[44] https://github.com/vorandrew/deribit-ws-nodejs
[45] https://github.com/coinbase/coinbase-advanced-py
[46] https://stackoverflow.com/questions/70661225/deribit-python-api-websocket-only-returns-1-valid-message
[47] https://www.coinbase.com/en-pt/developer-platform/products/advanced-trade-api
[48] https://docs.kraken.com/api/docs/guides/global-intro/
[49] https://www.reddit.com/r/GraphicsProgramming/comments/bs0cut/graphics_rendering_abstraction_what_is_the_best/
[50] https://www.sitepoint.com/introducing-four-webgl-easier/
[51] https://discourse.threejs.org/t/the-new-webgl-vs-webgpu-performance-comparison-example/69097
[52] https://gamedev.net/forums/topic/633737-trying-to-wrap-my-head-around-directxopengl-abstraction-layer/
[53] https://stackoverflow.com/questions/38388813/improving-three-js-performance
[54] https://www.reddit.com/r/opengl/comments/zx27wv/learning_webgl_vs_threejs/
[55] https://www.youtube.com/watch?v=UCxCsxjNkrI
[56] https://wpdean.com/what-is-webgl/
[57] https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers
[58] https://stackoverflow.com/questions/21603350/is-there-any-reason-for-using-webgl-instead-of-2d-canvas-for-2d-games-apps
[59] https://www.threejsdevelopers.com/blogs/detail-comparison-three-js-vs-d3-js/
[60] https://news.ycombinator.com/item?id=9071465
[61] https://bybit-exchange.github.io/docs/v5/websocket/public/trade
[62] https://www.okx.com/docs-v5/en/
[63] https://docs.kraken.com/websockets-v2/
[64] https://www.okx.com/oktc/docs/dev/api/oktc-api/websocket
[65] https://github.com/automatesolutions/WebSocket_HFT
[66] https://support.kraken.com/hc/pl/articles/360022327631-WebSocket-API-v1-Market-data-feed-example
[67] https://my.okx.com/docs-v5/en/
[68] https://support.kraken.com/en-nl/articles/360022327631-websocket-api-v1-market-data-feed-example
[69] https://www.okx.com/okx-api
[70] https://docs.rs/crypto-rest-client/latest/crypto_rest_client/struct.DeribitRestClient.html
[71] https://github.com/DmitryMihaylov/API-docs-OKEx.com/blob/master/API-For-Futures-EN/WebSocket%20API%20for%20FUTURES.md
[72] https://blog.kraken.com/product/new-version-of-kraken-websockets-public-api-goes-live-may-30
[73] https://wundertrading.com/journal/en/learn/article/deribit-api
[74] https://docs.kraken.com/api/docs/guides/spot-ws-intro/
[75] https://docs.deribit.com