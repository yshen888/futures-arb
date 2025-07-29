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

func ConnectBinanceFutures(symbols []string, priceChan chan<- PriceData) {
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
				Timestamp: message.Data.TradeTime,
			}

			priceChan <- priceData
		}

		time.Sleep(2 * time.Second)
	}
}
