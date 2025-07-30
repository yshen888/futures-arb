class FuturesArbitrageScanner {
    constructor() {
        this.currentSymbol = 'BTCUSDT';
        this.exchanges = new Map();
        this.priceHistory = new Map();
        this.arbitrageAlerts = [];
        this.maxHistoryPoints = 1000;
        this.connectedExchanges = new Set();
        
        this.chart = null;
        this.chartData = [[], [], [], [], []]; // timestamps, binance, bybit, hyperliquid, kraken
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.chartUpdatePending = false;
        this.lastChartUpdate = 0;
        this.chartUpdateThrottle = 100; // ms
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupChart();
        this.connectWebSocket();
        this.startFPSCounter();
        this.startRenderLoop();
    }

    setupEventListeners() {
        const symbolInput = document.getElementById('symbolInput');
        symbolInput.addEventListener('change', (e) => {
            this.changeSymbol(e.target.value.toUpperCase());
        });


        window.addEventListener('resize', () => {
            if (this.chart) {
                this.chart.setSize({
                    width: this.getChartWidth(),
                    height: this.getChartHeight()
                });
            }
        });
    }

    setupChart() {
        const chartContainer = document.getElementById('chart');
        
        // Initialize with minimal data to show chart immediately
        const now = Date.now() / 1000;
        this.chartData = [
            [now - 60, now],
            [null, null],
            [null, null],
            [null, null],
            [null, null],
            [null, null]
        ];
        
        const opts = {
            width: this.getChartWidth(),
            height: this.getChartHeight(),
            plugins: [
                {
                    hooks: {
                        drawClear: [
                            u => {
                                const ctx = u.ctx;
                                ctx.fillStyle = '#0f0f0f';
                                ctx.fillRect(0, 0, u.over.width, u.over.height);
                            }
                        ]
                    }
                }
            ],
            scales: {
                x: {
                    time: true,
                    space: 60,
                },
                y: {
                    auto: true,
                    space: 60,
                }
            },
            axes: [
                {
                    stroke: '#444',
                    grid: {
                        show: true,
                        stroke: '#222',
                        width: 1,
                    },
                    ticks: {
                        show: true,
                        stroke: '#444',
                        width: 1,
                        size: 5,
                    },
                    font: '11px JetBrains Mono, Monaco, Consolas, monospace',
                    labelFont: '11px JetBrains Mono, Monaco, Consolas, monospace',
                    size: 60,
                    gap: 8,
                    stroke: '#888',
                },
                {
                    stroke: '#444',
                    grid: {
                        show: true,
                        stroke: '#222',
                        width: 1,
                    },
                    ticks: {
                        show: true,
                        stroke: '#444',
                        width: 1,
                        size: 5,
                    },
                    font: '11px JetBrains Mono, Monaco, Consolas, monospace',
                    labelFont: '11px JetBrains Mono, Monaco, Consolas, monospace',
                    size: 80,
                    gap: 5,
                    stroke: '#888',
                    values: (_, vals) => vals.map(v => '$' + v.toFixed(2)),
                }
            ],
            series: [
                {},
                {
                    label: "Binance Futures",
                    stroke: "#f0b90b",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + v.toFixed(2),
                },
                {
                    label: "Bybit Futures",
                    stroke: "#f7931a",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + v.toFixed(2),
                },
                {
                    label: "Hyperliquid Futures",
                    stroke: "#97FCE4",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + v.toFixed(2),
                },
                {
                    label: "Kraken Futures",
                    stroke: "#5a5aff",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + v.toFixed(2),
                },
            ],
            legend: {
                show: false,
            },
            cursor: {
                show: true,
                x: true,
                y: true,
                lock: false,
                focus: {
                    prox: 16,
                },
                drag: {
                    setScale: false,
                    x: true,
                    y: false,
                },
            },
            select: {
                show: false,
            },
            hooks: {
                setCursor: [
                    (u) => {
                        this.updateCustomLegend(u);
                    }
                ]
            }
        };

        this.chart = new uPlot(opts, this.chartData, chartContainer);
        this.updateChartTitle();
    }


    getChartWidth() {
        const chartContainer = document.getElementById('chart');
        return chartContainer ? chartContainer.clientWidth - 20 : 800;
    }

    getChartHeight() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) return 400;
        
        const containerHeight = chartContainer.clientHeight;
        return Math.max(containerHeight - 25, 300);
    }


    connectWebSocket() {
        const wsStatus = document.getElementById('wsStatus');
        const wsStatusText = document.getElementById('wsStatusText');
        
        wsStatus.className = 'status-dot disconnected';
        wsStatusText.textContent = 'Connecting...';

        try {
            this.ws = new WebSocket('ws://localhost:8080/ws');
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                wsStatus.className = 'status-dot connected';
                wsStatusText.textContent = 'Connected';
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                wsStatus.className = 'status-dot disconnected';
                wsStatusText.textContent = 'Disconnected';
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                wsStatus.className = 'status-dot disconnected';
                wsStatusText.textContent = 'Error';
            };

        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connectWebSocket(), delay);
        }
    }

    handleWebSocketMessage(data) {
        if (data.type === 'prices') {
            this.updatePrices(data.prices);
        } else if (data.type === 'price_update') {
            this.handlePriceUpdate(data);
        } else if (data.type === 'arbitrage') {
            this.handleArbitrageOpportunity(data.opportunity);
        }
    }

    updatePrices(prices) {
        for (const [symbol, exchangePrices] of Object.entries(prices)) {
            if (symbol === this.currentSymbol) {
                for (const [exchange, price] of Object.entries(exchangePrices)) {
                    this.updateExchangePrice(exchange, price);
                    this.addPriceToHistory(exchange, price);
                }
                this.updateExchangeList();
                this.updateChart();
                break;
            }
        }
    }

    handlePriceUpdate(data) {
        if (data.symbol === this.currentSymbol) {
            this.updateExchangePrice(data.exchange, data.price);
            this.addPriceToHistory(data.exchange, data.price, data.timestamp);
            this.updateExchangeList();
            this.updateChart();
        }
    }

    addPriceToHistory(exchange, price, timestamp = null) {
        const ts = timestamp ? timestamp / 1000 : Date.now() / 1000;
        
        if (!this.priceHistory.has(exchange)) {
            this.priceHistory.set(exchange, []);
        }

        const history = this.priceHistory.get(exchange);
        history.push([ts, price]);

        if (history.length > this.maxHistoryPoints) {
            history.shift();
        }
    }

    updateExchangePrice(exchange, price) {
        const previousPrice = this.exchanges.get(exchange)?.price || price;
        const change = price - previousPrice;
        const changePercent = previousPrice !== 0 ? (change / previousPrice) * 100 : 0;

        this.exchanges.set(exchange, {
            price: price,
            previousPrice: previousPrice,
            change: change,
            changePercent: changePercent,
            lastUpdate: Date.now()
        });

        this.connectedExchanges.add(exchange);
        this.updateExchangeTooltip();
    }

    addPriceToHistory(exchange, price, timestamp = null) {
        const ts = timestamp ? timestamp / 1000 : Date.now() / 1000;
        
        if (!this.priceHistory.has(exchange)) {
            this.priceHistory.set(exchange, []);
        }

        const history = this.priceHistory.get(exchange);
        history.push([ts, price]);

        if (history.length > this.maxHistoryPoints) {
            history.shift();
        }
    }

    updateExchangeList() {
        const exchangeList = document.getElementById('exchangeList');
        
        if (this.exchanges.size === 0) {
            exchangeList.innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        const exchangeColors = {
            'binance_futures': '#f0b90b',
            'bybit_futures': '#f7931a',
            'hyperliquid_futures': '#97FCE4',
            'kraken_futures': '#5a5aff',
        };

        let html = '';
        for (const [exchange, data] of this.exchanges.entries()) {
            const changeClass = data.change >= 0 ? 'up' : 'down';
            const changeSymbol = data.change >= 0 ? '↑' : '↓';
            const color = exchangeColors[exchange] || '#888';
            
            html += `
                <div class="exchange-item">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="exchange-color-dot" style="background: ${color};"></div>
                        <div class="exchange-name">${exchange.replace('_', ' ')}</div>
                    </div>
                    <div>
                        <span class="exchange-price">$${data.price.toFixed(2)}</span>
                        <span class="price-change ${changeClass}">
                            ${changeSymbol} ${Math.abs(data.changePercent).toFixed(3)}%
                        </span>
                    </div>
                </div>
            `;
        }
        
        exchangeList.innerHTML = html;
    }

    updateChart() {
        const now = performance.now();
        if (now - this.lastChartUpdate < this.chartUpdateThrottle) {
            if (!this.chartUpdatePending) {
                this.chartUpdatePending = true;
                setTimeout(() => {
                    this.chartUpdatePending = false;
                    this.performChartUpdate();
                }, this.chartUpdateThrottle - (now - this.lastChartUpdate));
            }
            return;
        }
        
        this.performChartUpdate();
    }

    performChartUpdate() {
        if (!this.chart || this.priceHistory.size === 0) return;

        const binanceHistory = this.priceHistory.get('binance_futures') || [];
        const bybitHistory = this.priceHistory.get('bybit_futures') || [];
        const hyperliquidHistory = this.priceHistory.get('hyperliquid_futures') || [];
        const krakenHistory = this.priceHistory.get('kraken_futures') || [];
        
        if (binanceHistory.length === 0 && bybitHistory.length === 0 && hyperliquidHistory.length === 0 && krakenHistory.length === 0) return;

        // Create combined timestamp array
        const allTimestamps = new Set();
        binanceHistory.forEach(point => allTimestamps.add(point[0]));
        bybitHistory.forEach(point => allTimestamps.add(point[0]));
        hyperliquidHistory.forEach(point => allTimestamps.add(point[0]));
        krakenHistory.forEach(point => allTimestamps.add(point[0]));
        
        const timestamps = Array.from(allTimestamps).sort((a, b) => a - b);
        
        // Create price arrays with forward-filled values for missing data points
        const binancePrices = [];
        const bybitPrices = [];
        const hyperliquidPrices = [];
        const krakenPrices = [];
        
        const binanceMap = new Map(binanceHistory);
        const bybitMap = new Map(bybitHistory);
        const hyperliquidMap = new Map(hyperliquidHistory);
        const krakenMap = new Map(krakenHistory);
        
        let lastBinancePrice = null;
        let lastBybitPrice = null;
        let lastHyperliquidPrice = null;
        let lastKrakenPrice = null;
        
        timestamps.forEach(timestamp => {
            const binancePrice = binanceMap.get(timestamp);
            const bybitPrice = bybitMap.get(timestamp);
            const hyperliquidPrice = hyperliquidMap.get(timestamp);
            const krakenPrice = krakenMap.get(timestamp);
            
            if (binancePrice !== undefined) {
                lastBinancePrice = binancePrice;
            }
            if (bybitPrice !== undefined) {
                lastBybitPrice = bybitPrice;
            }
            if (hyperliquidPrice !== undefined) {
                lastHyperliquidPrice = hyperliquidPrice;
            }
            if (krakenPrice !== undefined) {
                lastKrakenPrice = krakenPrice;
            }

            binancePrices.push(lastBinancePrice);
            bybitPrices.push(lastBybitPrice);
            hyperliquidPrices.push(lastHyperliquidPrice);
            krakenPrices.push(lastKrakenPrice);
        });

        this.chartData = [timestamps, binancePrices, bybitPrices, hyperliquidPrices, krakenPrices];
        this.chart.setData(this.chartData);
        this.lastChartUpdate = performance.now();
    }

    handleArbitrageOpportunity(opportunity) {
        this.arbitrageAlerts.unshift(opportunity);
        
        if (this.arbitrageAlerts.length > 10) {
            this.arbitrageAlerts = this.arbitrageAlerts.slice(0, 10);
        }

        this.updateArbitrageAlerts();
    }

    updateArbitrageAlerts() {
        const alertsContainer = document.getElementById('arbitrageAlerts');
        
        if (this.arbitrageAlerts.length === 0) {
            alertsContainer.innerHTML = '<div class="loading">No opportunities detected</div>';
            return;
        }

        let html = '';
        this.arbitrageAlerts.forEach(alert => {
            const timestamp = new Date(alert.timestamp).toLocaleTimeString();
            html += `
                <div class="arbitrage-alert">
                    <div class="opportunity-symbol">${alert.symbol}</div>
                    <div class="profit">+${alert.profit_pct.toFixed(3)}% profit</div>
                    <div class="trade-info">
                        <div>Buy: ${alert.buy_exchange} @ $${alert.buy_price.toFixed(2)}</div>
                        <div>Sell: ${alert.sell_exchange} @ $${alert.sell_price.toFixed(2)}</div>
                    </div>
                    <div style="font-size: 10px; color: #666; margin-top: 4px;">${timestamp}</div>
                </div>
            `;
        });
        
        alertsContainer.innerHTML = html;
    }

    changeSymbol(newSymbol) {
        if (newSymbol === this.currentSymbol) return;
        
        this.currentSymbol = newSymbol;
        this.exchanges.clear();
        this.priceHistory.clear();
        this.arbitrageAlerts = [];
        
        this.chartData = [[], [], [], [], [], []];
        if (this.chart) {
            this.chart.setData(this.chartData);
        }

        this.updateChartTitle();
        this.updateExchangeList();
        this.updateArbitrageAlerts();
        
        document.getElementById('symbolStatus').textContent = newSymbol;
        
        console.log(`Switched to symbol: ${newSymbol}`);
    }

    updateChartTitle() {
        const chartTitle = document.getElementById('chartTitle');
        chartTitle.textContent = `Price Chart - ${this.currentSymbol} (Live)`;
    }

    updateExchangeTooltip() {
        const tooltip = document.getElementById('exchangeTooltip');
        if (this.connectedExchanges.size === 0) {
            tooltip.textContent = 'No exchanges connected';
        } else {
            const exchangeNames = Array.from(this.connectedExchanges)
                .map(ex => ex.replace('_', ' ').toUpperCase())
                .join(', ');
            tooltip.textContent = `Connected: ${exchangeNames}`;
        }
    }

    updateCustomLegend(u) {
        const legend = document.getElementById('chartLegend');
        const legendTime = document.getElementById('legendTime');
        const binanceValue = document.getElementById('binanceValue');
        const bybitValue = document.getElementById('bybitValue');
        const hyperliquidValue = document.getElementById('hyperliquidValue');
        const krakenValue = document.getElementById('krakenValue');

        if (u.cursor.idx === null) {
            legend.classList.remove('visible');
            return;
        }

        legend.classList.add('visible');

        // Get the data at cursor position
        const idx = u.cursor.idx;
        const timestamp = u.data[0][idx];
        const binancePrice = u.data[1][idx];
        const bybitPrice = u.data[2][idx];
        const hyperliquidPrice = u.data[3][idx];
        const krakenPrice = u.data[4][idx];

        // Format timestamp with milliseconds
        if (timestamp) {
            const date = new Date(timestamp * 1000);
            const timeString = date.toLocaleString();
            const ms = Math.floor((timestamp * 1000) % 1000);
            legendTime.textContent = `${timeString}.${ms.toString().padStart(3, '0')}`;
        } else {
            legendTime.textContent = '--';
        }

        // Update values
        binanceValue.textContent = binancePrice ? `$${binancePrice.toFixed(2)}` : '--';
        bybitValue.textContent = bybitPrice ? `$${bybitPrice.toFixed(2)}` : '--';
        hyperliquidValue.textContent = hyperliquidPrice ? `$${hyperliquidPrice.toFixed(2)}` : '--';
        krakenValue.textContent = krakenPrice ? `$${krakenPrice.toFixed(2)}` : '--';
    }



    startFPSCounter() {
        const fpsCounter = document.getElementById('fpsCounter');
        
        setInterval(() => {
            fpsCounter.textContent = `${this.fps} FPS`;
        }, 1000);
    }

    startRenderLoop() {
        const animate = (currentTime) => {
            this.frameCount++;
            
            if (currentTime - this.lastTime >= 1000) {
                this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
                this.frameCount = 0;
                this.lastTime = currentTime;
            }
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.scanner = new FuturesArbitrageScanner();
    console.log('Futures Arbitrage Scanner initialized');
});