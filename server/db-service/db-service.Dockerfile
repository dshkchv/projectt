FROM python:3.10-slim

WORKDIR /app

# Устанавливаем зависимости
COPY server/db-service/requirements.txt .
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

# Копируем код сервиса
COPY server/db-service .

# Сохраняем SQLite БД вне контейнера
VOLUME ["/app/data"]

ENV DATABASE_URL="sqlite:////app/data/experiments.db"

EXPOSE 8000

CMD ["python", "server_db.py"]