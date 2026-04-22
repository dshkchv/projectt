# ML Model Testing Service

Микросервис для тестирования ML моделей прогнозирования временных рядов с поддержкой кастомных архитектур PyTorch.

- [Обзор](#обзор)
- [Архитектура системы](#архитектура-системы)
- [Быстрый старт](#быстрый-старт)
- [API документация](#api-документация)
- [Подготовка моделей](#подготовка-моделей)
- [Формат данных](#формат-данных)
- [Примеры использования](#примеры-использования)
- [Устранение неполадок](#устранение-неполадок)
- [Разработка](#разработка)

## Обзор

Сервис предоставляет REST API для тестирования ML моделей временных рядов с следующими возможностями:

### ✨ Основные функции
- **Поддержка кастомных архитектур** PyTorch
- **Автоматическая загрузка моделей** различных форматов
- **Расчет метрик качества**: MSE, MAE, RMSE, MAPE, R²
- **Вычисление предсказаний** с временными метками

### 🛠 Поддерживаемые форматы моделей
- State dict (`.pth`) + код архитектуры
- Полная модель PyTorch (`.pth`)
- TorchScript (`.pt`)

## Архитектура системы

```
   App
    │
    └── REST API (Flask)
         │
         ├── Model Loader
         │     ├── Dynamic Import
         │     ├── TorchScript Support  
         │     └── Safety Validation
         │
         ├── Data Processor
         │     ├── Sequence Preparation
         │     ├── Normalization
         │     └── Feature Selection
         │
         ├── Model Tester
         │     ├── Inference Engine
         │     ├── Metrics Calculator
         │     └── Result Formatter
         │
         └── Response Builder
```

## Быстрый старт

### 1. Установка зависимостей

```bash
pip install torch pandas numpy requests flask flask-cors
```

### 2. Запуск сервиса

```bash
python model_tester.py
```

Сервис будет доступен по адресу: `http://localhost:5001`

### 3. Проверка работоспособности

```bash
curl http://localhost:5001/api/health
```

Ожидаемый ответ:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000000",
  "pytorch_version": "2.0.0"
}
```

## API документация

### 🔍 Проверка работоспособности сервиса

**GET** `/api/health`

```bash
curl http://localhost:5001/api/health
```

### 🧪 Тестирование модели

**POST** `/api/models/test`

**Параметры:**
- `model` (file): Файл модели (.pth, .pt)
- `model_code` (file, опционально): Файл с кодом архитектуры модели
- `config` (form): JSON конфигурация тестирования
- `test_data` (form): JSON тестовые данные

**Пример запроса:**
```python
import requests

url = "http://localhost:5001/api/models/test"

files = {
    'model': open('model_weights.pth', 'rb'),
    'model_code': open('model_architecture.py', 'rb')
}

data = {
    'config': json.dumps({
        "model_class_name": "LSTMPredictor",
        "target_feature": "close",
        "features": ["open", "high", "low", "close", "volume"],
        "problem_type": "regression",
        "model_type": "sequential",
        "sequence_length": 10
    }),
    'test_data': json.dumps({
        "dataset": [...]  # массив данных
    })
}

response = requests.post(url, files=files, data=data)
```

### 📊 Получение списка метрик

**GET** `/api/models/supported-metrics`

**Параметры:**
- `problem_type` (query): Тип задачи (`regression` или `classification`)

```bash
curl "http://localhost:5001/api/models/supported-metrics?problem_type=regression"
```

### ✅ Валидация конфигурации

**POST** `/api/models/validate-config`

**Тело запроса:** JSON конфигурация

```python
import requests

config = {
    "target_feature": "close",
    "features": ["open", "high", "low", "close", "volume"]
}

response = requests.post(
    "http://localhost:5001/api/models/validate-config",
    json=config
)
```

## Подготовка моделей

### 1. Обучение и сохранение модели

```python
# train_model.py
import torch
import torch.nn as nn

class MyModel(nn.Module):
    def __init__(self, input_size=5, hidden_size=50, output_size=1):
        super(MyModel, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, batch_first=True)
        self.linear = nn.Linear(hidden_size, output_size)
    
    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        return self.linear(lstm_out[:, -1, :])

# Обучение модели...
model = MyModel()

# Сохранение весов модели
torch.save(model.state_dict(), 'model_weights.pth')

# Сохранение кода архитектуры
with open('model_architecture.py', 'w') as f:
    f.write('''
import torch
import torch.nn as nn

class MyModel(nn.Module):
    def __init__(self, input_size=5, hidden_size=50, output_size=1):
        super(MyModel, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, batch_first=True)
        self.linear = nn.Linear(hidden_size, output_size)
    
    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        return self.linear(lstm_out[:, -1, :])
''')
```

### 2. Рекомендуемые форматы сохранения

| Формат | Преимущества | Недостатки |
|--------|--------------|------------|
| **State Dict** + код | Полный контроль, безопасность | Нужно передавать два файла |
| **TorchScript** | Независимость от кода, производительность | Ограниченная поддержка операций |
| **Полная модель** | Простота использования | Риск несовместимости версий |

## Формат данных

### Структура тестовых данных

```json
{
  "dataset": [
    {
      "datetime": "2024-01-01 10:00:00",
      "open": 100.0,
      "high": 100.8,
      "low": 99.5,
      "close": 100.2,
      "volume": 2500000,
      "value": 250500000.0
    },
    {
      "datetime": "2024-01-01 10:01:00",
      "open": 100.2,
      "high": 100.9,
      "low": 99.8,
      "close": 100.5,
      "volume": 1800000,
      "value": 180900000.0
    }
  ]
}
```

### Требования к данным

1. **Минимальное количество точек**: `sequence_length` для моделей, принимающих последовательность временных меток при предсказании
2. **Обязательные поля**: Все фичи, указанные в конфигурации
3. **Формат времени**: `YYYY-MM-DD HH:MM:SS`
4. **Числовые значения**: Все значения должны быть числами

### Конфигурация тестирования

```json
{
  "model_class_name": "LSTMPredictor",
  "target_feature": "close",
  "features": ["open", "high", "low", "close", "volume"],
  "problem_type": "regression",
  "model_type": "sequential",
  "sequence_length": 10,
  "normalization": "minmax"
}
```

**Параметры конфигурации:**

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `target_feature` | ✅ | Целевая переменная для прогнозирования |
| `features` | ✅ | Список используемых фич |
| `problem_type` | ✅ | Тип задачи (`regression`/`classification`) |
| `model_type` | ❌ | Тип модели (`sequential`/`single_point`) |
| `sequence_length` | ❌ | Длина последовательности |
| `normalization` | ❌ | Тип нормализации (`minmax`/`standard`) |
| `model_class_name` | ❌ | Имя класса модели (для state dict) |

## Пример использования:

#### Полный цикл тестирования LSTM модели

```python
# complete_test_example.py
import requests
import json

def test_lstm_model():
    """Полный пример тестирования LSTM модели"""
    
    # Конфигурация для LSTM
    config = {
        "model_class_name": "LSTMPredictor",
        "target_feature": "close",
        "features": ["open", "high", "low", "close", "volume"],
        "problem_type": "regression",
        "model_type": "sequential",
        "sequence_length": 10,
        "normalization": "minmax"
    }
    
    # Генерация тестовых данных
    test_data = generate_test_data(sequence_length=15)
    
    # Отправка запроса
    url = "http://localhost:5001/api/models/test"
    
    files = {
        'model': open('lstm_model_weights.pth', 'rb'),
        'model_code': open('model_architecture.py', 'rb')
    }
    
    data = {
        'config': json.dumps(config),
        'test_data': json.dumps(test_data)
    }
    
    response = requests.post(url, files=files, data=data)
    result = response.json()
    
    if response.status_code == 200:
        print("✅ Тестирование успешно!")
        print(f"📊 Метрики: {result['metrics']}")
        return result
    else:
        print(f"❌ Ошибка: {result.get('error')}")
        return None

def generate_test_data(sequence_length=15):
    """Генерация тестовых данных"""
    import numpy as np
    from datetime import datetime, timedelta
    
    data = []
    current_time = datetime(2024, 1, 1, 10, 0, 0)
    price = 100.0
    
    # Нужно минимум sequence_length точек
    for i in range(sequence_length + 5):
        change = np.random.normal(0, 0.5)
        volume = np.random.randint(1000000, 5000000)
        
        data.append({
            'datetime': current_time.strftime('%Y-%m-%d %H:%M:%S'),
            'open': float(price),
            'high': float(price + abs(change) + 0.2),
            'low': float(price - abs(change) - 0.2),
            'close': float(price + change),
            'volume': volume,
            'value': float(volume * (price + change))
        })
        
        price += change
        current_time += timedelta(minutes=1)
    
    return {'dataset': data}

if __name__ == '__main__':
    test_lstm_model()
```

## Устранение неполадок

### Частые ошибки и решения

#### ❌ "Model testing failed: too many indices for tensor of dimension 2"

**Причина:** Несоответствие размерностей данных и модели

**Решение:**
```python
# Убедитесь, что конфигурация правильная:
config = {
    "model_type": "sequential",
    "sequence_length": 10,       # должно совпадать с обучением
    # ...
}
```

#### ❌ "Model loading failed"

**Причины:**
- Отсутствует код архитектуры для state dict
- Несовместимость версий PyTorch
- Неправильное имя класса модели

**Решение:**
```python
# Укажите правильное имя класса
config = {
    "model_class_name": "MyModel",
    # ...
}

# И передавайте код архитектуры
files = {
    'model': open('model.pth', 'rb'),
    'model_code': open('model_architecture.py', 'rb')  # обязательно!
}
```

#### ❌ "Недостаточно данных"

**Причина:** Количество тестовых точек меньше `sequence_length`

**Решение:**
```python
# Убедитесь, что данных достаточно:
min_data_points = config.get('sequence_length', 1)
if len(test_data['dataset']) < min_data_points:
    print(f"Нужно минимум {min_data_points} точек!")
```

### Диагностика проблем

1. **Проверьте сервис:**
   ```bash
   curl http://localhost:5001/api/health
   ```

2. **Валидируйте конфигурацию:**
   ```python
   python data_validator.py
   ```

3. **Проверьте модель локально:**
   ```python
   # simple_test.py - тестирование без сервиса
   python simple_model.py
   ```

### Логирование

Сервис пишет логи в консоль. Для детального логирования:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Структура файлов

```
ml-testing-service/
├── model_tester.py    # Основной сервис
├── README.md                       # Эта документация
└── examples/
    ├── model_architecture.py           # Пример архитектуры LSTM
    ├── LSTM_training.ipynb             # Обучение модели
    └── request_examples.ipynb          # Универсальный клиент
```

## Разработка

### Добавление новых метрик

```python
# В model_tester_service_fixed.py
def calculate_metrics(self, predictions, targets, problem_type='regression'):
    metrics = {}
    
    if problem_type == 'regression':
        # Существующие метрики...
        metrics['mse'] = ...
        metrics['mae'] = ...
        
        # Новая метрика
        metrics['custom_metric'] = self._calculate_custom_metric(predictions, targets)
    
    return metrics
```

### Расширение поддержки моделей

Для добавления поддержки новых типов моделей:

1. Добавьте новый метод загрузки в `load_custom_model()`
2. Реализуйте соответствующий препроцессинг в `prepare_data()`
3. Добавьте специфичные метрики в `calculate_metrics()`


---

**Поддержка:** Для вопросов и проблем создавайте issue в репозитории проекта.

**Версия:** 1.0.0