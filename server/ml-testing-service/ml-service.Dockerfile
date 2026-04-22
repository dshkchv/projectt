FROM python:3.10-slim

WORKDIR /app

# Torch требует системные пакеты
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libopenblas-dev \
    libomp-dev \
    && rm -rf /var/lib/apt/lists/*

# requirements
COPY server/ml-testing-service/requirements.txt .

RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

# копируем сервис
COPY server/ml-testing-service .

EXPOSE 5001

CMD ["python", "model_tester.py"]