package exchanges

import (
	"fmt"
	"log"
	"strconv"
	"strings"
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

func ConnectBinanceFutures(symbols []string, priceChan chan<- PriceData, tradeChan chan<- TradeData) {
	streamNames := make([]string, len(symbols))
	for i, symbol := range symbols {
		streamNames[i] = strings.ToLower(symbol) + "@aggTrade"
	}
	streamParam := strings.Join(streamNames, "/")

	wsURL := fmt.Sprintf("wss://fstream.binance.com/stream?streams=%s", streamParam)

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Binance futures connection error: %v", err)
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
				log.Printf("Binance futures read error: %v", err)
				conn.Close()
				break
			}

			price, err := strconv.ParseFloat(message.Data.Price, 64)
			if err != nil {
				continue
			}

			// Normalize trade side (isMaker: false = buy aggressor, true = sell aggressor)
			var side string
			if !message.Data.IsMaker {
				side = "buy"
			} else {
				side = "sell"
			}

			priceData := PriceData{
				Symbol:    message.Data.Symbol,
				Exchange:  "binance_futures",
				Price:     price,
				Timestamp: message.Data.TradeTime,
			}

			tradeData := TradeData{
				Symbol:    message.Data.Symbol,
				Exchange:  "binance_futures",
				Price:     price,
				Quantity:  message.Data.Quantity,
				Side:      side,
				Timestamp: message.Data.TradeTime,
			}

			priceChan <- priceData
			tradeChan <- tradeData
		}

		time.Sleep(2 * time.Second)
	}
}

// BinanceSpotTrade represents the structure for Binance spot trade data
type BinanceSpotTrade struct {
	EventType string `json:"e"`
	EventTime int64  `json:"E"`
	Symbol    string `json:"s"`
	TradeID   int64  `json:"a"`
	Price     string `json:"p"`
	Quantity  string `json:"q"`
	TradeTime int64  `json:"T"`
	IsMaker   bool   `json:"m"`
}

// ConnectBinanceSpot connects to Binance spot trading WebSocket API
func ConnectBinanceSpot(symbols []string, priceChan chan<- PriceData, tradeChan chan<- TradeData) {
	streamNames := make([]string, len(symbols))
	for i, symbol := range symbols {
		streamNames[i] = strings.ToLower(symbol) + "@aggTrade"
	}
	streamParam := strings.Join(streamNames, "/")

	wsURL := fmt.Sprintf("wss://stream.binance.com:9443/stream?streams=%s", streamParam)

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Binance spot connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Binance spot WebSocket")

		for {
			var message struct {
				Stream string           `json:"stream"`
				Data   BinanceSpotTrade `json:"data"`
			}

			err := conn.ReadJSON(&message)
			if err != nil {
				log.Printf("Binance spot read error: %v", err)
				conn.Close()
				break
			}

			price, err := strconv.ParseFloat(message.Data.Price, 64)
			if err != nil {
				continue
			}

			// Normalize trade side (isMaker: false = buy aggressor, true = sell aggressor)
			var side string
			if !message.Data.IsMaker {
				side = "buy"
			} else {
				side = "sell"
			}

			priceData := PriceData{
				Symbol:    message.Data.Symbol,
				Exchange:  "binance_spot",
				Price:     price,
				Timestamp: message.Data.TradeTime,
			}

			tradeData := TradeData{
				Symbol:    message.Data.Symbol,
				Exchange:  "binance_spot",
				Price:     price,
				Quantity:  message.Data.Quantity,
				Side:      side,
				Timestamp: message.Data.TradeTime,
			}

			priceChan <- priceData
			tradeChan <- tradeData
		}

		time.Sleep(2 * time.Second)
	}
}
