from server.db-service import app, db, Dataset, Model, Experiment

def show_all_tables():
    """Показывает содержимое всех таблиц"""
    with app.app_context():
        from sqlalchemy import inspect, text
        
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        
        print("=" * 60)
        print("СОДЕРЖИМОЕ БАЗЫ ДАННЫХ")
        print("=" * 60)
        
        for table_name in tables:
            print(f"\n ТАБЛИЦА: {table_name}")
            print("-" * 40)
            
            # Получаем названия колонок
            columns = inspector.get_columns(table_name)
            column_names = [col['name'] for col in columns]
            print(f"Колонки: {', '.join(column_names)}")
            
            # Получаем данные
            try:
                result = db.session.execute(text(f"SELECT * FROM {table_name}"))
                rows = result.fetchall()
                
                if rows:
                    print(f"Количество записей: {len(rows)}")
                    for i, row in enumerate(rows, 1):
                        print(f"  {i}. {row}")
                else:
                    print("  (таблица пуста)")
                    
            except Exception as e:
                print(f"  Ошибка при чтении таблицы: {e}")
        
        print("\n" + "=" * 60)

# Можно вызвать из кода
if __name__ == '__main__':
    show_all_tables()