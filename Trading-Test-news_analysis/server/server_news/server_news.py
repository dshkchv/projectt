from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import os

app = Flask(__name__)

CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
        "methods": ["GET", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

NEWS_DB_PATH = os.path.join(os.path.dirname(__file__), 'finam_news.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{NEWS_DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class FinamNews(db.Model):
    __tablename__ = 'finam_news'
    
    id = db.Column(db.Integer, primary_key=True)
    pub_id = db.Column(db.String, unique=True, nullable=False)
    pub_time = db.Column(db.String, nullable=True)
    author = db.Column(db.String, nullable=True)
    title = db.Column(db.String, nullable=True)
    description = db.Column(db.String, nullable=True)
    url = db.Column(db.String, nullable=True)
    parsed_at = db.Column(db.DateTime, nullable=True)
    ticker = db.Column(db.String, nullable=True)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

@app.route('/api/news/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    return '', 200

@app.route('/api/news', methods=['GET'])
def get_news():
    """Получение новостей с фильтрацией по тикеру и дате"""
    ticker = request.args.get('ticker')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = FinamNews.query
    
    if ticker:
        query = query.filter(FinamNews.ticker == ticker.upper())
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(FinamNews.pub_time >= start_dt)
        except ValueError:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(FinamNews.pub_time <= end_dt)
        except ValueError:
            pass
    
    news = query.order_by(FinamNews.pub_time).all()
    
    result = []
    for item in news:
        result.append({
            'id': item.id,
            'pub_id': item.pub_id,
            'pub_time': item.pub_time,
            'author': item.author,
            'title': item.title,
            'description': item.description,
            'url': item.url,
            'parsed_at': item.parsed_at.isoformat() if item.parsed_at else None,
            'ticker': item.ticker
        })
    
    return jsonify(result)

@app.route('/api/news/tickers', methods=['GET'])
def get_available_tickers():
    """Получение списка доступных тикеров в новостях"""
    tickers = db.session.query(FinamNews.ticker).distinct().filter(FinamNews.ticker.isnot(None)).all()
    result = [t[0] for t in tickers if t[0]]
    return jsonify(result)

@app.route('/api/news/has-ticker-column', methods=['GET'])
def check_ticker_column():
    """Проверка наличия колонки ticker в таблице"""
    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('finam_news')]
        has_ticker = 'ticker' in columns
        return jsonify({'has_ticker_column': has_ticker})
    except Exception as e:
        return jsonify({'has_ticker_column': False, 'error': str(e)})

@app.route('/api/news/count', methods=['GET'])
def get_news_count():
    """Получение количества новостей"""
    ticker = request.args.get('ticker')
    query = FinamNews.query
    if ticker:
        query = query.filter(FinamNews.ticker == ticker.upper())
    count = query.count()
    return jsonify({'count': count})

# server_news.py - добавить после существующих эндпоинтов

import requests
import json

# Альтернатива - Hugging Face Inference API (бесплатный тир)
HF_API_URL = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2"
HF_API_TOKEN="" # private field

@app.route('/api/news/analyze', methods=['POST'])
def analyze_news():
    """
    Анализ новости с помощью нейросети.
    Ожидает JSON: {
        "news": {
            "title": "...",
            "description": "...",
            ...
        },
        "ticker": "AAPL",
        "current_return": 2.5  # текущая доходность в процентах
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        news_item = data.get('news', {})
        ticker = data.get('ticker', '')
        current_return = data.get('current_return', 0)
        
        # Формируем текст новости
        news_text = f"Title: {news_item.get('title', 'N/A')}\n"
        news_text += f"Description: {news_item.get('description', 'N/A')}\n"
        news_text += f"Published: {news_item.get('pub_time', 'N/A')}"
        
        # Формируем промпт
        prompt = f"""Вы — аналитик финансовых новостей. Проанализируйте следующие новости об акциях {ticker}.

Текущая доходность акций {ticker}: {current_return}%

Новости
{news_text}

Пожалуйста, предоставьте краткий анализ в 1-2 предложениях, оценивая:
1. Потенциальное влияние этой новости на цену акций {ticker} (положительное/отрицательное/нейтральное)
2. Вероятную величину влияния (низкое/среднее/высокое)

Ответ должен быть кратким и профессиональным. Максимум 2 предложения.

Анализ:"""

        if HF_API_TOKEN:
            try:
                from openai import OpenAI

                client = OpenAI(
                    base_url="https://router.huggingface.co/v1",
                    api_key=HF_API_TOKEN,
                )

                completion = client.chat.completions.create(
                    model="huihui-ai/Mistral-Small-24B-Instruct-2501-abliterated:featherless-ai",
                    max_tokens=256,
                    messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                )
                print(f'PROMPT: {prompt}')
                print(f'LLM OUTPUT: {completion.choices[0].message.content}')
                print(f'MODEL: {completion.model}')

                return jsonify({
                        'analysis': completion.choices[0].message.content,
                        'source': completion.model
                    })
            except Exception as e:
                print(f"Hugging Face error: {e}")
        
        # Fallback: простой rule-based анализ (если нейросети недоступны)
        analysis = generate_rule_based_analysis(news_item, ticker, current_return)
        return jsonify({
            'analysis': analysis,
            'source': 'rule-based'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def generate_rule_based_analysis(news_item: dict, ticker: str, current_return: float) -> str:
    """Запасной rule-based анализ если нейросеть недоступна"""
    text = ((news_item.get('title', '') or '') + ' ' + (news_item.get('description', '') or '')).lower()
    
    positive_words = ['рост', 'вырос', 'прибыль', 'growth', 'profit', 'increase', 'gain', 'positive', 'upgrade']
    negative_words = ['падение', 'упал', 'убыток', 'decline', 'loss', 'decrease', 'drop', 'negative', 'downgrade', 'risk']
    
    positive_score = sum(1 for w in positive_words if w in text)
    negative_score = sum(1 for w in negative_words if w in text)
    
    if positive_score > negative_score:
        impact = "positive"
        magnitude = "medium" if positive_score > 2 else "low"
        return f"This news appears to have a {magnitude} {impact} impact on {ticker}. The content suggests potential upward movement based on positive indicators."
    elif negative_score > positive_score:
        impact = "negative"
        magnitude = "medium" if negative_score > 2 else "low"
        return f"This news appears to have a {magnitude} {impact} impact on {ticker}. The content suggests potential downward pressure based on concerning factors."
    else:
        return f"This news appears to have a neutral impact on {ticker}. No strong directional signals are evident from the content."


@app.route('/api/news/analyze', methods=['OPTIONS'])
def options_analyze():
    return '', 200

if __name__ == '__main__':
    print("News server starting on http://localhost:8002")
    print(f"News database path: {NEWS_DB_PATH}")
    app.run(host='0.0.0.0', port=8002, debug=True)