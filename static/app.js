class FuturesArbitrageScanner {
    constructor() {
        this.currentSymbol = 'BTCUSDT';
        this.exchanges = new Map();
        this.priceHistory = new Map();
        this.arbitrageOpportunities = [];
        this.currentSpreads = new Map();
        this.maxHistoryPoints = 500; // Reduced from 1000
        this.maxOpportunities = 25; // Reduced from 50
        this.connectedExchanges = new Set();
        this.currentSort = { field: 'timestamp', direction: 'desc' };
        this.minProfitFilter = 0.05;
        
        // Exchange visibility settings with localStorage persistence
        this.enabledExchanges = this.loadEnabledExchanges();
        
        this.chart = null;
        this.chartSeries = new Map(); // Map to store series for each exchange
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // Performance optimization: throttling
        this.chartUpdatePending = false;
        this.exchangeUpdatePending = false;
        this.opportunitiesUpdatePending = false;
        this.spreadsUpdatePending = false;
        
        // Realtime tracking
        this.isAtRealtime = true;
        this.lastUserScrollTime = 0;
        
        // WebSocket message batching
        this.messageQueue = [];
        this.processingMessages = false;
        
        this.init();
    }

    // Load enabled exchanges from localStorage
    loadEnabledExchanges() {
        const defaultExchanges = {
            'binance_futures': true,
            'bybit_futures': true,
            'hyperliquid_futures': true,
            'kraken_futures': true,
            'okx_futures': true,
            'gate_futures': true,
            'paradex_futures': true,
            'binance_spot': true,
            'bybit_spot': true
        };
        
        try {
            const stored = localStorage.getItem('enabledExchanges');
            return stored ? { ...defaultExchanges, ...JSON.parse(stored) } : defaultExchanges;
        } catch (error) {
            console.warn('Failed to load enabled exchanges from localStorage:', error);
            return defaultExchanges;
        }
    }
    
    // Save enabled exchanges to localStorage
    saveEnabledExchanges() {
        try {
            localStorage.setItem('enabledExchanges', JSON.stringify(this.enabledExchanges));
        } catch (error) {
            console.warn('Failed to save enabled exchanges to localStorage:', error);
        }
    }
    
    // Toggle exchange visibility (now mainly used by non-UI code)
    toggleExchange(exchange) {
        const oldState = this.enabledExchanges[exchange];
        this.enabledExchanges[exchange] = !this.enabledExchanges[exchange];
        const newState = this.enabledExchanges[exchange];
        console.log(`Toggle ${exchange}: ${oldState} -> ${newState}`);
        
        this.saveEnabledExchanges();
        
        // Update all components immediately
        this.updateExchangeList();
        this.performChartUpdate(); // Force immediate chart update, bypassing throttling
        this.updateSpreadsMatrix();
        this.updateOpportunitiesTable();
    }
    
    // Update exchange item opacity without full HTML recreation
    updateExchangeVisibility() {
        const exchangeItems = document.querySelectorAll('.exchange-item');
        exchangeItems.forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.dataset.exchange) {
                const exchange = checkbox.dataset.exchange;
                const isEnabled = this.isExchangeEnabled(exchange);
                item.style.opacity = isEnabled ? '1' : '0.4';
            }
        });
    }
    
    // Check if exchange is enabled
    isExchangeEnabled(exchange) {
        return this.enabledExchanges[exchange] !== false;
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
        this.setupExchangeCheckboxDelegation();
        this.setupChart();
        this.connectWebSocket();
        this.setupOpportunitiesTable();
    }

    setupEventListeners() {
        const symbolSelect = document.getElementById('symbolSelect');
        symbolSelect.addEventListener('change', (e) => {
            this.changeSymbol(e.target.value.toUpperCase());
        });

        window.addEventListener('resize', () => {
            if (this.chart) {
                this.chart.applyOptions({
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

        // Go to realtime button
        const goToRealtimeBtn = document.getElementById('goToRealtimeBtn');
        goToRealtimeBtn.addEventListener('click', () => {
            if (this.chart) {
                this.chart.timeScale().scrollToRealTime();
                this.isAtRealtime = true;
                this.lastUserScrollTime = 0;
            }
        });
    }
    
    setupExchangeCheckboxDelegation() {
        const exchangeList = document.getElementById('exchangeList');
        
        exchangeList.addEventListener('click', (event) => {
            if (event.target.type === 'checkbox' && event.target.dataset.exchange) {
                const exchange = event.target.dataset.exchange;
                console.log(`Checkbox click event for exchange: ${exchange}`);
                
                // Toggle state immediately without HTML recreation
                this.enabledExchanges[exchange] = !this.enabledExchanges[exchange];
                console.log(`Toggle ${exchange}: -> ${this.enabledExchanges[exchange]}`);
                
                // Update checkbox state immediately
                event.target.checked = this.enabledExchanges[exchange];
                
                // Save and update other components
                this.saveEnabledExchanges();
                this.performChartUpdate();
                this.updateSpreadsMatrix();
                this.updateOpportunitiesTable();
                
                // Update exchange list opacity without full recreation
                this.updateExchangeVisibility();
            }
        });
    }

    setupChart() {
        const chartContainer = document.getElementById('chart');
        
        // Create TradingView chart
        this.chart = LightweightCharts.createChart(chartContainer, {
            width: this.getChartWidth(),
            height: this.getChartHeight(),
            layout: {
                background: { color: '#0f0f0f' },
                textColor: '#e0e0e0',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
                attributionLogo: false
            },
            grid: {
                vertLines: { color: '#222' },
                horzLines: { color: '#222' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#444',
                textColor: '#888',
            },
            timeScale: {
                borderColor: '#444',
                textColor: '#888',
                timeVisible: true,
                secondsVisible: false,
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
        });

        // Define exchange configurations
        const exchangeConfigs = [
            { key: 'binance_futures', label: 'Binance Futures', color: '#f0b90b', lineStyle: LightweightCharts.LineStyle.Solid },
            { key: 'bybit_futures', label: 'Bybit Futures', color: '#f7931a', lineStyle: LightweightCharts.LineStyle.Solid },
            { key: 'hyperliquid_futures', label: 'Hyperliquid Futures', color: '#97FCE4', lineStyle: LightweightCharts.LineStyle.Solid },
            { key: 'kraken_futures', label: 'Kraken Futures', color: '#5a5aff', lineStyle: LightweightCharts.LineStyle.Solid },
            { key: 'okx_futures', label: 'OKX Futures', color: '#1890ff', lineStyle: LightweightCharts.LineStyle.Solid },
            { key: 'gate_futures', label: 'Gate.io Futures', color: '#6c5ce7', lineStyle: LightweightCharts.LineStyle.Solid },
            { key: 'paradex_futures', label: 'Paradex Futures', color: '#ff6b6b', lineStyle: LightweightCharts.LineStyle.Solid },
            { key: 'binance_spot', label: 'Binance Spot', color: '#f0b90b', lineStyle: LightweightCharts.LineStyle.Dashed },
            { key: 'bybit_spot', label: 'Bybit Spot', color: '#f7931a', lineStyle: LightweightCharts.LineStyle.Dashed },
        ];

        // Create line series for each exchange
        exchangeConfigs.forEach(config => {
            const series = this.chart.addLineSeries({
                color: config.color,
                lineWidth: 2,
                lineStyle: config.lineStyle,
                crosshairMarkerVisible: true,
                crosshairMarkerRadius: 4,
                crosshairMarkerBorderColor: config.color,
                crosshairMarkerBackgroundColor: config.color,
                lastValueVisible: true,
                priceLineVisible: false,
                title: config.label,
            });
            
            this.chartSeries.set(config.key, series);
        });


        // Track user interactions to determine if we should auto-scroll
        this.chart.timeScale().subscribeVisibleTimeRangeChange(() => {
            this.lastUserScrollTime = Date.now();
            this.isAtRealtime = false;
            
            // Reset realtime flag after some time of inactivity
            setTimeout(() => {
                if (Date.now() - this.lastUserScrollTime > 5000) {
                    this.isAtRealtime = true;
                }
            }, 5000);
        });

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
                    this.queueMessage(data);
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

    queueMessage(data) {
        this.messageQueue.push(data);
        if (!this.processingMessages) {
            this.processingMessages = true;
            setTimeout(() => this.processMessageQueue(), 50);
        }
    }
    
    processMessageQueue() {
        const messagesToProcess = this.messageQueue.splice(0);
        
        // Group messages by type to batch similar operations
        const priceUpdates = [];
        const arbitrageOpportunities = [];
        const spreadsUpdates = [];
        const otherMessages = [];
        
        messagesToProcess.forEach(data => {
            if (data.type === 'price_update') {
                priceUpdates.push(data);
            } else if (data.type === 'arbitrage') {
                arbitrageOpportunities.push(data);
            } else if (data.type === 'spreads') {
                spreadsUpdates.push(data);
            } else {
                otherMessages.push(data);
            }
        });
        
        // Process price updates in batch
        if (priceUpdates.length > 0) {
            this.handleBatchedPriceUpdates(priceUpdates);
        }
        
        // Process arbitrage opportunities
        arbitrageOpportunities.forEach(data => {
            this.handleArbitrageOpportunity(data.opportunity);
        });
        
        // Process latest spreads update only
        if (spreadsUpdates.length > 0) {
            this.handleSpreadsUpdate(spreadsUpdates[spreadsUpdates.length - 1]);
        }
        
        // Process other messages normally
        otherMessages.forEach(data => {
            this.handleWebSocketMessage(data);
        });
        
        this.processingMessages = false;
        
        // Schedule UI updates
        this.updateExchangeList();
        this.updateChart();
    }
    
    handleBatchedPriceUpdates(priceUpdates) {
        priceUpdates.forEach(data => {
            if (data.symbol === this.currentSymbol) {
                this.updateExchangePrice(data.exchange, data.price);
                this.addPriceToHistory(data.exchange, data.price, data.timestamp);
            }
        });
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
                // UI updates will be handled by processMessageQueue
                break;
            }
        }
    }

    handlePriceUpdate(data) {
        if (data.symbol === this.currentSymbol) {
            this.updateExchangePrice(data.exchange, data.price);
            this.addPriceToHistory(data.exchange, data.price, data.timestamp);
            // UI updates will be handled by processMessageQueue
        }
    }

    addPriceToHistory(exchange, price, timestamp = null) {
        const ts = timestamp ? timestamp / 1000 : Date.now() / 1000;
        
        if (!this.priceHistory.has(exchange)) {
            this.priceHistory.set(exchange, []);
        }

        const history = this.priceHistory.get(exchange);
        const newDataPoint = [ts, price];
        history.push(newDataPoint);

        if (history.length > this.maxHistoryPoints) {
            history.shift();
        }

        // If exchange is enabled, immediately update the chart series with the new data point
        if (this.isExchangeEnabled(exchange)) {
            const series = this.chartSeries.get(exchange);
            if (series) {
                const chartDataPoint = {
                    time: ts,
                    value: price
                };
                series.update(chartDataPoint);
                
                // Auto-scroll to realtime for new price updates if user is at realtime position
                if (this.chart && this.isAtRealtime && Date.now() - this.lastUserScrollTime > 3000) {
                    this.chart.timeScale().scrollToRealTime();
                }
            }
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
    }

    updateExchangeList() {
        if (!this.exchangeUpdatePending) {
            this.exchangeUpdatePending = true;
            setTimeout(() => {
                this.performExchangeListUpdate();
                this.exchangeUpdatePending = false;
            }, 100);
        }
    }
    
    performExchangeListUpdate() {
        const exchangeList = document.getElementById('exchangeList');
        
        if (this.exchanges.size === 0) {
            exchangeList.innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        // Check if we need to recreate HTML (structure changed) or just update prices
        const existingItems = exchangeList.querySelectorAll('.exchange-item');
        const needsRecreation = existingItems.length !== this.exchanges.size;
        
        if (needsRecreation) {
            console.log('Recreating exchange list HTML');
            this.recreateExchangeList();
        } else {
            // Just update prices and visual states without recreating HTML
            this.updateExchangePrices();
        }
    }
    
    recreateExchangeList() {
        const exchangeList = document.getElementById('exchangeList');
        const exchangeColors = {
            'binance_futures': '#f0b90b',
            'bybit_futures': '#f7931a',
            'hyperliquid_futures': '#97FCE4',
            'kraken_futures': '#5a5aff',
            'okx_futures': '#1890ff',
            'gate_futures': '#6c5ce7',
            'paradex_futures': '#ff6b6b',
            'binance_spot': '#ffb347',
            'bybit_spot': '#f7931a',
        };

        let html = '';
        for (const [exchange, data] of this.exchanges.entries()) {
            const changeClass = data.change >= 0 ? 'up' : 'down';
            const changeSymbol = data.change >= 0 ? '↑' : '↓';
            const color = exchangeColors[exchange] || '#888';
            const isEnabled = this.isExchangeEnabled(exchange);
            const opacity = isEnabled ? '1' : '0.4';
            
            html += `
                <div class="exchange-item" data-exchange="${exchange}" style="opacity: ${opacity};">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="checkbox-${exchange}" ${isEnabled ? 'checked' : ''}
                               data-exchange="${exchange}"
                               style="margin-right: 4px; cursor: pointer;">
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
    
    updateExchangePrices() {
        for (const [exchange, data] of this.exchanges.entries()) {
            const exchangeItem = document.querySelector(`[data-exchange="${exchange}"]`);
            if (exchangeItem) {
                const priceElement = exchangeItem.querySelector('.exchange-price');
                const changeElement = exchangeItem.querySelector('.price-change');
                
                if (priceElement) {
                    priceElement.textContent = `$${this.formatPrice(data.price)}`;
                }
                
                if (changeElement) {
                    const changeClass = data.change >= 0 ? 'up' : 'down';
                    const changeSymbol = data.change >= 0 ? '↑' : '↓';
                    changeElement.className = `price-change ${changeClass}`;
                    changeElement.textContent = `${changeSymbol} ${Math.abs(data.changePercent).toFixed(3)}%`;
                }
            }
        }
    }

    updateChart() {
        if (!this.chartUpdatePending) {
            this.chartUpdatePending = true;
            requestAnimationFrame(() => {
                this.performChartUpdate();
                this.chartUpdatePending = false;
            });
        }
    }

    performChartUpdate() {
        if (!this.chart || this.priceHistory.size === 0) return;

        const exchangeNames = ['binance_futures', 'bybit_futures', 'hyperliquid_futures', 'kraken_futures', 'okx_futures', 'gate_futures', 'paradex_futures', 'binance_spot', 'bybit_spot'];
        
        exchangeNames.forEach(exchange => {
            const series = this.chartSeries.get(exchange);
            if (!series) return;

            if (this.isExchangeEnabled(exchange)) {
                const history = this.priceHistory.get(exchange) || [];
                if (history.length > 0) {
                    // Convert data to TradingView format: { time: timestamp, value: price }
                    const seriesData = history.map(([timestamp, price]) => ({
                        time: timestamp,
                        value: price
                    }));
                    
                    series.setData(seriesData);
                } else {
                    // Clear data if no history
                    series.setData([]);
                }
            } else {
                // Clear data for disabled exchanges
                series.setData([]);
            }
        });

        // Only auto-scroll to realtime if user hasn't manually interacted recently
        if (this.isAtRealtime && Date.now() - this.lastUserScrollTime > 3000) {
            this.chart.timeScale().scrollToRealTime();
        }
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
        if (!this.opportunitiesUpdatePending) {
            this.opportunitiesUpdatePending = true;
            setTimeout(() => {
                this.performOpportunitiesTableUpdate();
                this.opportunitiesUpdatePending = false;
            }, 250);
        }
    }
    
    performOpportunitiesTableUpdate() {
        const tbody = document.getElementById('opportunitiesTableBody');
        const stats = document.getElementById('opportunitiesStats');
        
        // Filter opportunities by profit and enabled exchanges
        const filteredOpportunities = this.arbitrageOpportunities.filter(opp =>
            opp.profit_pct >= this.minProfitFilter &&
            this.isExchangeEnabled(opp.buy_exchange) &&
            this.isExchangeEnabled(opp.sell_exchange)
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
        if (!this.spreadsUpdatePending) {
            this.spreadsUpdatePending = true;
            setTimeout(() => {
                this.performSpreadsMatrixUpdate();
                this.spreadsUpdatePending = false;
            }, 300);
        }
    }
    
    performSpreadsMatrixUpdate() {
        const matrixContainer = document.getElementById('spreadsMatrix');
        const spreadData = this.currentSpreads.get(this.currentSymbol);
        
        if (!spreadData || !spreadData.spreads) {
            matrixContainer.innerHTML = '<div class="loading">Waiting for price data...</div>';
            return;
        }

        // Get only enabled exchanges
        const allExchanges = Object.keys(spreadData.spreads);
        const exchanges = allExchanges.filter(exchange => this.isExchangeEnabled(exchange));
        
        if (exchanges.length === 0) {
            matrixContainer.innerHTML = '<div class="loading">No enabled exchanges with data</div>';
            return;
        }

        // Set dynamic grid columns: 1 for row headers + number of exchanges for data
        matrixContainer.style.gridTemplateColumns = `60px repeat(${exchanges.length}, 1fr)`;
        
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
        
        // Clear all series data
        this.chartSeries.forEach(series => {
            series.setData([]);
        });

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


    

}

document.addEventListener('DOMContentLoaded', () => {
    window.scanner = new FuturesArbitrageScanner();
    console.log('Futures Arbitrage Scanner initialized');
});