FROM python:3.10-slim

WORKDIR /app

# Устанавливаем системные библиотеки для pandas/numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        gfortran \
        build-essential \
        libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

COPY server/dataloader/requirements.txt .

RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

COPY server/dataloader .

EXPOSE 5000

CMD ["python", "dataloader.py"]