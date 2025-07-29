package exchanges

type PriceData struct {
	Symbol    string
	Exchange  string
	Price     float64
	Timestamp int64
}

type TradeData struct {
	Symbol    string
	Exchange  string
	Price     float64
	Quantity  string
	Side      string // "buy" or "sell" (normalized)
	Timestamp int64
}

type CVDData struct {
	Symbol    string
	Exchange  string
	CVD       float64
	Timestamp int64
}