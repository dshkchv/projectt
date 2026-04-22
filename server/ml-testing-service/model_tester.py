from flask import Flask, request, jsonify
import torch
import torch.nn as nn
import pandas as pd
import numpy as np
import json
import tempfile
import os
import importlib.util
import sys
from datetime import datetime
import logging
from typing import Dict, List, Any, Optional, Tuple
from flask_cors import CORS
import requests
from sklearn.metrics import precision_score, recall_score, f1_score, accuracy_score

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

# Конфигурация
BACKEND_URL = "http://db-service:8000"  # URL основного бэкенда

class ModelTesterService:
    def __init__(self):
        self.loaded_models = {}
        self.supported_metrics = {
            'regression': ['mse', 'mae', 'rmse', 'mape', 'r2'],
            'classification': ['accuracy', 'precision', 'recall', 'f1'],
            'direction': ['direction_accuracy', 'direction_precision', 'direction_recall', 'direction_f1']
        }
    
    def load_model_from_backend(self, model_id: int):
        """Загрузка модели и ее файлов из основного бэкенда"""
        try:
            # Получаем информацию о модели
            model_response = requests.get(f"{BACKEND_URL}/api/models/{model_id}")
            if model_response.status_code != 200:
                raise ValueError(f"Model not found: {model_response.json().get('error')}")
            
            model_data = model_response.json()
            
            # Получаем файлы модели
            files_response = requests.get(f"{BACKEND_URL}/api/models/{model_id}/files")
            if files_response.status_code != 200:
                raise ValueError(f"Model files not found: {files_response.json().get('error')}")
            
            files_data = files_response.json()
            
            # Загружаем файл модели
            model_file_response = requests.get(f"{BACKEND_URL}/api/models/{model_id}/download-model")
            if model_file_response.status_code != 200:
                raise ValueError("Failed to download model file")
            
            # Создаем временный файл для модели
            with tempfile.NamedTemporaryFile(suffix='.pt', delete=False) as f:
                f.write(model_file_response.content)
                model_path = f.name
            
            model = None
            
            # Загружаем код модели если есть
            code_path = None
            if files_data.get('model_code_path'):
                code_response = requests.get(f"{BACKEND_URL}/api/models/{model_id}/download-code")
                if code_response.status_code == 200:
                    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as f:
                        f.write(code_response.content)
                        code_path = f.name
                    
                    try:
                        # Динамически импортируем класс модели
                        spec = importlib.util.spec_from_file_location("custom_model", code_path)
                        custom_module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(custom_module)
                        
                        # Ищем класс модели
                        model_class_name = model_data.get('model_class_name')
                        if model_class_name:
                            model_class = getattr(custom_module, model_class_name)
                        else:
                            # Автопоиск класса модели
                            for attr_name in dir(custom_module):
                                attr = getattr(custom_module, attr_name)
                                if (isinstance(attr, type) and 
                                    issubclass(attr, nn.Module) and 
                                    attr != nn.Module):
                                    model_class = attr
                                    model_class_name = attr_name
                                    break
                            else:
                                raise ValueError("Не найден класс модели в переданном коде")
                        
                        # Создаем экземпляр и загружаем веса
                        model = model_class()
                        checkpoint = torch.load(model_path, map_location='cpu')
                        
                        if isinstance(checkpoint, dict) and 'state_dict' in checkpoint:
                            model.load_state_dict(checkpoint['state_dict'])
                        else:
                            model.load_state_dict(checkpoint)
                            
                    finally:
                        if code_path and os.path.exists(code_path):
                            os.unlink(code_path)
                else:
                    # Если код не загрузился, пробуем загрузить модель другими способами
                    try:
                        model = torch.jit.load(model_path)
                    except:
                        loaded = torch.load(model_path, map_location='cpu')
                        if isinstance(loaded, nn.Module):
                            model = loaded
            else:
                # Пытаемся загрузить как torchscript или полную модель
                try:
                    model = torch.jit.load(model_path)
                except:
                    loaded = torch.load(model_path, map_location='cpu')
                    if isinstance(loaded, nn.Module):
                        model = loaded
            
            if model is None:
                raise ValueError("Не удалось загрузить модель")
                
            model.eval()
            if os.path.exists(model_path):
                os.unlink(model_path)
            
            return model, model_data.get('model_config', {})
            
        except Exception as e:
            logging.error(f"ERROR loading model from backend: {str(e)}")
            if 'model_path' in locals() and os.path.exists(model_path):
                os.unlink(model_path)
            if 'code_path' in locals() and os.path.exists(code_path):
                os.unlink(code_path)
            raise

    def load_dataset_from_backend(self, dataset_id: int):
        """Загрузка датасета из основного бэкенда"""
        try:
            # Получаем данные датасета
            response = requests.get(f"{BACKEND_URL}/api/datasets/{dataset_id}/data")
            if response.status_code != 200:
                raise ValueError(f"Dataset not found: {response.json().get('error')}")
            
            dataset_data = response.json()
            return dataset_data
            
        except Exception as e:
            logging.error(f"ERROR loading dataset from backend: {str(e)}")
            raise
    
    def _apply_normalization(self, data: np.ndarray, config: Dict, feature_type: str = 'feature') -> np.ndarray:
        """Применение нормализации к данным"""
        normalization = config.get('normalization')
        
        if not normalization:
            return data
            
        if normalization == 'minmax':
            if feature_type == 'feature':
                min_vals = np.array(config.get('feature_scaler_min', [0.0]))
                scale_vals = np.array(config.get('feature_scaler_scale', [1.0]))
            else:  # target
                min_vals = np.array(config.get('scaler_min', [0.0]))
                scale_vals = np.array(config.get('scaler_scale', [1.0]))
            
            # Обеспечиваем совместимость размерностей
            if len(min_vals) == 1 and data.shape[-1] > 1:
                min_vals = np.full(data.shape[-1], min_vals[0])
                scale_vals = np.full(data.shape[-1], scale_vals[0])
            
            return (data - min_vals) * scale_vals
            
        elif normalization == 'standard':
            if feature_type == 'feature':
                mean_vals = np.array(config.get('feature_scaler_mean', [0.0]))
                std_vals = np.array(config.get('feature_scaler_std', [1.0]))
            else:  # target
                mean_vals = np.array(config.get('scaler_mean', [0.0]))
                std_vals = np.array(config.get('scaler_std', [1.0]))
            
            # Обеспечиваем совместимость размерностей
            if len(mean_vals) == 1 and data.shape[-1] > 1:
                mean_vals = np.full(data.shape[-1], mean_vals[0])
                std_vals = np.full(data.shape[-1], std_vals[0])
            
            return (data - mean_vals) / std_vals
        
        return data
    
    def _reverse_normalization(self, data: np.ndarray, config: Dict, feature_type: str = 'feature') -> np.ndarray:
        """Обратное преобразование нормализации"""
        normalization = config.get('normalization')
        
        if not normalization:
            return data
            
        if normalization == 'minmax':
            if feature_type == 'feature':
                min_vals = np.array(config.get('feature_scaler_min', [0.0]))
                scale_vals = np.array(config.get('feature_scaler_scale', [1.0]))
            else:  # target
                min_vals = np.array(config.get('scaler_min', [0.0]))
                scale_vals = np.array(config.get('scaler_scale', [1.0]))
            
            # Обеспечиваем совместимость размерностей
            if len(min_vals) == 1 and data.shape[-1] > 1:
                min_vals = np.full(data.shape[-1], min_vals[0])
                scale_vals = np.full(data.shape[-1], scale_vals[0])
            
            return data / scale_vals + min_vals
            
        elif normalization == 'standard':
            if feature_type == 'feature':
                mean_vals = np.array(config.get('feature_scaler_mean', [0.0]))
                std_vals = np.array(config.get('feature_scaler_std', [1.0]))
            else:  # target
                mean_vals = np.array(config.get('scaler_mean', [0.0]))
                std_vals = np.array(config.get('scaler_std', [1.0]))
            
            # Обеспечиваем совместимость размерностей
            if len(mean_vals) == 1 and data.shape[-1] > 1:
                mean_vals = np.full(data.shape[-1], mean_vals[0])
                std_vals = np.full(data.shape[-1], std_vals[0])
            
            return data * std_vals + mean_vals
        
        return data
    
    def prepare_sequential_data(self, dataset: List[Dict], config: Dict) -> torch.Tensor:
        """Подготовка последовательных данных для LSTM моделей"""
        try:
            df = pd.DataFrame(dataset)
            
            # Выбираем фичи для модели
            features = config.get('features', ['open', 'high', 'low', 'close', 'volume'])
            sequence_length = config.get('sequence_length', 10)
            
            feature_data = df[features].values.astype(np.float32)
            
            # Применяем нормализацию если указана
            feature_data = self._apply_normalization(feature_data, config, 'feature').astype(np.float32)
            
            # Создаем последовательности
            sequences = []
            for i in range(len(feature_data) - sequence_length + 1):
                sequences.append(feature_data[i:i + sequence_length])
            
            if not sequences:
                raise ValueError("Недостаточно данных для создания последовательностей")
            
            # Преобразуем в тензор: (batch_size, sequence_length, features)
            tensor_data = torch.from_numpy(np.array(sequences))
            
            return tensor_data
            
        except Exception as e:
            logging.error(f"ERROR preparing sequential data: {str(e)}")
            raise
    
    def prepare_single_point_data(self, dataset: List[Dict], config: Dict) -> torch.Tensor:
        """Подготовка данных для моделей, работающих с отдельными точками"""
        df = pd.DataFrame(dataset)
        
        # Выбираем фичи для модели
        features = config.get('features', ["open", "high", "low", "close", "volume"])
        feature_data = df[features].values.astype(np.float32)
        
        # Применяем нормализацию если указана
        feature_data = self._apply_normalization(feature_data, config, 'feature')
        
        # Преобразуем в тензор: (batch_size, features)
        tensor_data = torch.from_numpy(feature_data)
        
        return tensor_data
    
    def prepare_data(self, dataset: List[Dict], config: Dict) -> torch.Tensor:
        """Умная подготовка данных с автоопределением типа"""
        if config.get('model_type') == 'sequential' or config.get('sequence_length', 1) > 1:
            return self.prepare_sequential_data(dataset, config)
        else:
            return self.prepare_single_point_data(dataset, config)
    
    def calculate_direction_metrics(self, predictions: np.ndarray, targets: np.ndarray) -> Dict[str, float]:
        """Вычисление метрик для бинарной классификации направлений изменений"""
        try:
            # Рассчитываем направления изменений для предсказаний и фактических значений
            pred_directions = np.diff(predictions) > 0
            actual_directions = np.diff(targets) > 0


            min_len = min(len(pred_directions), len(actual_directions))
            pred_directions = pred_directions[:min_len]
            actual_directions = actual_directions[:min_len]

            # коррекция сдвига
            pred_directions = pred_directions[:-1]
            actual_directions = actual_directions[1:]
            
            if len(pred_directions) == 0 or len(actual_directions) == 0:
                return {
                    'direction_accuracy': 0.0,
                    'direction_precision': 0.0,
                    'direction_recall': 0.0,
                    'direction_f1': 0.0
                }
            
            # Вычисляем метрики
            accuracy = accuracy_score(actual_directions, pred_directions)
            precision = precision_score(actual_directions, pred_directions, zero_division=0)
            recall = recall_score(actual_directions, pred_directions, zero_division=0)
            f1 = f1_score(actual_directions, pred_directions, zero_division=0)
            
            return {
                'direction_accuracy': float(accuracy),
                'direction_precision': float(precision),
                'direction_recall': float(recall),
                'direction_f1': float(f1)
            }
            
        except Exception as e:
            logging.error(f"ERROR calculating direction metrics: {str(e)}")
            return {
                'direction_accuracy': 0.0,
                'direction_precision': 0.0,
                'direction_recall': 0.0,
                'direction_f1': 0.0
            }
    
    def calculate_metrics(self, predictions: np.ndarray, targets: np.ndarray, 
                         problem_type: str = 'regression') -> Dict[str, float]:
        """Вычисление метрик качества модели"""
        metrics = {}
        
        if problem_type == 'regression':
            # MSE
            metrics['mse'] = float(np.mean((predictions - targets) ** 2))
            # MAE
            metrics['mae'] = float(np.mean(np.abs(predictions - targets)))
            # RMSE
            metrics['rmse'] = float(np.sqrt(metrics['mse']))
            # MAPE
            mask = targets != 0
            if np.any(mask):
                metrics['mape'] = float(np.mean(np.abs((predictions[mask] - targets[mask]) / targets[mask])) * 100)
            else:
                metrics['mape'] = 0.0
            # R²
            ss_res = np.sum((predictions - targets) ** 2)
            ss_tot = np.sum((targets - np.mean(targets)) ** 2)
            if ss_tot > 0:
                metrics['r2'] = float(1 - (ss_res / ss_tot))
            else:
                metrics['r2'] = 0.0
            
            # Добавляем метрики направлений
            direction_metrics = self.calculate_direction_metrics(predictions, targets)
            metrics.update(direction_metrics)
            
        return metrics
    
    def test_model(self, model, dataset: List[Dict], config: Dict) -> Dict[str, Any]:
        """Основной метод тестирования модели"""
        try:
            target_feature = config.get('target_feature', 'close')
            
            # Подготовка данных
            input_data = self.prepare_data(dataset, config)
            
            # Получение предсказаний с обработкой различных случаев
            with torch.no_grad():
                try:
                    predictions = model(input_data)
                except Exception as model_error:
                    logging.warning(f"Первая попытка предсказания не удалась: {model_error}")
                    # Пробуем альтернативные подходы
                    if len(input_data.shape) == 3 and input_data.shape[1] == 1:
                        # Если последовательность из одного элемента, пробуем убрать dimension последовательности
                        input_data_flat = input_data.squeeze(1)
                        predictions = model(input_data_flat)
                    else:
                        raise model_error
                
                predictions_np = predictions.numpy()
            
            # Извлечение таргетов с учетом типа данных
            if config.get('model_type') == 'sequential' or config.get('sequence_length', 1) > 1:
                sequence_length = config.get('sequence_length', 10)
                # Для последовательных данных берем таргеты, соответствующие концу каждой последовательности
                targets = np.array([item[target_feature] for item in dataset[sequence_length-1:]], dtype=np.float32)
            else:
                # Для точечных предсказаний берем все таргеты
                targets = np.array([item[target_feature] for item in dataset], dtype=np.float32)
            
            # Применяем нормализацию к таргетам если указана
            if config.get('normalization'):
                targets = self._apply_normalization(targets.reshape(-1, 1), config, 'target').flatten()
            
            # Выравниваем размерности если нужно
            if predictions_np.shape[0] != targets.shape[0]:
                min_len = min(predictions_np.shape[0], targets.shape[0])
                predictions_np = predictions_np[:min_len]
                targets = targets[:min_len]
            
            # Обратное преобразование нормализации для предсказаний
            if config.get('normalization'):
                # Предполагаем, что predictions имеют форму (n_samples, 1) для регрессии
                if len(predictions_np.shape) == 1:
                    predictions_np = predictions_np.reshape(-1, 1)
                
                predictions_denorm = self._reverse_normalization(predictions_np, config, 'target')
                
                # Также денормализуем targets для вычисления метрик в исходном масштабе
                if len(targets.shape) == 1:
                    targets_denorm = self._reverse_normalization(targets.reshape(-1, 1), config, 'target').flatten()
                else:
                    targets_denorm = self._reverse_normalization(targets, config, 'target')
            else:
                predictions_denorm = predictions_np
                targets_denorm = targets
            
            # Вычисление метрик на денормализованных данных
            metrics = self.calculate_metrics(predictions_denorm.flatten(), targets_denorm.flatten(), 
                                           config.get('problem_type', 'regression'))
            
            # Формирование результата с денормализованными значениями
            result_data = []
            if config.get('model_type') == 'sequential' or config.get('sequence_length', 1) > 1:
                sequence_length = config.get('sequence_length', 10)
                # Для последовательностей, сопоставляем с временными метками конца последовательности
                for i, pred in enumerate(predictions_denorm):
                    if i + sequence_length - 1 < len(dataset):
                        item = dataset[i + sequence_length - 1]
                        actual_value = item[target_feature]
                        predicted_value = float(pred[0] if len(pred.shape) > 0 else pred)
                        
                        # Если была нормализация, используем денормализованные значения
                        if config.get('normalization_target'):
                            # Денормализуем актуальное значение для отображения
                            actual_denorm = self._reverse_normalization(
                                np.array([[actual_value]]), config, 'target'
                            )[0, 0]
                            actual_value = actual_denorm
                        
                        result_data.append({
                            'timestamp': item['datetime'],
                            'actual': float(actual_value),
                            'predicted': predicted_value,
                            'error': float(abs(actual_value - predicted_value))
                        })
            else:
                # Для точечных предсказаний
                for i, (item, pred) in enumerate(zip(dataset, predictions_denorm)):
                    actual_value = item[target_feature]
                    predicted_value = float(pred[0] if len(pred.shape) > 0 else pred)
                    
                    # Если была нормализация, используем денормализованные значения
                    if config.get('normalization_target'):
                        # Денормализуем актуальное значение для отображения
                        actual_denorm = self._reverse_normalization(
                            np.array([[actual_value]]), config, 'target'
                        )[0, 0]
                        actual_value = actual_denorm
                    
                    result_data.append({
                        'timestamp': item['datetime'],
                        'actual': float(actual_value),
                        'predicted': predicted_value,
                        'error': float(abs(actual_value - predicted_value))
                    })
            
            # Добавляем информацию о нормализации в метаданные
            normalization_info = {}
            if config.get('normalization'):
                normalization_info = {
                    'method': config.get('normalization'),
                    'feature_scaler_min': config.get('feature_scaler_min'),
                    'feature_scaler_scale': config.get('feature_scaler_scale'),
                    'feature_scaler_mean': config.get('feature_scaler_mean'),
                    'feature_scaler_std': config.get('feature_scaler_std'),
                    'scaler_min': config.get('scaler_min'),
                    'scaler_scale': config.get('scaler_scale'),
                    'scaler_mean': config.get('scaler_mean'),
                    'scaler_std': config.get('scaler_std')
                }
            
            result = {
                'model_metadata': {
                    'model_type': str(type(model)),
                    'input_shape': list(input_data.shape),
                    'output_shape': list(predictions.shape),
                    'parameters_count': sum(p.numel() for p in model.parameters())
                },
                'data_metadata': {
                    'samples_count': len(dataset),
                    'features_used': config.get('features', ['open', 'high', 'low', 'close', 'volume']),
                    'target_feature': target_feature,
                    'date_range': {
                        'start': dataset[0]['datetime'] if dataset else None,
                        'end': dataset[-1]['datetime'] if dataset else None
                    },
                    'normalization': normalization_info
                },
                'predictions': result_data,
                'metrics': metrics,
                'test_config': config
            }
            
            return result
            
        except Exception as e:
            logging.error(f"ERROR testing model: {str(e)}")
            raise

# Инициализация сервиса
model_tester = ModelTesterService()

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy', 
        'timestamp': datetime.now().isoformat(),
        'pytorch_version': torch.__version__
    })

@app.route('/api/experiments/<int:experiment_id>/test', methods=['POST'])
def test_experiment(experiment_id):
    """Эндпоинт для тестирования эксперимента"""
    try:
        # Получаем информацию об эксперименте из основного бэкенда
        experiment_response = requests.get(f"{BACKEND_URL}/api/experiments/{experiment_id}")
        if experiment_response.status_code != 200:
            return jsonify({'error': f'Experiment not found: {experiment_response.json().get("error")}'}), 404
        
        experiment = experiment_response.json()
        print("EXPERIMENT LOADED: ", experiment)
        # Обновляем статус эксперимента на "running"
        update_response = requests.put(f"{BACKEND_URL}/api/experiments/{experiment_id}", json={
            'status': 'running'
        })
        
        if update_response.status_code != 200:
            return jsonify({'error': 'Failed to update experiment status'}), 500
        
        # Загружаем модель из бэкенда
        try:
            model, model_config = model_tester.load_model_from_backend(experiment['model_id'])
            print("MODEL LOADED: ", model)
        except Exception as e:
            # Обновляем статус на failed
            requests.put(f"{BACKEND_URL}/api/experiments/{experiment_id}", json={
                'status': 'failed'
            })
            return jsonify({'error': f'Model loading failed: {str(e)}'}), 400
        
        # Загружаем датасет из бэкенда
        try:
            dataset = model_tester.load_dataset_from_backend(experiment['dataset_id'])
            print("DATASET LOADED: ", dataset)
        except Exception as e:
            # Обновляем статус на failed
            requests.put(f"{BACKEND_URL}/api/experiments/{experiment_id}", json={
                'status': 'failed'
            })
            return jsonify({'error': f'Dataset loading failed: {str(e)}'}), 400
        
        # Парсим конфигурацию модели
        try:
            if isinstance(model_config, str):
                config = json.loads(model_config)
            else:
                config = model_config
        except:
            config = {}
        
        # Тестируем модель
        try:
            result = model_tester.test_model(model, dataset['chart_data']['data'], config)
            result['experiment_id'] = experiment_id
            
            # Сохраняем результаты в основной бэкенд
            save_response = requests.post(
                f"{BACKEND_URL}/api/experiments/{experiment_id}/prediction-results",
                json=result
            )
            
            if save_response.status_code not in [200, 201]:
                logging.error(f"Failed to save results: {save_response.json()}")
            
            # Обновляем статус эксперимента на completed
            requests.put(f"{BACKEND_URL}/api/experiments/{experiment_id}", json={
                'status': 'completed'
            })
            
            return jsonify({
                'message': 'Model testing completed successfully',
                'experiment_id': experiment_id,
                'metrics': result.get('metrics', {})
            })
            
        except Exception as e:
            # Обновляем статус на failed
            requests.put(f"{BACKEND_URL}/api/experiments/{experiment_id}", json={
                'status': 'failed'
            })
            
            # Сохраняем ошибку
            error_result = {
                'error': str(e),
                'experiment_id': experiment_id
            }
            requests.post(
                f"{BACKEND_URL}/api/experiments/${experiment_id}/prediction-results",
                json=error_result
            )
            
            return jsonify({'error': f'Model testing failed: {str(e)}'}), 400
        
    except Exception as e:
        logging.error(f"ERROR in experiment testing API: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/test', methods=['POST'])
def test_model_endpoint():
    """Основной эндпоинт для тестирования моделей с улучшенной обработкой"""
    try:
        # Проверяем наличие обязательных файлов
        if 'model' not in request.files:
            return jsonify({'error': 'Model file is required'}), 400
        
        model_file = request.files['model']
        model_code_file = request.files.get('model_code')
        
        # Получаем конфигурацию
        config_str = request.form.get('config', '{}')
        try:
            config = json.loads(config_str)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid config JSON'}), 400
        
        # Получаем тестовые данные
        test_data_str = request.form.get('test_data', '{}')
        try:
            test_data = json.loads(test_data_str)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid test_data JSON'}), 400
        
        if 'dataset' not in test_data or not test_data['dataset']:
            return jsonify({'error': 'Test dataset is required'}), 400
        
        # Загружаем модель
        try:
            model_class_name = config.get('model_class_name')
            model = model_tester.load_custom_model(
                model_file, 
                model_code_file, 
                model_class_name
            )
        except Exception as e:
            return jsonify({'error': f'Model loading failed: {str(e)}'}), 400
        
        # Тестируем модель
        try:
            result = model_tester.test_model(model, test_data['dataset'], config)
            
        except Exception as e:
            return jsonify({'error': f'Model testing failed: {str(e)}'}), 400
        
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"ERROR in model testing API: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/supported-metrics', methods=['GET'])
def get_supported_metrics():
    """Получение информации о поддерживаемых метриках"""
    problem_type = request.args.get('problem_type', 'regression')
    
    metrics = model_tester.supported_metrics.get(problem_type, [])
    
    return jsonify({
        'problem_type': problem_type,
        'supported_metrics': metrics,
        'descriptions': {
            'mse': 'Mean Squared Error',
            'mae': 'Mean Absolute Error', 
            'rmse': 'Root Mean Squared Error',
            'mape': 'Mean Absolute Percentage Error',
            'r2': 'R² Score',
            'accuracy': 'Accuracy',
            'precision': 'Precision',
            'recall': 'Recall',
            'f1': 'F1 Score',
            'direction_accuracy': 'Direction Prediction Accuracy',
            'direction_precision': 'Direction Prediction Precision',
            'direction_recall': 'Direction Prediction Recall',
            'direction_f1': 'Direction Prediction F1 Score'
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)