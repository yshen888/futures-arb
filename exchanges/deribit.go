package exchanges

import (
	"log"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

type DeribitMessage struct {
	Method string `json:"method"`
	Params struct {
		Channel string `json:"channel"`
		Data    []struct {
			TradeSeq  int64   `json:"trade_seq"`
			TradeID   string  `json:"trade_id"`
			Timestamp int64   `json:"timestamp"`
			TickDir   int     `json:"tick_direction"`
			Price     float64 `json:"price"`
			Amount    float64 `json:"amount"`
			Direction string  `json:"direction"`
			Symbol    string  `json:"instrument_name"`
		} `json:"data"`
	} `json:"params"`
}

func ConnectDeribitFutures(symbols []string, priceChan chan<- PriceData, tradeChan chan<- TradeData) {
	wsURL := "wss://www.deribit.com/ws/api/v2"

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Deribit connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Deribit futures WebSocket")

		// Subscribe to trades for each symbol
		for _, symbol := range symbols {
			// Convert BTCUSDT to BTC-PERPETUAL for Deribit
			deribitSymbol := convertToDeribitSymbol(symbol)

			subscribeMsg := map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      1,
				"method":  "public/subscribe",
				"params": map[string]interface{}{
					"channels": []string{"trades." + deribitSymbol + ".raw"},
				},
			}

			err = conn.WriteJSON(subscribeMsg)
			if err != nil {
				log.Printf("Deribit subscription error for %s: %v", deribitSymbol, err)
				continue
			}
		}

		for {
			var message DeribitMessage
			err := conn.ReadJSON(&message)
			if err != nil {
				log.Printf("Deribit read error: %v", err)
				conn.Close()
				break
			}

			if message.Method == "subscription" && len(message.Params.Data) > 0 {
				for _, trade := range message.Params.Data {
					// Convert symbol back to standard format (BTC-PERPETUAL -> BTCUSDT)
					symbol := convertFromDeribitSymbol(trade.Symbol)

					// Normalize trade side (Deribit uses "buy" and "sell")
					var side string
					if trade.Direction == "buy" {
						side = "buy"
					} else {
						side = "sell"
					}

					priceData := PriceData{
						Symbol:    symbol,
						Exchange:  "deribit_futures",
						Price:     trade.Price,
						Timestamp: trade.Timestamp,
					}

					tradeData := TradeData{
						Symbol:    symbol,
						Exchange:  "deribit_futures",
						Price:     trade.Price,
						Quantity:  strconv.FormatFloat(trade.Amount, 'f', -1, 64),
						Side:      side,
						Timestamp: trade.Timestamp,
					}

					priceChan <- priceData
					tradeChan <- tradeData
				}
			}
		}

		time.Sleep(2 * time.Second)
	}
}

func convertToDeribitSymbol(symbol string) string {
	// Convert BTCUSDT to BTC-PERPETUAL (Deribit's format)
	switch symbol {
	case "BTCUSDT":
		return "BTC-PERPETUAL"
	case "ETHUSDT":
		return "ETH-PERPETUAL"
	default:
		return symbol
	}
}

func convertFromDeribitSymbol(symbol string) string {
	// Convert BTC-PERPETUAL to BTCUSDT (standard format)
	switch symbol {
	case "BTC-PERPETUAL":
		return "BTCUSDT"
	case "ETH-PERPETUAL":
		return "ETHUSDT"
	default:
		return symbol
	}
}