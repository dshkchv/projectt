import sqlite3
from datetime import datetime

def update_finam_db():
    # Подключаемся к базе данных
    conn = sqlite3.connect('finam_news.db')
    cursor = conn.cursor()
    
    try:
        # 1. Добавляем столбец ticker, если его еще нет
        try:
            cursor.execute("ALTER TABLE finam_news ADD COLUMN ticker TEXT")
            print("Столбец 'ticker' добавлен")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print("Столбец 'ticker' уже существует")
            else:
                raise e
        
        # 2. Устанавливаем значение "VTBR" для всех записей в столбце ticker
        cursor.execute("UPDATE finam_news SET ticker = 'VTBR'")
        print(f"Значение 'VTBR' установлено для {cursor.rowcount} записей")
        
        # 3. Получаем все записи для преобразования pub_time
        cursor.execute("SELECT id, pub_time FROM finam_news WHERE pub_time IS NOT NULL AND pub_time != ''")
        rows = cursor.fetchall()
        
        print(f"\nНайдено {len(rows)} записей для обработки")
        
        updated_count = 0
        for row_id, pub_time in rows:
            if pub_time:
                try:
                    new_date = None
                    
                    # Формат DD.MM.YY (например, 23.05.24)
                    if '.' in pub_time and len(pub_time.split('.')[0]) <= 2:
                        try:
                            # Определяем, есть ли время после пробела
                            if ' ' in pub_time:
                                date_part = pub_time.split(' ')[0]
                                dt = datetime.strptime(date_part, '%d.%m.%y')
                            else:
                                dt = datetime.strptime(pub_time, '%d.%m.%y')
                            new_date = dt.strftime('%Y-%m-%d')
                            print(f"Преобразован формат DD.MM.YY: {pub_time} -> {new_date}")
                        except Exception as e:
                            print(f"Ошибка парсинга DD.MM.YY для {pub_time}: {e}")
                    
                    # Формат DD.MM.YYYY
                    if not new_date and '.' in pub_time:
                        try:
                            if ' ' in pub_time:
                                date_part = pub_time.split(' ')[0]
                                dt = datetime.strptime(date_part, '%d.%m.%Y')
                            else:
                                dt = datetime.strptime(pub_time, '%d.%m.%Y')
                            new_date = dt.strftime('%Y-%m-%d')
                            print(f"Преобразован формат DD.MM.YYYY: {pub_time} -> {new_date}")
                        except:
                            pass
                    
                    # ISO формат
                    if not new_date:
                        try:
                            dt = datetime.fromisoformat(pub_time.replace('Z', '+00:00'))
                            new_date = dt.strftime('%Y-%m-%d')
                            print(f"Преобразован ISO формат: {pub_time} -> {new_date}")
                        except:
                            pass
                    
                    # Стандартный формат YYYY-MM-DD HH:MM:SS
                    if not new_date:
                        try:
                            dt = datetime.strptime(pub_time, '%Y-%m-%d %H:%M:%S')
                            new_date = dt.strftime('%Y-%m-%d')
                            print(f"Преобразован стандартный формат: {pub_time} -> {new_date}")
                        except:
                            pass
                    
                    # Если дата уже в нужном формате YYYY-MM-DD
                    if not new_date and len(pub_time) == 10 and pub_time[4] == '-' and pub_time[7] == '-':
                        new_date = pub_time
                        print(f"Дата уже в нужном формате: {pub_time}")
                    
                    # Если удалось преобразовать, обновляем запись
                    if new_date:


                        cursor.execute(
                            "UPDATE finam_news SET pub_time = ? WHERE id = ?", 
                            (new_date, row_id)
                        )
                        updated_count += 1
                    else:
                        print(f"❌ Не удалось преобразовать формат для id={row_id}: {pub_time}")
                        
                except Exception as e:
                    print(f"Ошибка при обработке id={row_id}: {e}")
        
        # Сохраняем изменения
        conn.commit()
        print(f"\n✅ Преобразовано {updated_count} записей pub_time в формат YYYY-MM-DD")
        
        # 4. Показываем пример результата
        cursor.execute("SELECT id, pub_time, title, ticker FROM finam_news LIMIT 5")
        sample = cursor.fetchall()
        print("\n📊 Пример первых 5 записей после обновления:")
        print("-" * 80)
        for row in sample:
            print(f"ID: {row[0]}")
            print(f"Дата: {row[1]}")
            print(f"Тикер: {row[3]}")
            print(f"Заголовок: {row[2][:50]}..." if row[2] and len(row[2]) > 50 else f"Заголовок: {row[2]}")
            print("-" * 80)
            
    except Exception as e:
        print(f"❌ Произошла ошибка: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    update_finam_db()