package exchanges

import (
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

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

func ConnectBybitFutures(symbols []string, priceChan chan<- PriceData, tradeChan chan<- TradeData) {
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
			"op":   "subscribe",
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

					// Normalize trade side (Bybit uses "Buy" and "Sell")
					var side string
					if trade.Side == "Buy" {
						side = "buy"
					} else {
						side = "sell"
					}

					priceData := PriceData{
						Symbol:    trade.Symbol,
						Exchange:  "bybit_futures",
						Price:     price,
						Timestamp: trade.Timestamp,
					}

					tradeData := TradeData{
						Symbol:    trade.Symbol,
						Exchange:  "bybit_futures",
						Price:     price,
						Quantity:  trade.Size,
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
