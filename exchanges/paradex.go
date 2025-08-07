package exchanges

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type ParadexWSRequest struct {
	ID      int64  `json:"id"`
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  struct {
		Channel string `json:"channel"`
	} `json:"params"`
}

type ParadexWSResponse struct {
	ID      int64  `json:"id"`
	JSONRPC string `json:"jsonrpc"`
	Result  struct {
		Channel string `json:"channel"`
		Status  string `json:"status"`
	} `json:"result,omitempty"`
}

type ParadexTradeEvent struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  struct {
		Channel string `json:"channel"`
		Data    struct {
			ID        string `json:"id"`
			Market    string `json:"market"`
			Price     string `json:"price"`
			Size      string `json:"size"`
			Side      string `json:"side"`
			CreatedAt int64  `json:"created_at"`
			TradeType string `json:"trade_type"`
		} `json:"data"`
	} `json:"params"`
}

type ParadexBookEvent struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  struct {
		Channel string `json:"channel"`
		Data    struct {
			Market    string     `json:"market"`
			Bids      [][]string `json:"bids"`
			Asks      [][]string `json:"asks"`
			Timestamp int64      `json:"timestamp"`
		} `json:"data"`
	} `json:"params"`
}

func ConnectParadexFutures(symbols []string, priceChan chan<- PriceData, orderbookChan chan<- OrderbookData, tradeChan chan<- TradeData) {
	wsURL := "wss://ws.api.prod.paradex.trade/v1"

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Paradex connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Paradex futures WebSocket")

		// Subscribe to trades and book for each symbol
		for _, symbol := range symbols {
			// Convert symbol format (BTCUSDT -> BTC-USD-PERP)
			paradexSymbol := convertToParadexSymbol(symbol)
			if paradexSymbol == "" {
				continue
			}

			// Subscribe to trades
			tradeSubscribeReq := ParadexWSRequest{
				ID:      time.Now().UnixMicro(),
				JSONRPC: "2.0",
				Method:  "subscribe",
				Params: struct {
					Channel string `json:"channel"`
				}{
					Channel: fmt.Sprintf("trades.%s", paradexSymbol),
				},
			}

			if err := conn.WriteJSON(tradeSubscribeReq); err != nil {
				log.Printf("Paradex trade subscription error for %s: %v", paradexSymbol, err)
				continue
			}

			// Subscribe to orderbook
			bookSubscribeReq := ParadexWSRequest{
				ID:      time.Now().UnixMicro() + 1,
				JSONRPC: "2.0",
				Method:  "subscribe",
				Params: struct {
					Channel string `json:"channel"`
				}{
					Channel: fmt.Sprintf("book.%s", paradexSymbol),
				},
			}

			if err := conn.WriteJSON(bookSubscribeReq); err != nil {
				log.Printf("Paradex book subscription error for %s: %v", paradexSymbol, err)
				continue
			}
		}

		// Read messages
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Paradex read error: %v", err)
				break
			}

			// Try to parse as subscription response first
			var subResponse ParadexWSResponse
			if err := json.Unmarshal(message, &subResponse); err == nil && subResponse.Result.Status == "subscribed" {
				continue
			}

			// Try to parse as trade event
			var tradeEvent ParadexTradeEvent
			if err := json.Unmarshal(message, &tradeEvent); err == nil &&
			   tradeEvent.Method == "subscription" && strings.HasPrefix(tradeEvent.Params.Channel, "trades.") {
				// Extract symbol from channel (trades.BTC-USD-PERP -> BTCUSDT)
				channelParts := strings.Split(tradeEvent.Params.Channel, ".")
				if len(channelParts) != 2 {
					continue
				}

				paradexSymbol := channelParts[1]
				symbol := convertFromParadexSymbol(paradexSymbol)
				if symbol == "" {
					continue
				}

				trade := tradeEvent.Params.Data

				price, err := strconv.ParseFloat(trade.Price, 64)
				if err != nil {
					continue
				}

				// Convert timestamp from milliseconds to time
				timestamp := time.UnixMilli(trade.CreatedAt)

				// Normalize side to lowercase
				side := strings.ToLower(trade.Side)

				// Send trade data
				tradeChan <- TradeData{
					Symbol:    symbol,
					Exchange:  "paradex_futures",
					Price:     price,
					Quantity:  trade.Size,
					Side:      side,
					Timestamp: timestamp.UnixMilli(),
				}
				continue
			}

			// Try to parse as book event
			var bookEvent ParadexBookEvent
			if err := json.Unmarshal(message, &bookEvent); err == nil &&
			   bookEvent.Method == "subscription" && strings.HasPrefix(bookEvent.Params.Channel, "book.") {
				// Extract symbol from channel (book.BTC-USD-PERP -> BTCUSDT)
				channelParts := strings.Split(bookEvent.Params.Channel, ".")
				if len(channelParts) != 2 {
					continue
				}

				paradexSymbol := channelParts[1]
				symbol := convertFromParadexSymbol(paradexSymbol)
				if symbol == "" {
					continue
				}

				book := bookEvent.Params.Data

				if len(book.Bids) == 0 || len(book.Asks) == 0 {
					continue
				}

				// Parse best bid and ask
				bestBid, err1 := strconv.ParseFloat(book.Bids[0][0], 64)
				bestAsk, err2 := strconv.ParseFloat(book.Asks[0][0], 64)
				if err1 != nil || err2 != nil {
					continue
				}

				// Send orderbook data
				orderbookChan <- OrderbookData{
					Symbol:    symbol,
					Exchange:  "paradex_futures",
					BestBid:   bestBid,
					BestAsk:   bestAsk,
					Timestamp: book.Timestamp,
				}
			}
		}

		conn.Close()
		log.Printf("Paradex connection closed, reconnecting in 5 seconds...")
		time.Sleep(5 * time.Second)
	}
}

// Convert standard symbol format to Paradex format
// BTCUSDT -> BTC-USD-PERP
// ETHUSDT -> ETH-USD-PERP
func convertToParadexSymbol(symbol string) string {
	symbol = strings.ToUpper(symbol)

	// Map of supported symbols
	symbolMap := map[string]string{
		"BTCUSDT": "BTC-USD-PERP",
		"ETHUSDT": "ETH-USD-PERP",
		"XRPUSDT": "XRP-USD-PERP",
		"SOLUSDT": "SOL-USD-PERP",
	}

	if paradexSymbol, exists := symbolMap[symbol]; exists {
		return paradexSymbol
	}

	return ""
}

// Convert Paradex symbol format back to standard format
// BTC-USD-PERP -> BTCUSDT
func convertFromParadexSymbol(paradexSymbol string) string {
	// Map from Paradex format back to standard
	symbolMap := map[string]string{
		"BTC-USD-PERP": "BTCUSDT",
		"ETH-USD-PERP": "ETHUSDT",
		"XRP-USD-PERP": "XRPUSDT",
		"SOL-USD-PERP": "SOLUSDT",
	}

	if symbol, exists := symbolMap[paradexSymbol]; exists {
		return symbol
	}

	return ""
}
