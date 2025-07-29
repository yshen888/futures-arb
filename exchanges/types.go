package exchanges

type PriceData struct {
	Symbol    string
	Exchange  string
	Price     float64
	Timestamp int64
}