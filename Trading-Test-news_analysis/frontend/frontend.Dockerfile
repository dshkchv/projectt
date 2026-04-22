# --- Stage 1: Build ---
FROM node:20 AS build

WORKDIR /app

# Сначала копируем package.json для кеша зависимостей
COPY frontend/package.json frontend/package-lock.json* ./

RUN npm install

# Копируем остальной исходный код
COPY frontend .

# Сборка фронтенда
RUN npm run build

# --- Stage 2: Static Serve using Nginx ---
FROM nginx:alpine

# Копируем собранный фронтенд
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx слушает 80 порт
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]