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

type GateFuturesTrade struct {
	Size           int64  `json:"size"`
	ID             int64  `json:"id"`
	CreateTime     int64  `json:"create_time"`
	CreateTimeMs   int64  `json:"create_time_ms"`
	Price          string `json:"price"`
	Contract       string `json:"contract"`
	IsInternal     bool   `json:"is_internal,omitempty"`
}

type GateWebSocketMessage struct {
	Time    int64  `json:"time"`
	Channel string `json:"channel"`
	Event   string `json:"event"`
	Result  struct {
		Status string `json:"status"`
	} `json:"result,omitempty"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type GateTradeMessage struct {
	Time    int64               `json:"time"`
	Channel string              `json:"channel"`
	Event   string              `json:"event"`
	Result  []GateFuturesTrade  `json:"result"`
}

type GateFuturesOrderbook struct {
	Contract       string     `json:"contract"`
	Ask            [][]string `json:"asks"`
	Bid            [][]string `json:"bids"`
	UpdateTime     int64      `json:"update_time"`
	UpdateTimeMs   int64      `json:"update_time_ms"`
	UpdateID       int64      `json:"update_id"`
}

type GateOrderbookMessage struct {
	Time    int64                   `json:"time"`
	Channel string                  `json:"channel"`
	Event   string                  `json:"event"`
	Result  []GateFuturesOrderbook `json:"result"`
}

type GateSubscribeMessage struct {
	Time    int64    `json:"time"`
	Channel string   `json:"channel"`
	Event   string   `json:"event"`
	Payload []string `json:"payload"`
}

func ConnectGateFutures(symbols []string, priceChan chan<- PriceData, orderbookChan chan<- OrderbookData, tradeChan chan<- TradeData) {
	wsURL := "wss://fx-ws.gateio.ws/v4/ws/usdt"

	for {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("Gate.io connection error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Gate.io futures WebSocket")

		// Convert symbols to Gate.io format
		gateSymbols := make([]string, len(symbols))
		for i, symbol := range symbols {
			gateSymbols[i] = convertToGateSymbol(symbol)
		}
		
		// Subscribe to trades for all symbols in one message
		tradeSubscribeMsg := GateSubscribeMessage{
			Time:    time.Now().Unix(),
			Channel: "futures.trades",
			Event:   "subscribe",
			Payload: gateSymbols,
		}

		err = conn.WriteJSON(tradeSubscribeMsg)
		if err != nil {
			log.Printf("Gate.io trade subscription error: %v", err)
			conn.Close()
			time.Sleep(5 * time.Second)
			continue
		}

		// Subscribe to orderbook for all symbols in one message
		orderbookSubscribeMsg := GateSubscribeMessage{
			Time:    time.Now().Unix(),
			Channel: "futures.order_book",
			Event:   "subscribe",
			Payload: gateSymbols,
		}

		err = conn.WriteJSON(orderbookSubscribeMsg)
		if err != nil {
			log.Printf("Gate.io orderbook subscription error: %v", err)
			conn.Close()
			time.Sleep(5 * time.Second)
			continue
		}

		if err != nil {
			continue
		}

		for {
			var message json.RawMessage
			err := conn.ReadJSON(&message)
			if err != nil {
				log.Printf("Gate.io read error: %v", err)
				conn.Close()
				break
			}

			// First, try to parse as a general WebSocket message to check for errors
			var wsMsg GateWebSocketMessage
			if err := json.Unmarshal(message, &wsMsg); err == nil {
				if wsMsg.Error != nil {
					log.Printf("Gate.io WebSocket error: %d - %s", wsMsg.Error.Code, wsMsg.Error.Message)
					continue
				}
				
				// Skip subscription confirmation messages
				if wsMsg.Event == "subscribe" {
					log.Printf("Gate.io subscription confirmed for channel: %s", wsMsg.Channel)
					continue
				}
			}

			// Try to parse as trade message
			var tradeMsg GateTradeMessage
			if err := json.Unmarshal(message, &tradeMsg); err == nil &&
			   tradeMsg.Channel == "futures.trades" &&
			   tradeMsg.Event == "update" &&
			   len(tradeMsg.Result) > 0 {
				
				for _, trade := range tradeMsg.Result {
					price, err := strconv.ParseFloat(trade.Price, 64)
					if err != nil {
						continue
					}

					// Convert Gate.io symbol back to standard format
					standardSymbol := convertFromGateSymbol(trade.Contract)

					// Use create_time_ms if available, otherwise create_time * 1000
					var timestamp int64
					if trade.CreateTimeMs > 0 {
						timestamp = trade.CreateTimeMs
					} else if trade.CreateTime > 0 {
						timestamp = trade.CreateTime * 1000
					} else {
						timestamp = time.Now().UnixMilli()
					}

					// Determine side from size (positive = buy, negative = sell)
					var side string
					var quantity string
					if trade.Size > 0 {
						side = "buy"
						quantity = fmt.Sprintf("%d", trade.Size)
					} else {
						side = "sell"
						quantity = fmt.Sprintf("%d", -trade.Size) // Make quantity positive
					}

					tradeData := TradeData{
						Symbol:    standardSymbol,
						Exchange:  "gate_futures",
						Price:     price,
						Quantity:  quantity,
						Side:      side,
						Timestamp: timestamp,
					}

					tradeChan <- tradeData
				}
				continue
			}

			// Try to parse as orderbook message
			var orderbookMsg GateOrderbookMessage
			if err := json.Unmarshal(message, &orderbookMsg); err == nil &&
			   orderbookMsg.Channel == "futures.order_book" &&
			   orderbookMsg.Event == "update" &&
			   len(orderbookMsg.Result) > 0 {
				
				for _, book := range orderbookMsg.Result {
					if len(book.Bid) == 0 || len(book.Ask) == 0 {
						continue
					}

					// Parse best bid and ask
					bestBid, err1 := strconv.ParseFloat(book.Bid[0][0], 64)
					bestAsk, err2 := strconv.ParseFloat(book.Ask[0][0], 64)
					if err1 != nil || err2 != nil {
						continue
					}

					// Convert Gate.io symbol back to standard format
					standardSymbol := convertFromGateSymbol(book.Contract)

					// Use update_time_ms if available, otherwise update_time * 1000
					var timestamp int64
					if book.UpdateTimeMs > 0 {
						timestamp = book.UpdateTimeMs
					} else if book.UpdateTime > 0 {
						timestamp = book.UpdateTime * 1000
					} else {
						timestamp = time.Now().UnixMilli()
					}

					orderbookData := OrderbookData{
						Symbol:    standardSymbol,
						Exchange:  "gate_futures",
						BestBid:   bestBid,
						BestAsk:   bestAsk,
						Timestamp: timestamp,
					}

					orderbookChan <- orderbookData
				}
			}
		}

		time.Sleep(2 * time.Second)
	}
}

// convertToGateSymbol converts standard symbol format to Gate.io format
// BTCUSDT -> BTC_USDT (for USDT perpetual futures)
func convertToGateSymbol(symbol string) string {
	// Handle common symbols for USDT perpetual futures
	switch symbol {
	case "BTCUSDT":
		return "BTC_USDT"
	case "ETHUSDT":
		return "ETH_USDT"
	case "ADAUSDT":
		return "ADA_USDT"
	case "SOLUSDT":
		return "SOL_USDT"
	case "DOTUSDT":
		return "DOT_USDT"
	case "LINKUSDT":
		return "LINK_USDT"
	case "AVAXUSDT":
		return "AVAX_USDT"
	case "MATICUSDT":
		return "MATIC_USDT"
	case "UNIUSDT":
		return "UNI_USDT"
	case "LTCUSDT":
		return "LTC_USDT"
	case "BCHUSDT":
		return "BCH_USDT"
	case "XRPUSDT":
		return "XRP_USDT"
	default:
		// Generic conversion for USDT perpetual futures
		if strings.HasSuffix(symbol, "USDT") {
			base := strings.TrimSuffix(symbol, "USDT")
			return fmt.Sprintf("%s_USDT", base)
		}
		// For other quote currencies, insert underscore before the last part
		if len(symbol) >= 6 {
			// Assume last 3-4 characters are quote currency
			if strings.HasSuffix(symbol, "USDC") {
				base := strings.TrimSuffix(symbol, "USDC")
				return fmt.Sprintf("%s_USDC", base)
			}
			if strings.HasSuffix(symbol, "USD") {
				base := strings.TrimSuffix(symbol, "USD")
				return fmt.Sprintf("%s_USD", base)
			}
		}
		return symbol
	}
}

// convertFromGateSymbol converts Gate.io symbol format back to standard format
// BTC_USDT -> BTCUSDT
func convertFromGateSymbol(gateSymbol string) string {
	// Remove underscore and convert to standard format
	parts := strings.Split(gateSymbol, "_")
	if len(parts) == 2 {
		return parts[0] + parts[1]
	}
	return gateSymbol
}