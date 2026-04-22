import Hat from './Hat'
import { useState, useEffect } from 'react'

interface Model {
  id: number;
  name: string;
  description?: string;
  model_config?: any;
  model_class_name?: string;
  created_at: string;
}

function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newModel, setNewModel] = useState({
    name: '',
    description: '',
    model_file: null as File | null,
    model_code: null as File | null,
    model_class_name: '',
    config: JSON.stringify({
      model_type: 'sequential',
      sequence_length: 10,
      features: ['open', 'high', 'low', 'close', 'volume'],
      target_feature: 'close',
      problem_type: 'regression'
    }, null, 2)
  });

  // Загрузка моделей из базы данных
  const loadModels = async () => {
    try {
      console.log('Loading models from API...');
      const response = await fetch('http://localhost:8000/api/models');
      if (response.ok) {
        const data = await response.json();
        console.log('Models loaded:', data);
        setModels(data);
      } else {
        console.error('Failed to load models:', response.status);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  // Удаление модели
  const deleteModel = async (modelId: number, modelName: string) => {
    if (!confirm(`Are you sure you want to delete model "${modelName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/models/${modelId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setModels(prev => prev.filter(model => model.id !== modelId));
        alert('Model deleted successfully!');
      } else {
        const errorData = await response.json();
        alert(`Error deleting model: ${errorData.detail || errorData.error}`);
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      alert('Error deleting model');
    }
  };

  // Создание новой модели с файлами
  const createModel = async () => {
    if (!newModel.name.trim()) {
      alert('Please enter model name');
      return;
    }

    if (!newModel.model_file) {
      alert('Please select a model file');
      return;
    }

    setIsLoading(true);
    try {
      // Создаем FormData для отправки файлов и данных
      const formData = new FormData();
      formData.append('name', newModel.name.trim());
      formData.append('description', newModel.description.trim() || `Model ${newModel.name}`);
      formData.append('config', newModel.config);
      formData.append('model_class_name', newModel.model_class_name);
      
      if (newModel.model_file) {
        formData.append('model_file', newModel.model_file);
      }
      
      if (newModel.model_code) {
        formData.append('model_code', newModel.model_code);
      }

      const response = await fetch('http://localhost:8000/api/models', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.error || 'Failed to create model');
      }

      const createdModel = await response.json();
      console.log('Model created:', createdModel);
      
      await loadModels();
      
      setNewModel({
        name: '',
        description: '',
        model_file: null,
        model_code: null,
        model_class_name: '',
        config: JSON.stringify({
          model_type: 'sequential',
          sequence_length: 10,
          features: ['open', 'high', 'low', 'close', 'volume'],
          target_feature: 'close',
          problem_type: 'regression'
        }, null, 2)
      });
      setIsNewDialogOpen(false);
      
      alert('Model created successfully!');

    } catch (error) {
      console.error('Error creating model:', error);
      alert(`Error creating model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Обработчик выбора файла модели
  const handleModelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewModel(prev => ({
        ...prev,
        model_file: e.target.files![0]
      }));
    }
  };

  // Обработчик выбора файла кода модели
  const handleModelCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewModel(prev => ({
        ...prev,
        model_code: e.target.files![0]
      }));
    }
  };

  // Валидация JSON конфигурации
  const isConfigValid = () => {
    try {
      JSON.parse(newModel.config);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="main-page">
      <Hat />
      
      {/* Диалог создания новой модели */}
      {isNewDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Upload New Model</h3>
              <button
                onClick={() => setIsNewDialogOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Основная информация о модели */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model Name *
                  </label>
                  <input
                    type="text"
                    value={newModel.name}
                    onChange={(e) => setNewModel(prev => ({
                      ...prev,
                      name: e.target.value
                    }))}
                    className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                    placeholder="Enter model name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model Class Name
                  </label>
                  <input
                    type="text"
                    value={newModel.model_class_name}
                    onChange={(e) => setNewModel(prev => ({
                      ...prev,
                      model_class_name: e.target.value
                    }))}
                    className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., LSTMPredictor"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newModel.description}
                  onChange={(e) => setNewModel(prev => ({
                    ...prev,
                    description: e.target.value
                  }))}
                  className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                  placeholder="Model description"
                  rows={2}
                />
              </div>

              {/* Загрузка файлов */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model File (.pt) *
                  </label>
                  <input
                    type="file"
                    accept=".pt,.pth"
                    onChange={handleModelFileChange}
                    className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                  />
                  {newModel.model_file && (
                    <p className="text-sm text-green-600 mt-1">
                      Selected: {newModel.model_file.name}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model Code (.py) - Optional
                  </label>
                  <input
                    type="file"
                    accept=".py"
                    onChange={handleModelCodeChange}
                    className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                  />
                  {newModel.model_code && (
                    <p className="text-sm text-green-600 mt-1">
                      Selected: {newModel.model_code.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Конфигурация модели */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model Configuration (JSON)
                </label>
                <textarea
                  value={newModel.config}
                  onChange={(e) => setNewModel(prev => ({
                    ...prev,
                    config: e.target.value
                  }))}
                  className={`w-full border-2 rounded-md p-2 font-mono text-sm focus:outline-none ${
                    isConfigValid() ? 'border-gray-300 focus:border-blue-500' : 'border-red-500'
                  }`}
                  rows={8}
                  placeholder='Enter model configuration in JSON format'
                />
                {!isConfigValid() && (
                  <p className="text-sm text-red-600 mt-1">
                    Invalid JSON format
                  </p>
                )}
              </div>

              <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded-md">
                <p><strong>Required fields:</strong> Model Name and Model File (.pt)</p>
                <p><strong>Optional:</strong> Model Code (.py) - required for custom model classes</p>
                <p><strong>Configuration:</strong> Define model type, sequence length, features, etc.</p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setIsNewDialogOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={createModel}
                disabled={isLoading || !newModel.name.trim() || !newModel.model_file || !isConfigValid()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Uploading...' : 'Upload Model'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col w-full p-4 gap-4">
        {/* Заголовок и кнопка New */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Models</h1>
          <button 
            onClick={() => setIsNewDialogOpen(true)}
            className="bg-green-700 hover:bg-green-800 text-white rounded-md px-4 py-2"
          >
            New Model
          </button>
        </div>

        {/* Список моделей */}
        <div className="border-2 rounded-md overflow-hidden">
          {models.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No models found. Click "New Model" to upload your first model.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Description</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Class Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Created</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {models.map((model) => (
                  <tr key={model.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {model.id}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {model.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {model.description || 'No description'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {model.model_class_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(model.created_at).toLocaleDateString()} {new Date(model.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteModel(model.id, model.name)}
                        className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-colors"
                        title="Delete model"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Информация о поддерживаемых форматах */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Supported Model Formats</h3>
          <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
            <li>PyTorch .pt files (state dict or full model)</li>
            <li>TorchScript .pt files</li>
            <li>Custom models with Python code (.py)</li>
            <li>Sequential models (LSTM) and single-point prediction models</li>
          </ul>
        </div>

        {/* Отладочная информация */}
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-gray-800 mb-2">Debug Info</h3>
          <p className="text-sm text-gray-600">
            Models loaded: {models.length}<br />
            API endpoint: http://localhost:8000/api/models
          </p>
        </div>
      </div>
    </div>
  )
}

export default Models