package main

import (
	"testing"
	"time"
)

func TestNewFuturesScanner(t *testing.T) {
	scanner := NewFuturesScanner()
	
	if scanner.prices == nil {
		t.Error("Expected prices map to be initialized")
	}
	
	if scanner.wsClients == nil {
		t.Error("Expected wsClients map to be initialized")
	}
}

func TestUpdatePrice(t *testing.T) {
	scanner := NewFuturesScanner()
	
	priceData := PriceData{
		Symbol:    "BTCUSDT",
		Exchange:  "binance",
		Price:     45000.0,
		Timestamp: time.Now().UnixMilli(),
	}
	
	scanner.updatePrice(priceData)
	
	scanner.pricesMutex.RLock()
	price, exists := scanner.prices["BTCUSDT"]["binance"]
	scanner.pricesMutex.RUnlock()
	
	if !exists {
		t.Error("Expected price to be stored")
	}
	
	if price != 45000.0 {
		t.Errorf("Expected price 45000.0, got %f", price)
	}
}

func TestArbitrageDetection(t *testing.T) {
	scanner := NewFuturesScanner()
	
	scanner.updatePrice(PriceData{
		Symbol:   "BTCUSDT",
		Exchange: "binance",
		Price:    45000.0,
	})
	
	scanner.updatePrice(PriceData{
		Symbol:   "BTCUSDT",
		Exchange: "bybit",
		Price:    45100.0,
	})
	
	scanner.pricesMutex.RLock()
	binancePrice := scanner.prices["BTCUSDT"]["binance"]
	bybitPrice := scanner.prices["BTCUSDT"]["bybit"]
	scanner.pricesMutex.RUnlock()
	
	profitPct := ((bybitPrice - binancePrice) / binancePrice) * 100
	
	if profitPct < 0.05 {
		t.Errorf("Expected profit percentage > 0.05, got %f", profitPct)
	}
}