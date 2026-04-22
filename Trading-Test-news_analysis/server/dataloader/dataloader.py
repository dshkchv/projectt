from flask import Flask, request, jsonify
import requests
import pandas as pd
from datetime import datetime, timedelta
import logging
from typing import Dict, Optional, List
import json
import time
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

class StockDataLoaderService:
    def __init__(self):
        self.sources = {
            'moex': self._fetch_from_moex,
            'yahoo': self._fetch_from_yahoo,
        }
        
    def get_stock_data(self, ticker: str, start_date: str, end_date: str, 
                      interval: str = '1d', source: str = 'moex') -> Dict:
        """
        Получение данных о торгах
        
        Args:
            ticker: Тикер акции (например, 'SBER', 'GAZP')
            start_date: Начальная дата в формате YYYY-MM-DD
            end_date: Конечная дата в формате YYYY-MM-DD
            interval: Интервал ('1d', '1h', '1min', '10min')
            source: Источник данных ('moex', 'yahoo')
        """
        try:
            if source not in self.sources:
                return {'error': f'Source {source} is not supported'}
            
            # Проверяем поддержку интервалов для источника
            supported_intervals = self._get_supported_intervals(source)
            if interval not in supported_intervals:
                return {'error': f'Interval {interval} is not supported {source}'}
            
            return self.sources[source](ticker, start_date, end_date, interval)
            
        except Exception as e:
            logging.error(f"ERROR downloading data: {str(e)}")
            return {'error': str(e)}
    
    def _get_supported_intervals(self, source: str) -> List[str]:
        """Возвращает поддерживаемые интервалы для источника"""
        intervals = {
            'moex': ['1d', '1h', '10min', '1min'],
            'yahoo': ['1d', '1h', '1min', '5min', '15min'],
        }
        return intervals.get(source, ['1d'])
    
    def _fetch_from_moex(self, ticker: str, start_date: str, end_date: str, interval: str) -> Dict:
        """Получение данных с Московской Биржи с минутными интервалами"""
        try:
            # Маппинг интервалов для MOEX API
            interval_map = {
                '1d': 24,
                '1h': 60,
                '10min': 10,
                '1min': 1
            }
            
            if interval not in interval_map:
                return {'error': f'Interval {interval} doesn\'t supported by MOEX'}
            
            # Получаем минутные данные
            url = f"https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/{ticker}/candles.json"
            
            params = {
                'from': start_date,
                'till': end_date,
                'interval': interval_map[interval],
                'start': 0
            }
            
            all_data = []
            while True:
                response = requests.get(url, params=params)
                data = response.json()
                
                if 'candles' not in data:
                    break
                    
                candles = data['candles']['data']
                
                if not candles:
                    break
                    
                all_data.extend(candles)
                params['start'] += 500
                
                if len(candles) < 500:
                    break
            
            if not all_data:
                return {'error': 'Data not found for requested period'}
            
            # Преобразуем в удобный формат
            columns = data['candles']['columns']
            df = pd.DataFrame(all_data, columns=columns)
            
            result_data = []
            for _, row in df.iterrows():
                result_data.append({
                    'datetime': row['begin'],
                    'open': float(row['open'] or 0),
                    'high': float(row['high'] or 0),
                    'low': float(row['low'] or 0),
                    'close': float(row['close'] or 0),
                    'volume': int(row['volume'] or 0),
                    'value': float(row['value'] or 0)
                })
            
            return {
                'ticker': ticker,
                'source': 'moex',
                'interval': interval,
                'data': result_data,
                'count': len(result_data)
            }
            
        except Exception as e:
            logging.error(f"ERROR MOEX API: {str(e)}")
            return {'error': f'ERROR getting data from MOEX: {str(e)}'}
    
    def _fetch_from_yahoo(self, ticker: str, start_date: str, end_date: str, interval: str) -> Dict:
        """Получение данных через Yahoo Finance с минутными интервалами"""
        try:
            # Маппинг интервалов для Yahoo Finance
            interval_map = {
                '1d': '1d',
                '1h': '1h',
                '1min': '1m',
                '5min': '5m',
                '15min': '15m'
            }
            
            if interval not in interval_map:
                return {'error': f'Interval {interval} doesn\'t supported by Yahoo Finance'}
            
            yahoo_ticker = f"{ticker}.ME"
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}"
            
            params = {
                'period1': int(datetime.strptime(start_date, '%Y-%m-%d').timestamp()),
                'period2': int(datetime.strptime(end_date, '%Y-%m-%d').timestamp()),
                'interval': interval_map[interval]
            }
            
            response = requests.get(url, params=params)
            data = response.json()
            
            if 'chart' not in data or 'result' not in data['chart']:
                return {'error': 'Data not found in Yahoo Finance'}
            
            result = data['chart']['result'][0]
            timestamps = result['timestamp']
            quotes = result['indicators']['quote'][0]
            
            result_data = []
            for i, timestamp in enumerate(timestamps):
                result_data.append({
                    'datetime': datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S'),
                    'open': quotes['open'][i] or 0,
                    'high': quotes['high'][i] or 0,
                    'low': quotes['low'][i] or 0,
                    'close': quotes['close'][i] or 0,
                    'volume': quotes['volume'][i] or 0
                })
            
            return {
                'ticker': ticker,
                'source': 'yahoo',
                'interval': interval,
                'data': result_data,
                'count': len(result_data)
            }
            
        except Exception as e:
            logging.error(f"ERROR Yahoo Finance: {str(e)}")
            return {'error': f'ERROR getting data from Yahoo Finance: {str(e)}'}
    
    def get_intraday_data(self, ticker: str, date: str = None, source: str = 'moex') -> Dict:
        """Получение внутридневных данных за конкретный день"""
        if date is None:
            date = datetime.now().strftime('%Y-%m-%d')
        
        return self.get_stock_data(ticker, date, date, '1min', source)

# Инициализация сервиса
stock_service = StockDataLoaderService()

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

@app.route('/api/stocks/<ticker>/history', methods=['GET'])
def get_stock_history(ticker: str):
    """Получение исторических данных об акции с различными интервалами"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date', datetime.now().strftime('%Y-%m-%d'))
        interval = request.args.get('interval', '1d')
        source = request.args.get('source', 'moex')
        
        if not start_date:
            # Автоматически определяем период в зависимости от интервала
            if interval == '1min':
                start_date = datetime.now().strftime('%Y-%m-%d')  # Только сегодня
            elif interval in ['5min', '10min', '1h']:
                start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            else:
                start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        result = stock_service.get_stock_data(ticker, start_date, end_date, interval, source)

        chart_data = []
        for i, data in enumerate(result['data']):               
            chart_data.append(
            {
                'time': data['datetime'],
                'value': data['close'] or 0,
            })

        result['chart_data'] = chart_data
        
        if 'error' in result:
            return jsonify(result), 400
            
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"ERROR in API: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stocks/<ticker>/intraday', methods=['GET'])
def get_intraday_data(ticker: str):
    """Получение внутридневных данных за сегодня"""
    try:
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        source = request.args.get('source', 'moex')
        
        result = stock_service.get_intraday_data(ticker, date, source)
        
        if 'error' in result:
            return jsonify(result), 400
            
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"ERROR in API: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/supported-intervals', methods=['GET'])
def get_supported_intervals():
    """Получение информации о поддерживаемых интервалах"""
    source = request.args.get('source', 'moex')
    
    intervals = stock_service._get_supported_intervals(source)
    
    return jsonify({
        'source': source,
        'supported_intervals': intervals,
        'description': {
            '1min': '1 минута',
            '5min': '5 минут',
            '10min': '10 минут',
            '15min': '15 минут',
            '30min': '30 минут',
            '1h': '1 час',
            '1d': '1 день'
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
