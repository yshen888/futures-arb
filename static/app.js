class FuturesArbitrageScanner {
    constructor() {
        this.currentSymbol = 'BTCUSDT';
        this.exchanges = new Map();
        this.priceHistory = new Map();
        this.arbitrageOpportunities = [];
        this.currentSpreads = new Map();
        this.maxHistoryPoints = 1000;
        this.maxOpportunities = 50;
        this.connectedExchanges = new Set();
        this.currentSort = { field: 'timestamp', direction: 'desc' };
        this.minProfitFilter = 0.05;
        
        this.chart = null;
        this.chartData = [[], [], [], [], [], [], [], [], [], []]; // timestamps, binance_futures, bybit_futures, hyperliquid, kraken_futures, okx, gate, paradex, binance_spot, bybit_spot
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

    // Smart price formatting based on price value
    formatPrice(price) {
        if (price >= 1000) {
            return price.toFixed(2);
        } else if (price >= 100) {
            return price.toFixed(3);
        } else if (price >= 10) {
            return price.toFixed(4);
        } else if (price >= 1) {
            return price.toFixed(5);
        } else {
            return price.toFixed(6);
        }
    }

    init() {
        this.setupEventListeners();
        this.setupChart();
        this.connectWebSocket();
        this.startFPSCounter();
        this.startRenderLoop();
        this.setupOpportunitiesTable();
    }

    setupEventListeners() {
        const symbolSelect = document.getElementById('symbolSelect');
        symbolSelect.addEventListener('change', (e) => {
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

        // Opportunities table event listeners
        const minProfitFilter = document.getElementById('minProfitFilter');
        minProfitFilter.addEventListener('input', (e) => {
            this.minProfitFilter = parseFloat(e.target.value) || 0;
            this.updateOpportunitiesTable();
            this.updateSpreadsMatrix(); // Update matrix highlighting
        });

        const clearButton = document.getElementById('clearOpportunities');
        clearButton.addEventListener('click', () => {
            this.arbitrageOpportunities = [];
            this.updateOpportunitiesTable();
        });
    }

    setupChart() {
        const chartContainer = document.getElementById('chart');
        
        // Initialize with minimal data to show chart immediately
        const now = Date.now() / 1000;
        this.chartData = [
            [now - 60, now],
            [null, null], // binance_futures
            [null, null], // bybit_futures
            [null, null], // hyperliquid_futures
            [null, null], // kraken_futures
            [null, null], // okx_futures
            [null, null], // gate_futures
            [null, null], // paradex_futures
            [null, null], // binance_spot
            [null, null]  // bybit_spot
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
                    values: (_, vals) => vals.map(v => '$' + this.formatPrice(v)),
                }
            ],
            series: [
                {},
                {
                    label: "Binance Futures",
                    stroke: "#f0b90b",
                    width: 2,
                    spanGaps: false,
                    dash: [],
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "Bybit Futures",
                    stroke: "#f7931a",
                    width: 2,
                    spanGaps: false,
                    dash: [],
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "Hyperliquid Futures",
                    stroke: "#97FCE4",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "Kraken Futures",
                    stroke: "#5a5aff",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "OKX Futures",
                    stroke: "#1890ff",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "Gate.io Futures",
                    stroke: "#6c5ce7",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "Paradex Futures",
                    stroke: "#ff6b6b",
                    width: 2,
                    spanGaps: false,
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "Binance Spot",
                    stroke: "#f0b90b",
                    width: 2,
                    spanGaps: false,
                    dash: [5, 5],
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
                },
                {
                    label: "Bybit Spot",
                    stroke: "#f7931a",
                    width: 2,
                    spanGaps: false,
                    dash: [5, 5],
                    value: (_, v) => v == null ? '' : '$' + this.formatPrice(v),
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
        return chartContainer ? Math.max(chartContainer.clientWidth - 40, 400) : 800;
    }

    getChartHeight() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) return 400;
        
        const containerHeight = chartContainer.clientHeight;
        return Math.max(containerHeight - 40, 300);
    }


    connectWebSocket() {
        const wsStatus = document.getElementById('wsStatus');
        const wsStatusText = document.getElementById('wsStatusText');
        
        wsStatus.className = 'status-dot disconnected';
        wsStatusText.textContent = 'Connecting...';

        try {
            this.ws = new WebSocket(`ws://${window.location.host}/ws`);
            
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
        } else if (data.type === 'spreads') {
            this.handleSpreadsUpdate(data);
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
            'okx_futures': '#1890ff',
            'gate_futures': '#6c5ce7',
            'paradex_futures': '#ff6b6b',
            'binance_spot': '#ffb347',
            'bybit_spot': '#dda0dd',
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
                        <span class="exchange-price">$${this.formatPrice(data.price)}</span>
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
        const okxHistory = this.priceHistory.get('okx_futures') || [];
        const gateHistory = this.priceHistory.get('gate_futures') || [];
        const paradexHistory = this.priceHistory.get('paradex_futures') || [];
        const binanceSpotHistory = this.priceHistory.get('binance_spot') || [];
        const bybitSpotHistory = this.priceHistory.get('bybit_spot') || [];
        
        if (binanceHistory.length === 0 && bybitHistory.length === 0 && hyperliquidHistory.length === 0 && krakenHistory.length === 0 && okxHistory.length === 0 && gateHistory.length === 0 && paradexHistory.length === 0 && binanceSpotHistory.length === 0 && bybitSpotHistory.length === 0) return;

        // Create combined timestamp array
        const allTimestamps = new Set();
        binanceHistory.forEach(point => allTimestamps.add(point[0]));
        bybitHistory.forEach(point => allTimestamps.add(point[0]));
        hyperliquidHistory.forEach(point => allTimestamps.add(point[0]));
        krakenHistory.forEach(point => allTimestamps.add(point[0]));
        okxHistory.forEach(point => allTimestamps.add(point[0]));
        gateHistory.forEach(point => allTimestamps.add(point[0]));
        paradexHistory.forEach(point => allTimestamps.add(point[0]));
        binanceSpotHistory.forEach(point => allTimestamps.add(point[0]));
        bybitSpotHistory.forEach(point => allTimestamps.add(point[0]));
        
        const timestamps = Array.from(allTimestamps).sort((a, b) => a - b);
        
        // Create price arrays with forward-filled values for missing data points
        const binancePrices = [];
        const bybitPrices = [];
        const hyperliquidPrices = [];
        const krakenPrices = [];
        const okxPrices = [];
        const gatePrices = [];
        const paradexPrices = [];
        const binanceSpotPrices = [];
        const bybitSpotPrices = [];
        
        const binanceMap = new Map(binanceHistory);
        const bybitMap = new Map(bybitHistory);
        const hyperliquidMap = new Map(hyperliquidHistory);
        const krakenMap = new Map(krakenHistory);
        const okxMap = new Map(okxHistory);
        const gateMap = new Map(gateHistory);
        const paradexMap = new Map(paradexHistory);
        const binanceSpotMap = new Map(binanceSpotHistory);
        const bybitSpotMap = new Map(bybitSpotHistory);
        
        let lastBinancePrice = null;
        let lastBybitPrice = null;
        let lastHyperliquidPrice = null;
        let lastKrakenPrice = null;
        let lastOkxPrice = null;
        let lastGatePrice = null;
        let lastParadexPrice = null;
        let lastBinanceSpotPrice = null;
        let lastBybitSpotPrice = null;
        
        timestamps.forEach(timestamp => {
            const binancePrice = binanceMap.get(timestamp);
            const bybitPrice = bybitMap.get(timestamp);
            const hyperliquidPrice = hyperliquidMap.get(timestamp);
            const krakenPrice = krakenMap.get(timestamp);
            const okxPrice = okxMap.get(timestamp);
            const gatePrice = gateMap.get(timestamp);
            const paradexPrice = paradexMap.get(timestamp);
            const binanceSpotPrice = binanceSpotMap.get(timestamp);
            const bybitSpotPrice = bybitSpotMap.get(timestamp);
            
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
            if (okxPrice !== undefined) {
                lastOkxPrice = okxPrice;
            }
            if (gatePrice !== undefined) {
                lastGatePrice = gatePrice;
            }
            if (paradexPrice !== undefined) {
                lastParadexPrice = paradexPrice;
            }
            if (binanceSpotPrice !== undefined) {
                lastBinanceSpotPrice = binanceSpotPrice;
            }
            if (bybitSpotPrice !== undefined) {
                lastBybitSpotPrice = bybitSpotPrice;
            }

            binancePrices.push(lastBinancePrice);
            bybitPrices.push(lastBybitPrice);
            hyperliquidPrices.push(lastHyperliquidPrice);
            krakenPrices.push(lastKrakenPrice);
            okxPrices.push(lastOkxPrice);
            gatePrices.push(lastGatePrice);
            paradexPrices.push(lastParadexPrice);
            binanceSpotPrices.push(lastBinanceSpotPrice);
            bybitSpotPrices.push(lastBybitSpotPrice);
        });

        this.chartData = [timestamps, binancePrices, bybitPrices, hyperliquidPrices, krakenPrices, okxPrices, gatePrices, paradexPrices, binanceSpotPrices, bybitSpotPrices];
        this.chart.setData(this.chartData);
        this.lastChartUpdate = performance.now();
    }

    setupOpportunitiesTable() {
        // Setup table sorting
        const headers = document.querySelectorAll('.opportunities-table th.sortable');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const field = header.dataset.sort;
                if (this.currentSort.field === field) {
                    this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    this.currentSort.field = field;
                    this.currentSort.direction = 'desc';
                }
                this.updateSortHeaders();
                this.updateOpportunitiesTable();
            });
        });
    }

    updateSortHeaders() {
        const headers = document.querySelectorAll('.opportunities-table th.sortable');
        headers.forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            if (header.dataset.sort === this.currentSort.field) {
                header.classList.add(this.currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    handleArbitrageOpportunity(opportunity) {
        // Add unique ID for tracking
        opportunity.id = Date.now() + Math.random();
        
        this.arbitrageOpportunities.unshift(opportunity);
        
        if (this.arbitrageOpportunities.length > this.maxOpportunities) {
            this.arbitrageOpportunities = this.arbitrageOpportunities.slice(0, this.maxOpportunities);
        }

        this.updateOpportunitiesTable();
    }

    updateOpportunitiesTable() {
        const tbody = document.getElementById('opportunitiesTableBody');
        const stats = document.getElementById('opportunitiesStats');
        
        // Filter opportunities
        const filteredOpportunities = this.arbitrageOpportunities.filter(opp =>
            opp.profit_pct >= this.minProfitFilter
        );

        // Sort opportunities
        const sortedOpportunities = [...filteredOpportunities].sort((a, b) => {
            let aVal = a[this.currentSort.field];
            let bVal = b[this.currentSort.field];
            
            // Handle different data types
            if (this.currentSort.field === 'timestamp') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (this.currentSort.direction === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });

        // Update stats
        stats.textContent = `${filteredOpportunities.length} alerts`;

        if (sortedOpportunities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="opportunities-empty">No alerts match current filters</td></tr>';
            return;
        }

        // Generate table rows
        let html = '';
        sortedOpportunities.forEach((opp) => {
            const isRecent = Date.now() - opp.timestamp < 5000; // Fresh for 5 seconds
            const profitClass = this.getProfitClass(opp.profit_pct);
            const timeStr = this.formatTime(opp.timestamp);
            
            html += `
                <tr class="${isRecent ? 'fresh' : ''}" data-id="${opp.id}">
                    <td class="symbol-cell">${opp.symbol}</td>
                    <td class="profit-cell ${profitClass}">${opp.profit_pct.toFixed(3)}%</td>
                    <td class="exchange-cell">${this.formatExchangeName(opp.buy_exchange)}</td>
                    <td class="price-cell">$${this.formatPrice(opp.buy_price)}</td>
                    <td class="exchange-cell">${this.formatExchangeName(opp.sell_exchange)}</td>
                    <td class="price-cell">$${this.formatPrice(opp.sell_price)}</td>
                    <td class="time-cell">${timeStr}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    }

    getProfitClass(profitPct) {
        if (profitPct >= 0.5) return 'high';
        if (profitPct >= 0.2) return 'medium';
        return 'low';
    }

    formatExchangeName(exchange) {
        return exchange.replace('_futures', '').replace('_', ' ').toUpperCase();
    }

    handleSpreadsUpdate(data) {
        if (data.symbol === this.currentSymbol) {
            this.currentSpreads.set(data.symbol, {
                spreads: data.spreads,
                prices: data.prices,
                timestamp: Date.now()
            });
            this.updateSpreadsMatrix();
        }
    }

    updateSpreadsMatrix() {
        const matrixContainer = document.getElementById('spreadsMatrix');
        const spreadData = this.currentSpreads.get(this.currentSymbol);
        
        if (!spreadData || !spreadData.spreads) {
            matrixContainer.innerHTML = '<div class="loading">Waiting for price data...</div>';
            return;
        }

        // Get all exchanges
        const exchanges = Object.keys(spreadData.spreads);
        
        if (exchanges.length === 0) {
            matrixContainer.innerHTML = '<div class="loading">No exchange data available</div>';
            return;
        }

        // Create matrix HTML
        let html = '';
        
        // Header row
        html += '<div class="spread-header"></div>'; // Empty corner
        exchanges.forEach(sellExchange => {
            const shortName = this.getShortExchangeName(sellExchange);
            html += `<div class="spread-header">${shortName}</div>`;
        });

        // Data rows
        exchanges.forEach(buyExchange => {
            const shortBuyName = this.getShortExchangeName(buyExchange);
            html += `<div class="spread-row-header">${shortBuyName}</div>`;
            
            exchanges.forEach(sellExchange => {
                if (buyExchange === sellExchange) {
                    html += '<div class="spread-cell neutral">-</div>';
                } else {
                    const spread = spreadData.spreads[buyExchange] && spreadData.spreads[buyExchange][sellExchange];
                    if (spread !== undefined) {
                        const spreadClass = this.getSpreadClass(spread);
                        const displaySpread = spread >= 0 ? `+${spread.toFixed(2)}%` : `${spread.toFixed(2)}%`;
                        html += `<div class="spread-cell ${spreadClass}" title="Buy ${this.formatExchangeName(buyExchange)} → Sell ${this.formatExchangeName(sellExchange)}: ${displaySpread}">${displaySpread}</div>`;
                    } else {
                        html += '<div class="spread-cell neutral">-</div>';
                    }
                }
            });
        });

        matrixContainer.innerHTML = html;
    }

    getShortExchangeName(exchange) {
        const names = {
            'binance_futures': 'BIN-F',
            'bybit_futures': 'BYB-F',
            'hyperliquid_futures': 'HYP',
            'kraken_futures': 'KRK-F',
            'okx_futures': 'OKX-F',
            'gate_futures': 'GAT-F',
            'paradex_futures': 'PDX',
            'binance_spot': 'BIN-S',
            'bybit_spot': 'BYB-S'
        };
        return names[exchange] || exchange.substring(0, 3).toUpperCase();
    }

    getSpreadClass(spread) {
        if (spread >= this.minProfitFilter) {
            return 'opportunity';
        } else if (spread > 0) {
            return 'positive';
        } else {
            return 'negative';
        }
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        
        if (diffMs < 60000) { // Less than 1 minute
            return Math.floor(diffMs / 1000) + 's';
        } else if (diffMs < 3600000) { // Less than 1 hour
            return Math.floor(diffMs / 60000) + 'm';
        } else {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    changeSymbol(newSymbol) {
        if (newSymbol === this.currentSymbol) return;
        
        this.currentSymbol = newSymbol;
        this.exchanges.clear();
        this.priceHistory.clear();
        this.arbitrageOpportunities = [];
        
        this.chartData = [[], [], [], [], [], [], [], [], [], []];
        if (this.chart) {
            this.chart.setData(this.chartData);
        }

        this.updateChartTitle();
        this.updateExchangeList();
        this.updateOpportunitiesTable();
        this.currentSpreads.clear();
        this.updateSpreadsMatrix();
        
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
        const okxValue = document.getElementById('okxValue');

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
        const okxPrice = u.data[5][idx];
        const gatePrice = u.data[6][idx];
        const paradexPrice = u.data[7][idx];
        const binanceSpotPrice = u.data[8][idx];
        const bybitSpotPrice = u.data[9][idx];

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
        binanceValue.textContent = binancePrice ? `$${this.formatPrice(binancePrice)}` : '--';
        bybitValue.textContent = bybitPrice ? `$${this.formatPrice(bybitPrice)}` : '--';
        hyperliquidValue.textContent = hyperliquidPrice ? `$${this.formatPrice(hyperliquidPrice)}` : '--';
        
        const krakenValue = document.getElementById('krakenValue');
        if (krakenValue) {
            krakenValue.textContent = krakenPrice ? `$${this.formatPrice(krakenPrice)}` : '--';
        }
        
        okxValue.textContent = okxPrice ? `$${this.formatPrice(okxPrice)}` : '--';
        
        const gateValue = document.getElementById('gateValue');
        if (gateValue) {
            gateValue.textContent = gatePrice ? `$${this.formatPrice(gatePrice)}` : '--';
        }
        
        const paradexValue = document.getElementById('paradexValue');
        if (paradexValue) {
            paradexValue.textContent = paradexPrice ? `$${this.formatPrice(paradexPrice)}` : '--';
        }
        
        const binanceSpotValue = document.getElementById('binanceSpotValue');
        if (binanceSpotValue) {
            binanceSpotValue.textContent = binanceSpotPrice ? `$${this.formatPrice(binanceSpotPrice)}` : '--';
        }
        
        const bybitSpotValue = document.getElementById('bybitSpotValue');
        if (bybitSpotValue) {
            bybitSpotValue.textContent = bybitSpotPrice ? `$${this.formatPrice(bybitSpotPrice)}` : '--';
        }
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