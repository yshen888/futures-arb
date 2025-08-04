package main

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"futures-arbitrage-scanner/exchanges"

	"github.com/gorilla/websocket"
)

type ArbitrageOpportunity struct {
	Symbol       string  `json:"symbol"`
	BuyExchange  string  `json:"buy_exchange"`
	SellExchange string  `json:"sell_exchange"`
	BuyPrice     float64 `json:"buy_price"`
	SellPrice    float64 `json:"sell_price"`
	ProfitPct    float64 `json:"profit_pct"`
	Timestamp    int64   `json:"timestamp"`
}

type FuturesScanner struct {
	prices           map[string]map[string]float64
	pricesMutex      sync.RWMutex
	wsClients        map[*websocket.Conn]bool
	clientsMutex     sync.RWMutex
	upgrader         websocket.Upgrader
	priceChan        chan exchanges.PriceData
	tradeChan        chan exchanges.TradeData
	lastOpportunity  map[string]time.Time // Track last alert per symbol
	opportunityMutex sync.RWMutex
}

func NewFuturesScanner() *FuturesScanner {
	return &FuturesScanner{
		prices:          make(map[string]map[string]float64),
		wsClients:       make(map[*websocket.Conn]bool),
		priceChan:       make(chan exchanges.PriceData, 1000),
		tradeChan:       make(chan exchanges.TradeData, 1000),
		lastOpportunity: make(map[string]time.Time),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (s *FuturesScanner) processPrices() {
	for priceData := range s.priceChan {
		s.updatePrice(priceData)
	}
}

func (s *FuturesScanner) processTrades() {
	for range s.tradeChan {
		// Discard trade data since we don't need CVD anymore
	}
}


func (s *FuturesScanner) updatePrice(data exchanges.PriceData) {
	s.pricesMutex.Lock()
	if s.prices[data.Symbol] == nil {
		s.prices[data.Symbol] = make(map[string]float64)
	}
	s.prices[data.Symbol][data.Exchange] = data.Price
	s.pricesMutex.Unlock()

	s.checkArbitrage(data.Symbol)
}

func (s *FuturesScanner) checkArbitrage(symbol string) {
	s.pricesMutex.RLock()
	exchangePrices, exists := s.prices[symbol]
	if !exists || len(exchangePrices) < 2 {
		s.pricesMutex.RUnlock()
		return
	}

	var minPrice, maxPrice float64
	var minExchange, maxExchange string
	first := true

	for exchange, price := range exchangePrices {
		if first {
			minPrice = price
			maxPrice = price
			minExchange = exchange
			maxExchange = exchange
			first = false
			continue
		}

		if price < minPrice {
			minPrice = price
			minExchange = exchange
		}
		if price > maxPrice {
			maxPrice = price
			maxExchange = exchange
		}
	}
	s.pricesMutex.RUnlock()

	profitPct := ((maxPrice - minPrice) / minPrice) * 100

	// Only alert if profit is significant (>0.05%) and we haven't alerted recently
	if profitPct > 0.05 {
		opportunityKey := fmt.Sprintf("%s_%s_%s", symbol, minExchange, maxExchange)
		
		s.opportunityMutex.RLock()
		lastAlert, exists := s.lastOpportunity[opportunityKey]
		s.opportunityMutex.RUnlock()
		
		now := time.Now()
		// Only send alert if it's been more than 10 seconds since last alert for this pair
		// This prevents spam while still allowing frequent updates for crypto markets
		if !exists || now.Sub(lastAlert) > 10*time.Second {
			s.opportunityMutex.Lock()
			s.lastOpportunity[opportunityKey] = now
			s.opportunityMutex.Unlock()

			opportunity := ArbitrageOpportunity{
				Symbol:       symbol,
				BuyExchange:  minExchange,
				SellExchange: maxExchange,
				BuyPrice:     minPrice,
				SellPrice:    maxPrice,
				ProfitPct:    profitPct,
				Timestamp:    now.UnixMilli(),
			}

			log.Printf("ARBITRAGE: %s %.3f%% | Buy %s@%.2f, Sell %s@%.2f",
				symbol, profitPct, minExchange, minPrice, maxExchange, maxPrice)

			s.broadcastOpportunity(opportunity)
		}
	}
	
	// Always broadcast current spreads for the spread matrix
	s.broadcastSpreads(symbol, exchangePrices)
}

func (s *FuturesScanner) broadcastOpportunity(opportunity ArbitrageOpportunity) {
	s.clientsMutex.RLock()
	defer s.clientsMutex.RUnlock()

	message := map[string]interface{}{
		"type":        "arbitrage",
		"opportunity": opportunity,
	}

	for client := range s.wsClients {
		err := client.WriteJSON(message)
		if err != nil {
			log.Printf("WebSocket write error: %v", err)
			client.Close()
			delete(s.wsClients, client)
		}
	}
}

func (s *FuturesScanner) broadcastSpreads(symbol string, exchangePrices map[string]float64) {
	s.clientsMutex.RLock()
	defer s.clientsMutex.RUnlock()

	// Calculate all pairwise spreads
	spreads := make(map[string]map[string]float64)
	
	for buyExchange, buyPrice := range exchangePrices {
		spreads[buyExchange] = make(map[string]float64)
		for sellExchange, sellPrice := range exchangePrices {
			if buyExchange != sellExchange {
				spreadPct := ((sellPrice - buyPrice) / buyPrice) * 100
				spreads[buyExchange][sellExchange] = spreadPct
			}
		}
	}

	message := map[string]interface{}{
		"type":    "spreads",
		"symbol":  symbol,
		"spreads": spreads,
		"prices":  exchangePrices,
	}

	for client := range s.wsClients {
		err := client.WriteJSON(message)
		if err != nil {
			log.Printf("WebSocket write error: %v", err)
			client.Close()
			delete(s.wsClients, client)
		}
	}
}


func (s *FuturesScanner) broadcastPrices() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		s.pricesMutex.RLock()
		pricesCopy := make(map[string]map[string]float64)
		for symbol, prices := range s.prices {
			pricesCopy[symbol] = make(map[string]float64)
			for exchange, price := range prices {
				pricesCopy[symbol][exchange] = price
			}
		}
		s.pricesMutex.RUnlock()

		if len(pricesCopy) > 0 {
			message := map[string]interface{}{
				"type":   "prices",
				"prices": pricesCopy,
			}

			s.clientsMutex.Lock()
			for client := range s.wsClients {
				err := client.WriteJSON(message)
				if err != nil {
					log.Printf("WebSocket write error: %v", err)
					client.Close()
					delete(s.wsClients, client)
				}
			}
			s.clientsMutex.Unlock()
		}
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

	log.Printf("WebSocket client connected. Total clients: %d", len(s.wsClients))

	defer func() {
		s.clientsMutex.Lock()
		delete(s.wsClients, conn)
		log.Printf("WebSocket client disconnected. Total clients: %d", len(s.wsClients))
		s.clientsMutex.Unlock()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func main() {
	scanner := NewFuturesScanner()

	symbols := []string{"BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT"}

	// Start processing goroutines
	go scanner.processPrices()
	go scanner.processTrades()

	// Start exchange connections
	go exchanges.ConnectBinanceFutures(symbols, scanner.priceChan, scanner.tradeChan)
	go exchanges.ConnectBybitFutures(symbols, scanner.priceChan, scanner.tradeChan)
	go exchanges.ConnectHyperliquidFutures(symbols, scanner.priceChan, scanner.tradeChan)
	// go exchanges.ConnectKrakenFutures(symbols, scanner.priceChan, scanner.tradeChan) // Disabled for now
	go exchanges.ConnectOKXFutures(symbols, scanner.priceChan, scanner.tradeChan)
	go exchanges.ConnectGateFutures(symbols, scanner.priceChan, scanner.tradeChan)
	go exchanges.ConnectParadexFutures(symbols, scanner.priceChan, scanner.tradeChan)
	
	// Start spot exchange connections
	go exchanges.ConnectBinanceSpot(symbols, scanner.priceChan, scanner.tradeChan)
	go exchanges.ConnectBybitSpot(symbols, scanner.priceChan, scanner.tradeChan)

	go scanner.broadcastPrices()

	http.HandleFunc("/ws", scanner.handleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("./static/")))

	log.Println("Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
