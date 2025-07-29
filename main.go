package main

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type BinanceFuturesTrade struct {
	EventType string `json:"e"`
	EventTime int64  `json:"E"`
	Symbol    string `json:"s"`
	TradeID   int64  `json:"a"`
	Price     string `json:"p"`
	Quantity  string `json:"q"`
	TradeTime int64  `json:"T"`
	IsMaker   bool   `json:"m"`
}

type BybitFuturesTrade struct {
	Topic string `json:"topic"`
	Type  string `json:"type"`
	Data  []struct {
		Symbol    string `json:"s"`
		Price     string `json:"p"`
		Size      string `json:"v"`
		Side      string `json:"S"`
		Timestamp int64  `json:"T"`
		TradeID   string `json:"i"`
	} `json:"data"`
}

type PriceData struct {
	Symbol    string
	Exchange  string
	Price     float64
	Timestamp int64
}

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
	prices       map[string]map[string]float64
	pricesMutex  sync.RWMutex
	wsClients    map[*websocket.Conn]bool
	clientsMutex sync.RWMutex
	upgrader     websocket.Upgrader
}

func NewFuturesScanner() *FuturesScanner {
	return &FuturesScanner{
		prices:    make(map[string]map[string]float64),
		wsClients: make(map[*websocket.Conn]bool),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (s *FuturesScanner) connectBinanceFutures(symbols []string) {
	streamNames := make([]string, len(symbols))
	for i, symbol := range symbols {
		streamNames[i] = strings.ToLower(symbol) + "@aggTrade"
	}
	streamParam := strings.Join(streamNames, "/")

	wsURL := fmt.Sprintf("wss://fstream.binance.com/stream?streams=%s", streamParam)

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Binance connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Binance futures WebSocket")

		for {
			var message struct {
				Stream string              `json:"stream"`
				Data   BinanceFuturesTrade `json:"data"`
			}

			err := conn.ReadJSON(&message)
			if err != nil {
				log.Printf("Binance read error: %v", err)
				conn.Close()
				break
			}

			price, err := strconv.ParseFloat(message.Data.Price, 64)
			if err != nil {
				continue
			}

			priceData := PriceData{
				Symbol:    message.Data.Symbol,
				Exchange:  "binance_futures",
				Price:     price,
				Timestamp: time.Now().UnixMilli(),
			}

			s.updatePrice(priceData)
		}

		time.Sleep(2 * time.Second)
	}
}

func (s *FuturesScanner) connectBybitFutures(symbols []string) {
	wsURL := "wss://stream.bybit.com/v5/public/linear"

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Bybit connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Bybit futures WebSocket")

		subscribeMsg := map[string]interface{}{
			"op": "subscribe",
			"args": make([]string, len(symbols)),
		}

		for i, symbol := range symbols {
			subscribeMsg["args"].([]string)[i] = fmt.Sprintf("publicTrade.%s", symbol)
		}

		err = conn.WriteJSON(subscribeMsg)
		if err != nil {
			log.Printf("Bybit subscription error: %v", err)
			conn.Close()
			time.Sleep(5 * time.Second)
			continue
		}

		for {
			var message BybitFuturesTrade
			err := conn.ReadJSON(&message)
			if err != nil {
				log.Printf("Bybit read error: %v", err)
				conn.Close()
				break
			}

			if message.Type == "snapshot" || message.Type == "delta" {
				for _, trade := range message.Data {
					price, err := strconv.ParseFloat(trade.Price, 64)
					if err != nil {
						continue
					}

					priceData := PriceData{
						Symbol:    trade.Symbol,
						Exchange:  "bybit_futures",
						Price:     price,
						Timestamp: time.Now().UnixMilli(),
					}

					s.updatePrice(priceData)
				}
			}
		}

		time.Sleep(2 * time.Second)
	}
}

func (s *FuturesScanner) updatePrice(data PriceData) {
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

	if profitPct > 0.05 {
		opportunity := ArbitrageOpportunity{
			Symbol:       symbol,
			BuyExchange:  minExchange,
			SellExchange: maxExchange,
			BuyPrice:     minPrice,
			SellPrice:    maxPrice,
			ProfitPct:    profitPct,
			Timestamp:    time.Now().UnixMilli(),
		}

		log.Printf("ARBITRAGE: %s %.3f%% | Buy %s@%.2f, Sell %s@%.2f",
			symbol, profitPct, minExchange, minPrice, maxExchange, maxPrice)

		s.broadcastOpportunity(opportunity)
	}
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

			s.clientsMutex.RLock()
			for client := range s.wsClients {
				err := client.WriteJSON(message)
				if err != nil {
					log.Printf("WebSocket write error: %v", err)
					client.Close()
					delete(s.wsClients, client)
				}
			}
			s.clientsMutex.RUnlock()
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

	symbols := []string{"BTCUSDT"}

	go scanner.connectBinanceFutures(symbols)
	go scanner.connectBybitFutures(symbols)
	go scanner.broadcastPrices()

	http.HandleFunc("/ws", scanner.handleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("./static/")))

	log.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
