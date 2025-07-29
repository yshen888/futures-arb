package exchanges

import (
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

type HyperliquidTrade struct {
	Channel string          `json:"channel"`
	Data    json.RawMessage `json:"data"`
}

type HyperliquidTradeData struct {
	Coin      string  `json:"coin"`
	Price     string  `json:"px"`
	Size      string  `json:"sz"`
	Side      string  `json:"side"`
	Timestamp int64   `json:"time"`
}

func ConnectHyperliquidFutures(symbols []string, priceChan chan<- PriceData) {
	wsURL := "wss://api.hyperliquid.xyz/ws"

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Hyperliquid connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Hyperliquid futures WebSocket")

		// Subscribe to trades for each symbol
		for _, symbol := range symbols {
			// Convert BTCUSDT to BTC for Hyperliquid
			coin := symbol[:3] // Extract first 3 characters (BTC from BTCUSDT)

			subscribeMsg := map[string]interface{}{
				"method": "subscribe",
				"subscription": map[string]interface{}{
					"type": "trades",
					"coin": coin,
				},
			}

			err = conn.WriteJSON(subscribeMsg)
			if err != nil {
				log.Printf("Hyperliquid subscription error for %s: %v", coin, err)
				continue
			}
		}

		for {
			var message HyperliquidTrade
			err := conn.ReadJSON(&message)
			if err != nil {
				log.Printf("Hyperliquid read error: %v", err)
				conn.Close()
				break
			}

			if message.Channel == "trades" && len(message.Data) > 0 {
				// Handle both array and single object formats
				var trades []HyperliquidTradeData
				
				// Try to unmarshal as array first
				if err := json.Unmarshal(message.Data, &trades); err != nil {
					// If that fails, try as single object
					var singleTrade HyperliquidTradeData
					if err := json.Unmarshal(message.Data, &singleTrade); err != nil {
						log.Printf("Hyperliquid data parse error: %v", err)
						continue
					}
					trades = []HyperliquidTradeData{singleTrade}
				}

				for _, trade := range trades {
					// Parse price from string
					price, err := strconv.ParseFloat(trade.Price, 64)
					if err != nil {
						continue
					}

					// Convert coin back to symbol format (BTC -> BTCUSDT)
					symbol := trade.Coin + "USDT"

					priceData := PriceData{
						Symbol:    symbol,
						Exchange:  "hyperliquid_futures",
						Price:     price,
						Timestamp: trade.Timestamp,
					}

					priceChan <- priceData
				}
			}
		}

		time.Sleep(2 * time.Second)
	}
}
