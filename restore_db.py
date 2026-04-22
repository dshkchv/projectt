# clear_db.py
from server.server_db import app, db, Dataset, Model, Experiment, ExperimentMetrics, DatasetData

def clear_database():
    with app.app_context():
        print("Очистка базы данных...")
        
        # Удаляем данные в правильном порядке
        ExperimentMetrics.query.delete()
        DatasetData.query.delete()
        Experiment.query.delete()
        Dataset.query.delete()
        Model.query.delete()
        
        db.session.commit()
        print("База данных очищена!")
        
        # Проверяем
        print(f"Осталось Datasets: {Dataset.query.count()}")
        print(f"Осталось Models: {Model.query.count()}")
        print(f"Осталось Experiments: {Experiment.query.count()}")

if __name__ == '__main__':
    clear_database()