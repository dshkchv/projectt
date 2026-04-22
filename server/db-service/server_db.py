from flask import Flask, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import os
import json
import requests
import threading

# Flask app configuration
app = Flask(__name__)

# CORS configuration
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./experiments.db")
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Database models
class Dataset(db.Model):
    __tablename__ = "datasets"
    
    id = db.Column(db.Integer, primary_key=True, index=True)
    name = db.Column(db.String, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    experiments = db.relationship("Experiment", back_populates="dataset")

class Model(db.Model):
    __tablename__ = "models"
    
    id = db.Column(db.Integer, primary_key=True, index=True)
    name = db.Column(db.String, unique=True, index=True)
    description = db.Column(db.Text, nullable=True)
    model_config = db.Column(db.Text, nullable=True)
    model_class_name = db.Column(db.String, nullable=True)
    model_file_path = db.Column(db.String, nullable=True)
    model_code_path = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    experiments = db.relationship("Experiment", back_populates="model")

class Experiment(db.Model):
    __tablename__ = "experiments"
    
    id = db.Column(db.Integer, primary_key=True, index=True)
    name = db.Column(db.String, index=True)
    dataset_id = db.Column(db.Integer, db.ForeignKey("datasets.id"))
    model_id = db.Column(db.Integer, db.ForeignKey("models.id"))
    status = db.Column(db.String, default="created")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    dataset = db.relationship("Dataset", back_populates="experiments")
    model = db.relationship("Model", back_populates="experiments")
    metrics = db.relationship("ExperimentMetrics", back_populates="experiment", uselist=False)

class ExperimentMetrics(db.Model):
    __tablename__ = "experiment_metrics"
    
    id = db.Column(db.Integer, primary_key=True, index=True)
    experiment_id = db.Column(db.Integer, db.ForeignKey("experiments.id"))
    rmse = db.Column(db.Float, nullable=True)
    mae = db.Column(db.Float, nullable=True)
    mse = db.Column(db.Float, nullable=True)
    train_time = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    experiment = db.relationship("Experiment", back_populates="metrics")

class DatasetData(db.Model):
    __tablename__ = "dataset_data"
    
    id = db.Column(db.Integer, primary_key=True, index=True)
    dataset_id = db.Column(db.Integer, db.ForeignKey("datasets.id"))
    data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    dataset = db.relationship("Dataset", backref="data")

class PredictionResults(db.Model):
    __tablename__ = "prediction_results"
    
    id = db.Column(db.Integer, primary_key=True, index=True)
    experiment_id = db.Column(db.Integer, db.ForeignKey("experiments.id"))
    predictions_data = db.Column(db.Text)
    metrics_data = db.Column(db.Text)
    model_metadata = db.Column(db.Text)
    test_config = db.Column(db.Text)
    error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    experiment = db.relationship("Experiment", backref="prediction_results")

# CORS handlers
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

@app.route('/api/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    return '', 200

# Dataset data endpoints
@app.route('/api/datasets/<int:dataset_id>/data', methods=['POST', 'OPTIONS'])
def save_dataset_data(dataset_id):
    if request.method == 'OPTIONS':
        return '', 200
        
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    dataset = Dataset.query.get(dataset_id)
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    existing_data = DatasetData.query.filter_by(dataset_id=dataset_id).first()
    
    if existing_data:
        existing_data.data = json.dumps(data)
        db.session.commit()
        
        return jsonify({
            'message': 'Dataset data updated successfully',
            'dataset_id': dataset_id,
            'data_id': existing_data.id
        })
    else:
        dataset_data = DatasetData(
            dataset_id=dataset_id,
            data=json.dumps(data)
        )
        
        db.session.add(dataset_data)
        db.session.commit()
        
        return jsonify({
            'message': 'Dataset data saved successfully',
            'dataset_id': dataset_id,
            'data_id': dataset_data.id
        }), 201

@app.route('/api/datasets/<int:dataset_id>/load-chart', methods=['GET'])
def load_dataset_chart(dataset_id):
    dataset = Dataset.query.get(dataset_id)
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    dataset_data = DatasetData.query.filter_by(dataset_id=dataset_id).first()
    if not dataset_data:
        return jsonify({'error': 'No data found for this dataset'}), 404
    
    try:
        data = json.loads(dataset_data.data)
        return jsonify(data)
    except json.JSONDecodeError:
        return jsonify({'error': 'Failed to parse dataset data'}), 500

@app.route('/api/datasets/<int:dataset_id>/data', methods=['GET'])
def get_dataset_data(dataset_id):
    dataset = Dataset.query.get(dataset_id)
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    dataset_data = DatasetData.query.filter_by(dataset_id=dataset_id).first()
    if not dataset_data:
        return jsonify({'error': 'No data found for this dataset'}), 404
    
    try:
        data = json.loads(dataset_data.data)
        return jsonify(data)
    except json.JSONDecodeError:
        return jsonify({'error': 'Failed to parse dataset data'}), 500

@app.route('/api/datasets/<int:dataset_id>', methods=['DELETE'])
def delete_dataset(dataset_id):
    dataset = Dataset.query.get(dataset_id)
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    experiments_using_dataset = Experiment.query.filter_by(dataset_id=dataset_id).count()
    if experiments_using_dataset > 0:
        return jsonify({
            'error': f'Cannot delete dataset. It is used in {experiments_using_dataset} experiment(s). Delete those experiments first.'
        }), 400
    
    DatasetData.query.filter_by(dataset_id=dataset_id).delete()
    
    db.session.delete(dataset)
    db.session.commit()
    
    return jsonify({'message': 'Dataset deleted successfully', 'deleted_id': dataset_id})

# Model endpoints with file support
@app.route('/api/models', methods=['GET'])
def get_models():
    models = Model.query.all()
    return jsonify([{
        'id': model.id,
        'name': model.name,
        'description': model.description,
        'model_config': json.loads(model.model_config) if model.model_config else {},
        'model_class_name': model.model_class_name,
        'created_at': model.created_at.isoformat() if model.created_at else None
    } for model in models])

@app.route('/api/models/<int:model_id>', methods=['GET'])
def get_model(model_id):
    """Получение конкретной модели по ID"""
    model = Model.query.get(model_id)
    if not model:
        return jsonify({'error': 'Model not found'}), 404
    
    model_config = {}
    if model.model_config:
        try:
            model_config = json.loads(model.model_config)
        except json.JSONDecodeError:
            model_config = {}
    
    return jsonify({
        'id': model.id,
        'name': model.name,
        'description': model.description,
        'model_config': model_config,
        'model_class_name': model.model_class_name,
        'created_at': model.created_at.isoformat() if model.created_at else None
    })

@app.route('/api/models/<int:model_id>/files', methods=['GET'])
def get_model_files(model_id):
    """Получение информации о файлах модели"""
    model = Model.query.get(model_id)
    if not model:
        return jsonify({'error': 'Model not found'}), 404
    
    model_config = {}
    if model.model_config:
        try:
            model_config = json.loads(model.model_config)
        except json.JSONDecodeError:
            model_config = {}
    
    return jsonify({
        'model_file_path': model.model_file_path,
        'model_code_path': model.model_code_path,
        'config': model_config
    })

@app.route('/api/models/<int:model_id>/download-model', methods=['GET'])
def download_model_file(model_id):
    """Скачивание файла модели"""
    model = Model.query.get(model_id)
    if not model:
        return jsonify({'error': 'Model not found'}), 404
    
    if not model.model_file_path or not os.path.exists(model.model_file_path):
        return jsonify({'error': 'Model file not found'}), 404
    
    try:
        return send_file(model.model_file_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': f'Failed to send file: {str(e)}'}), 500

@app.route('/api/models/<int:model_id>/download-code', methods=['GET'])
def download_model_code(model_id):
    """Скачивание кода модели"""
    model = Model.query.get(model_id)
    if not model:
        return jsonify({'error': 'Model not found'}), 404
    
    if not model.model_code_path or not os.path.exists(model.model_code_path):
        return jsonify({'error': 'Model code not found'}), 404
    
    try:
        return send_file(model.model_code_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': f'Failed to send file: {str(e)}'}), 500

@app.route('/api/models', methods=['POST'])
def create_model():
    try:
        if 'model_file' not in request.files:
            return jsonify({'error': 'Model file is required'}), 400
        
        model_file = request.files['model_file']
        model_code_file = request.files.get('model_code')
        
        if model_file.filename == '':
            return jsonify({'error': 'No model file selected'}), 400
        
        name = request.form.get('name')
        description = request.form.get('description', '')
        config = request.form.get('config', '{}')
        model_class_name = request.form.get('model_class_name', '')
        
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        
        existing_model = Model.query.filter_by(name=name).first()
        if existing_model:
            return jsonify({'error': 'Model with this name already exists'}), 400
        
        # Create models directory
        models_dir = os.path.join(os.getcwd(), 'uploaded_models')
        os.makedirs(models_dir, exist_ok=True)
        
        # Save model file
        model_filename = f"model_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{model_file.filename}"
        model_file_path = os.path.join(models_dir, model_filename)
        model_file.save(model_file_path)
        
        # Save model code if provided
        model_code_path = None
        if model_code_file and model_code_file.filename != '':
            code_filename = f"code_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{model_code_file.filename}"
            model_code_path = os.path.join(models_dir, code_filename)
            model_code_file.save(model_code_path)
        
        # Create database record
        model = Model(
            name=name,
            description=description,
            model_config=config,
            model_class_name=model_class_name,
            model_file_path=model_file_path,
            model_code_path=model_code_path
        )
        
        db.session.add(model)
        db.session.commit()
        
        model_config_parsed = {}
        try:
            model_config_parsed = json.loads(config)
        except:
            pass
        
        return jsonify({
            'id': model.id,
            'name': model.name,
            'description': model.description,
            'model_config': model_config_parsed,
            'model_class_name': model_class_name,
            'created_at': model.created_at.isoformat() if model.created_at else None
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to create model: {str(e)}'}), 500

@app.route('/api/models/<int:model_id>', methods=['DELETE'])
def delete_model(model_id):
    model = Model.query.get(model_id)
    if not model:
        return jsonify({'error': 'Model not found'}), 404
    
    experiments_using_model = Experiment.query.filter_by(model_id=model_id).count()
    if experiments_using_model > 0:
        return jsonify({
            'error': f'Cannot delete model. It is used in {experiments_using_model} experiment(s). Delete those experiments first.'
        }), 400
    
    # Delete model files
    try:
        if model.model_file_path and os.path.exists(model.model_file_path):
            os.remove(model.model_file_path)
        if model.model_code_path and os.path.exists(model.model_code_path):
            os.remove(model.model_code_path)
    except Exception as e:
        print(f"Warning: Could not delete model files: {e}")
    
    db.session.delete(model)
    db.session.commit()
    
    return jsonify({'message': 'Model deleted successfully', 'deleted_id': model_id})

# Experiment endpoints
@app.route('/api/experiments', methods=['GET'])
def get_experiments():
    experiments = Experiment.query.all()
    
    result = []
    for exp in experiments:
        experiment_data = {
            'id': exp.id,
            'name': exp.name,
            'dataset_id': exp.dataset_id,
            'model_id': exp.model_id,
            'status': exp.status,
            'created_at': exp.created_at.isoformat() if exp.created_at else None,
            'updated_at': exp.updated_at.isoformat() if exp.updated_at else None,
            'dataset_name': exp.dataset.name if exp.dataset else None,
            'model_name': exp.model.name if exp.model else None
        }
        
        if exp.metrics:
            experiment_data['metrics'] = {
                'id': exp.metrics.id,
                'rmse': exp.metrics.rmse,
                'mae': exp.metrics.mae,
                'mse': exp.metrics.mse,
                'train_time': exp.metrics.train_time,
                'created_at': exp.metrics.created_at.isoformat() if exp.metrics.created_at else None
            }
        
        result.append(experiment_data)
    
    return jsonify(result)

@app.route('/api/experiments/<int:experiment_id>', methods=['GET'])
def get_experiment(experiment_id):
    experiment = Experiment.query.get(experiment_id)
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    experiment_data = {
        'id': experiment.id,
        'name': experiment.name,
        'dataset_id': experiment.dataset_id,
        'model_id': experiment.model_id,
        'status': experiment.status,
        'created_at': experiment.created_at.isoformat() if experiment.created_at else None,
        'updated_at': experiment.updated_at.isoformat() if experiment.updated_at else None,
        'dataset_name': experiment.dataset.name if experiment.dataset else None,
        'model_name': experiment.model.name if experiment.model else None
    }
    
    if experiment.metrics:
        experiment_data['metrics'] = {
            'id': experiment.metrics.id,
            'rmse': experiment.metrics.rmse,
            'mae': experiment.metrics.mae,
            'mse': experiment.metrics.mse,
            'train_time': experiment.metrics.train_time,
            'created_at': experiment.metrics.created_at.isoformat() if experiment.metrics.created_at else None
        }
    
    return jsonify(experiment_data)

@app.route('/api/experiments', methods=['POST'])
def create_experiment():
    data = request.get_json()
    
    if not data or 'name' not in data or 'dataset_id' not in data or 'model_id' not in data:
        return jsonify({'error': 'Name, dataset_id, and model_id are required'}), 400
    
    dataset = Dataset.query.get(data['dataset_id'])
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    model = Model.query.get(data['model_id'])
    if not model:
        return jsonify({'error': 'Model not found'}), 404
    
    existing_experiment = Experiment.query.filter_by(name=data['name']).first()
    if existing_experiment:
        return jsonify({'error': 'Experiment with this name already exists'}), 400
    
    experiment = Experiment(
        name=data['name'],
        dataset_id=data['dataset_id'],
        model_id=data['model_id'],
        status=data.get('status', 'created')
    )
    
    db.session.add(experiment)
    db.session.commit()
    
    experiment_data = {
        'id': experiment.id,
        'name': experiment.name,
        'dataset_id': experiment.dataset_id,
        'model_id': experiment.model_id,
        'status': experiment.status,
        'created_at': experiment.created_at.isoformat() if experiment.created_at else None,
        'updated_at': experiment.updated_at.isoformat() if experiment.updated_at else None,
        'dataset_name': dataset.name,
        'model_name': model.name
    }
    
    return jsonify(experiment_data), 201

@app.route('/api/experiments/<int:experiment_id>', methods=['PUT'])
def update_experiment(experiment_id):
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    experiment = Experiment.query.get(experiment_id)
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    if 'dataset_id' in data:
        dataset = Dataset.query.get(data['dataset_id'])
        if not dataset:
            return jsonify({'error': 'Dataset not found'}), 404
    
    if 'model_id' in data:
        model = Model.query.get(data['model_id'])
        if not model:
            return jsonify({'error': 'Model not found'}), 404
    
    if 'name' in data:
        existing_experiment = Experiment.query.filter(
            Experiment.name == data['name'],
            Experiment.id != experiment_id
        ).first()
        if existing_experiment:
            return jsonify({'error': 'Experiment with this name already exists'}), 400
    
    for key, value in data.items():
        if hasattr(experiment, key):
            setattr(experiment, key, value)
    
    experiment.updated_at = datetime.utcnow()
    db.session.commit()
    
    experiment_data = {
        'id': experiment.id,
        'name': experiment.name,
        'dataset_id': experiment.dataset_id,
        'model_id': experiment.model_id,
        'status': experiment.status,
        'created_at': experiment.created_at.isoformat() if experiment.created_at else None,
        'updated_at': experiment.updated_at.isoformat() if experiment.updated_at else None,
        'dataset_name': experiment.dataset.name if experiment.dataset else None,
        'model_name': experiment.model.name if experiment.model else None
    }
    
    if experiment.metrics:
        experiment_data['metrics'] = {
            'id': experiment.metrics.id,
            'rmse': experiment.metrics.rmse,
            'mae': experiment.metrics.mae,
            'mse': experiment.metrics.mse,
            'train_time': experiment.metrics.train_time,
            'created_at': experiment.metrics.created_at.isoformat() if experiment.metrics.created_at else None
        }
    
    return jsonify(experiment_data)

@app.route('/api/experiments/<int:experiment_id>', methods=['DELETE'])
def delete_experiment(experiment_id):
    experiment = Experiment.query.get(experiment_id)
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    ExperimentMetrics.query.filter_by(experiment_id=experiment_id).delete()
    PredictionResults.query.filter_by(experiment_id=experiment_id).delete()
    
    db.session.delete(experiment)
    db.session.commit()
    
    return jsonify({'message': 'Experiment deleted successfully', 'deleted_id': experiment_id})

# Model testing endpoints
@app.route('/api/experiments/<int:experiment_id>/run-testing', methods=['POST'])
def run_model_testing(experiment_id):
    try:
        experiment = Experiment.query.get(experiment_id)
        if not experiment:
            return jsonify({'error': 'Experiment not found'}), 404
        
        # Update status to running
        experiment.status = 'running'
        db.session.commit()
        
        # Start async testing
        thread = threading.Thread(target=run_async_model_testing, args=(experiment_id,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'message': 'Model testing started',
            'experiment_id': experiment_id,
            'status': 'running'
        })
        
    except Exception as e:
        experiment.status = 'failed'
        db.session.commit()
        return jsonify({'error': f'Failed to start model testing: {str(e)}'}), 500

@app.route('/api/experiments/<int:experiment_id>/restart-testing', methods=['POST'])
def restart_model_testing(experiment_id):
    try:
        experiment = Experiment.query.get(experiment_id)
        if not experiment:
            return jsonify({'error': 'Experiment not found'}), 404
        
        # Delete previous results
        PredictionResults.query.filter_by(experiment_id=experiment_id).delete()
        
        # Update status to running
        experiment.status = 'running'
        db.session.commit()
        
        # Start async testing
        thread = threading.Thread(target=run_async_model_testing, args=(experiment_id,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'message': 'Model testing restarted',
            'experiment_id': experiment_id,
            'status': 'running'
        })
        
    except Exception as e:
        experiment.status = 'failed'
        db.session.commit()
        return jsonify({'error': f'Failed to restart model testing: {str(e)}'}), 500

def run_async_model_testing(experiment_id):
    with app.app_context():
        try:
            experiment = Experiment.query.get(experiment_id)
            if not experiment:
                return
            
            model = Model.query.get(experiment.model_id)
            if not model:
                experiment.status = 'failed'
                db.session.commit()
                return
            
            dataset_data = DatasetData.query.filter_by(dataset_id=experiment.dataset_id).first()
            if not dataset_data:
                experiment.status = 'failed'
                db.session.commit()
                return
            
            # Prepare data for model_tester
            test_data = {
                'dataset': json.loads(dataset_data.data),
                'experiment_id': experiment_id
            }
            
            model_config = json.loads(model.model_config) if model.model_config else {}
            
            # Send request to model_tester
            files = {}
            
            if model.model_file_path and os.path.exists(model.model_file_path):
                files['model'] = open(model.model_file_path, 'rb')
            
            if model.model_code_path and os.path.exists(model.model_code_path):
                files['model_code'] = open(model.model_code_path, 'rb')
            
            data = {
                'config': json.dumps(model_config),
                'test_data': json.dumps(test_data)
            }
            
            response = requests.post(
                'http://localhost:5001/api/models/test',
                files=files,
                data=data,
                timeout=300
            )
            
            # Close files
            for file in files.values():
                if file:
                    file.close()
            
            if response.status_code == 200:
                test_results = response.json()
                
                prediction_results = PredictionResults(
                    experiment_id=experiment_id,
                    predictions_data=json.dumps(test_results.get('predictions', [])),
                    metrics_data=json.dumps(test_results.get('metrics', {})),
                    model_metadata=json.dumps(test_results.get('model_metadata', {})),
                    test_config=json.dumps(test_results.get('test_config', {}))
                )
                
                db.session.add(prediction_results)
                
                # Update experiment metrics
                metrics = test_results.get('metrics', {})
                experiment_metrics = ExperimentMetrics.query.filter_by(experiment_id=experiment_id).first()
                if not experiment_metrics:
                    experiment_metrics = ExperimentMetrics(experiment_id=experiment_id)
                    db.session.add(experiment_metrics)
                
                experiment_metrics.rmse = metrics.get('rmse')
                experiment_metrics.mae = metrics.get('mae')
                experiment_metrics.mse = metrics.get('mse')
                
                experiment.status = 'completed'
                
            else:
                error_msg = response.json().get('error', 'Unknown error')
                prediction_results = PredictionResults(
                    experiment_id=experiment_id,
                    error=error_msg
                )
                db.session.add(prediction_results)
                experiment.status = 'failed'
            
            db.session.commit()
            
        except Exception as e:
            print(f"Error in async model testing: {str(e)}")
            experiment.status = 'failed'
            db.session.commit()

# Prediction results endpoints
@app.route('/api/experiments/<int:experiment_id>/prediction-results', methods=['POST', 'OPTIONS'])
def save_prediction_results(experiment_id):
    if request.method == 'OPTIONS':
        return '', 200
        
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    experiment = Experiment.query.get(experiment_id)
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    existing_results = PredictionResults.query.filter_by(experiment_id=experiment_id).first()
    
    if existing_results:
        existing_results.predictions_data = json.dumps(data.get('predictions', []))
        existing_results.metrics_data = json.dumps(data.get('metrics', {}))
        existing_results.model_metadata = json.dumps(data.get('model_metadata', {}))
        existing_results.test_config = json.dumps(data.get('test_config', {}))
        existing_results.error = data.get('error')
        db.session.commit()
        
        return jsonify({
            'message': 'Prediction results updated successfully',
            'experiment_id': experiment_id,
            'results_id': existing_results.id
        })
    else:
        prediction_results = PredictionResults(
            experiment_id=experiment_id,
            predictions_data=json.dumps(data.get('predictions', [])),
            metrics_data=json.dumps(data.get('metrics', {})),
            model_metadata=json.dumps(data.get('model_metadata', {})),
            test_config=json.dumps(data.get('test_config', {})),
            error=data.get('error')
        )
        
        db.session.add(prediction_results)
        db.session.commit()
        
        return jsonify({
            'message': 'Prediction results saved successfully',
            'experiment_id': experiment_id,
            'results_id': prediction_results.id
        }), 201

@app.route('/api/experiments/<int:experiment_id>/prediction-results', methods=['GET'])
def get_prediction_results(experiment_id):
    experiment = Experiment.query.get(experiment_id)
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    prediction_results = PredictionResults.query.filter_by(experiment_id=experiment_id).first()
    if not prediction_results:
        return jsonify({'error': 'No prediction results found for this experiment'}), 404
    
    try:
        results_data = {
            'predictions': json.loads(prediction_results.predictions_data),
            'metrics': json.loads(prediction_results.metrics_data),
            'model_metadata': json.loads(prediction_results.model_metadata),
            'test_config': json.loads(prediction_results.test_config),
            'error': prediction_results.error,
            'created_at': prediction_results.created_at.isoformat() if prediction_results.created_at else None
        }
        return jsonify(results_data)
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        return jsonify({'error': 'Failed to parse prediction results data'}), 500

# Metrics endpoints
@app.route('/api/experiments/<int:experiment_id>/metrics', methods=['POST'])
def create_experiment_metrics(experiment_id):
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    experiment = Experiment.query.get(experiment_id)
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    existing_metrics = ExperimentMetrics.query.filter_by(experiment_id=experiment_id).first()
    
    if existing_metrics:
        for key, value in data.items():
            if hasattr(existing_metrics, key) and value is not None:
                setattr(existing_metrics, key, value)
        db.session.commit()
        
        metrics_data = {
            'id': existing_metrics.id,
            'experiment_id': existing_metrics.experiment_id,
            'rmse': existing_metrics.rmse,
            'mae': existing_metrics.mae,
            'mse': existing_metrics.mse,
            'train_time': existing_metrics.train_time,
            'created_at': existing_metrics.created_at.isoformat() if existing_metrics.created_at else None
        }
        
        return jsonify(metrics_data)
    else:
        metrics = ExperimentMetrics(
            experiment_id=experiment_id,
            rmse=data.get('rmse'),
            mae=data.get('mae'),
            mse=data.get('mse'),
            train_time=data.get('train_time')
        )
        
        db.session.add(metrics)
        db.session.commit()
        
        metrics_data = {
            'id': metrics.id,
            'experiment_id': metrics.experiment_id,
            'rmse': metrics.rmse,
            'mae': metrics.mae,
            'mse': metrics.mse,
            'train_time': metrics.train_time,
            'created_at': metrics.created_at.isoformat() if metrics.created_at else None
        }
        
        return jsonify(metrics_data), 201

# Dataset endpoints
@app.route('/api/datasets', methods=['GET'])
def get_datasets():
    datasets = Dataset.query.all()
    return jsonify([{
        'id': dataset.id,
        'name': dataset.name,
        'description': dataset.description,
        'created_at': dataset.created_at.isoformat() if dataset.created_at else None
    } for dataset in datasets])

@app.route('/api/datasets', methods=['POST'])
def create_dataset():
    data = request.get_json()
    
    if not data or 'name' not in data:
        return jsonify({'error': 'Name is required'}), 400
    
    existing_dataset = Dataset.query.filter_by(name=data['name']).first()
    if existing_dataset:
        return jsonify({'error': 'Dataset with this name already exists'}), 400
    
    dataset = Dataset(
        name=data['name'],
        description=data.get('description')
    )
    
    db.session.add(dataset)
    db.session.commit()
    
    return jsonify({
        'id': dataset.id,
        'name': dataset.name,
        'description': dataset.description,
        'created_at': dataset.created_at.isoformat() if dataset.created_at else None
    }), 201

def create_tables():
    with app.app_context():
        print(f"Database URI: {app.config['SQLALCHEMY_DATABASE_URI']}")
        print(f"Current working directory: {os.getcwd()}")
        
        db.drop_all()
        db.create_all()
        print("Database tables created successfully!")
        
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        print("Created tables:", tables)

def init_sample_data():
    with app.app_context():
        if Dataset.query.count() == 0:
            print("Adding sample data...")
            
            datasets = [
                Dataset(name="SBER", description="Sberbank stock data"),
                Dataset(name="LKOH", description="Lukoil stock data"),
                Dataset(name="GAZP", description="Gazprom stock data"),
                Dataset(name="RTS_hourly", description="RTS index hourly data"),
                Dataset(name="NASDAQ_daily", description="NASDAQ daily data"),
            ]
            
            models = [
                Model(name="LSTM", description="Long Short-Term Memory network"),
                Model(name="Prophet", description="Facebook Prophet model"),
                Model(name="ARIMA", description="AutoRegressive Integrated Moving Average"),
                Model(name="Random Forest", description="Ensemble learning method"),
                Model(name="XGBoost", description="Gradient boosting framework"),
            ]
            
            db.session.add_all(datasets)
            db.session.add_all(models)
            db.session.commit()
            
            experiments = [
                Experiment(
                    name="LSTM_RTS_v1",
                    dataset_id=4,
                    model_id=1,
                    status="completed"
                ),
                Experiment(
                    name="Prophet_NASDAQ_daily",
                    dataset_id=5,
                    model_id=2,
                    status="running"
                ),
                Experiment(
                    name="ARIMA_RTS_hourly",
                    dataset_id=4,
                    model_id=3,
                    status="created"
                ),
            ]
            
            db.session.add_all(experiments)
            db.session.commit()
            
            metrics = [
                ExperimentMetrics(
                    experiment_id=1,
                    rmse=0.021,
                    mae=0.015,
                    mse=0.000441,
                    train_time=12.4
                ),
                ExperimentMetrics(
                    experiment_id=2,
                    rmse=0.035,
                    mae=0.025,
                    train_time=8.7
                ),
            ]
            
            db.session.add_all(metrics)
            db.session.commit()
            print("Sample data added successfully!")

@app.route('/')
def root():
    return jsonify({"message": "Experiments API"})

def initialize_app():
    create_tables()
#    init_sample_data()

if __name__ == '__main__':
    initialize_app()
    print("Server starting on http://localhost:8000")
    app.run(host='0.0.0.0', port=8000, debug=True)