package exchanges

import (
	"log"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

type KrakenFuturesTrade struct {
	Feed   string      `json:"feed"`
	Trades []struct {
		ProductID string  `json:"product_id"`
		Price     float64 `json:"price"`
		Quantity  float64 `json:"qty"`
		Side      string  `json:"side"`
		Timestamp float64 `json:"time"`
		UID       string  `json:"uid"`
	} `json:"trades"`
}

func ConnectKrakenFutures(symbols []string, priceChan chan<- PriceData, tradeChan chan<- TradeData) {
	wsURL := "wss://futures.kraken.com/ws/v1"

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Kraken connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Kraken futures WebSocket")

		// Subscribe to trades for each symbol
		for _, symbol := range symbols {
			// Convert BTCUSDT to PI_XBTUSD for Kraken
			krakenSymbol := convertToKrakenSymbol(symbol)

			subscribeMsg := map[string]interface{}{
				"event": "subscribe",
				"feed":  "trade",
				"product_ids": []string{krakenSymbol},
			}

			err = conn.WriteJSON(subscribeMsg)
			if err != nil {
				log.Printf("Kraken subscription error for %s: %v", krakenSymbol, err)
				continue
			}
		}

		for {
			var message KrakenFuturesTrade
			err := conn.ReadJSON(&message)
			if err != nil {
				log.Printf("Kraken read error: %v", err)
				conn.Close()
				break
			}

			if message.Feed == "trade" && len(message.Trades) > 0 {
				for _, trade := range message.Trades {
					// Convert symbol back to standard format (PI_XBTUSD -> BTCUSDT)
					symbol := convertFromKrakenSymbol(trade.ProductID)

					// Normalize trade side (Kraken uses "buy" and "sell")
					var side string
					if trade.Side == "buy" {
						side = "buy"
					} else {
						side = "sell"
					}

					// Convert timestamp from float64 to int64 milliseconds
					timestamp := int64(trade.Timestamp * 1000)

					priceData := PriceData{
						Symbol:    symbol,
						Exchange:  "kraken_futures",
						Price:     trade.Price,
						Timestamp: timestamp,
					}

					tradeData := TradeData{
						Symbol:    symbol,
						Exchange:  "kraken_futures",
						Price:     trade.Price,
						Quantity:  strconv.FormatFloat(trade.Quantity, 'f', -1, 64),
						Side:      side,
						Timestamp: timestamp,
					}

					priceChan <- priceData
					tradeChan <- tradeData
				}
			}
		}

		time.Sleep(2 * time.Second)
	}
}

func convertToKrakenSymbol(symbol string) string {
	// Convert BTCUSDT to PI_XBTUSD (Kraken's format)
	switch symbol {
	case "BTCUSDT":
		return "PI_XBTUSD"
	case "ETHUSDT":
		return "PI_ETHUSD"
	default:
		return symbol
	}
}

func convertFromKrakenSymbol(symbol string) string {
	// Convert PI_XBTUSD to BTCUSDT (standard format)
	switch symbol {
	case "PI_XBTUSD":
		return "BTCUSDT"
	case "PI_ETHUSD":
		return "ETHUSDT"
	default:
		return symbol
	}
}