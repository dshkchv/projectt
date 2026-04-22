import Hat from './Hat'
import { useState, useEffect, useRef } from 'react'
import { createChart, AreaSeries, LineSeries } from "lightweight-charts";
import { BACKEND_URL, TESTING_URL } from "./config.ts";

interface Experiment {
  id: number;
  name: string;
  dataset_id: number;
  model_id: number;
  dataset_name: string;
  model_name: string;
  created_at: string;
  status: string;
  metrics?: {
    rmse?: number;
    mae?: number;
    mse?: number;
    train_time?: number;
  };
}

interface Dataset {
  id: number;
  name: string;
}

interface Model {
  id: number;
  name: string;
}

interface PredictionResults {
  predictions: any[];
  metrics: any;
  model_metadata?: any;
  test_config?: any;
  error?: string;
}

// Компонент для отображения графика сравнения
const PredictionComparisonChart = ({ datasetData, predictionData }: { datasetData: any, predictionData: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !datasetData || !predictionData) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    try {
      const chart = createChart(chartContainerRef.current, {
        layout: { 
          textColor: "black", 
          background: { color: "white" },
          fontSize: 12
        },
        width: chartContainerRef.current.clientWidth,
        height: 400,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        }
      });

      const transformDataForChart = (data: any) => {
        if (!data) return [];
        
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((item: any) => ({
            time: new Date(item.datetime).getTime() / 1000,
            value: item.close || 0
          }));
        }
        else if (data.chart_data && Array.isArray(data.chart_data)) {
          return data.chart_data.map((item: any) => ({
            time: new Date(item.time).getTime() / 1000,
            value: item.value || 0
          }));
        }
        else if (Array.isArray(data)) {
          return data.map((item: any) => ({
            time: new Date(item.time || item.datetime).getTime() / 1000,
            value: item.value || item.close || 0
          }));
        }
        
        return [];
      };

      const transformPredictionData = (data: any): any[] => {
        if (!data || !data.predictions || !Array.isArray(data.predictions)) {
          console.log('No prediction data or invalid format');
          return [];
        }
        
        console.log('Processing prediction data, items:', data.predictions.length);
        
        const predictionPoints = data.predictions
          .filter((pred: any) => {
            const hasTimestamp = pred.timestamp;
            const hasValue = pred.predicted !== undefined;
            if (!hasTimestamp) console.log('Prediction missing timestamp:', pred);
            if (!hasValue) console.log('Prediction missing predicted value:', pred);
            return hasTimestamp && hasValue;
          })
          .map((pred: any) => {
            const originalTime = new Date(pred.timestamp);
            
            // Определяем интервал на основе разницы между точками предсказаний
            let timeShift = 24 * 60 * 60 * 1000; // по умолчанию 1 день
            
            if (data.predictions.length > 1) {
              const firstTime = new Date(data.predictions[0].timestamp);
              const secondTime = new Date(data.predictions[1].timestamp);
              timeShift = secondTime.getTime() - firstTime.getTime();
              console.log('Detected time shift:', timeShift / (60 * 60 * 1000), 'hours');
            }
            
            const shiftedTime = new Date(originalTime.getTime() + timeShift);
            
            return {
              time: shiftedTime.getTime() / 1000,
              value: parseFloat(pred.predicted)
            };
          });
        
        console.log('Valid prediction points (WITH SHIFT):', predictionPoints.length);
        if (predictionPoints.length > 0) {
          console.log('First prediction point time:', new Date(predictionPoints[0].time * 1000).toISOString());
          console.log('Last prediction point time:', new Date(predictionPoints[predictionPoints.length - 1].time * 1000).toISOString());
        }
        
        return predictionPoints;
      };

      // original data (line)
      const originalData = transformDataForChart(datasetData);

      // const originalOptions: Partial<LineSeriesOptions> = {
      //     color: '#2962FF',
      //     lineWidth: 2,
      // };
      
      const originalSeries = chart.addSeries(LineSeries);
      originalSeries.setData(originalData);

      if (predictionData.predictions && Array.isArray(predictionData.predictions)) {
        const predictionChartData = transformPredictionData(predictionData);
      
      if (predictionChartData.length > 0) {
        const predictionSeries = chart.addSeries(LineSeries, { 
          color: '#FF2962',
          lineWidth: 2,
          title: 'Predictions',
          priceLineVisible: false
        });
        predictionSeries.setData(predictionChartData);
        console.log('Prediction series added with', predictionChartData.length, 'points (WITH SHIFT FORWARD)');
      } else {
        console.log('No prediction data to display');
      }
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;

    } catch (err) {
      console.error('Error creating prediction comparison chart:', err);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [datasetData, predictionData]);

  if (!datasetData || !predictionData) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available for comparison
      </div>
    );
  }

  return (
    <div>
      <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }}/>
      <div className="flex justify-center mt-2 space-x-4">
        <div className="flex items-center">
          <div className="w-4 h-4 bg-blue-500 mr-2"></div>
          <span className="text-sm">Original Data</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-red-500 mr-2"></div>
          <span className="text-sm">Model Predictions</span>
        </div>
      </div>
    </div>
  );
};

// Компонент для отображения метрик
const MetricsDisplay = ({ metrics }: { metrics: any }) => {
  if (!metrics || Object.keys(metrics).length === 0) {
    return (
      <div className="border-2 rounded-md p-4 mt-4">
        <h3 className="text-lg font-semibold mb-3">Model Performance Metrics</h3>
        <div className="text-center text-gray-500 py-4">
          No metrics available
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 rounded-md p-4 mt-4">
      <h3 className="text-lg font-semibold mb-3">Model Performance Metrics</h3>
      
      {/* Регрессионные метрики */}
      <div className="mb-6">
        <h4 className="text-md font-medium mb-3 text-blue-700">Regression Metrics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.rmse !== undefined && (
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-700">{metrics.rmse.toFixed(4)}</div>
              <div className="text-sm text-blue-600">RMSE</div>
            </div>
          )}
          {metrics.mae !== undefined && (
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-700">{metrics.mae.toFixed(4)}</div>
              <div className="text-sm text-green-600">MAE</div>
            </div>
          )}
          {metrics.mse !== undefined && (
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-700">{metrics.mse.toFixed(6)}</div>
              <div className="text-sm text-purple-600">MSE</div>
            </div>
          )}
          {metrics.r2 !== undefined && (
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-700">{metrics.r2.toFixed(4)}</div>
              <div className="text-sm text-orange-600">R² Score</div>
            </div>
          )}
        </div>
        {metrics.mape !== undefined && (
          <div className="mt-3 text-center">
            <div className="text-lg font-semibold text-gray-700">MAPE: {metrics.mape.toFixed(2)}%</div>
            <div className="text-sm text-gray-500">Mean Absolute Percentage Error</div>
          </div>
        )}
      </div>

      {/* Метрики направлений */}
      {(metrics.direction_accuracy !== undefined || metrics.direction_f1 !== undefined) && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-md font-medium mb-3 text-red-700">Direction Prediction Metrics</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.direction_accuracy !== undefined && (
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-700">{(metrics.direction_accuracy * 100).toFixed(1)}%</div>
                <div className="text-sm text-red-600">Direction Accuracy</div>
              </div>
            )}
            {metrics.direction_precision !== undefined && (
              <div className="text-center p-3 bg-pink-50 rounded-lg">
                <div className="text-2xl font-bold text-pink-700">{metrics.direction_precision.toFixed(4)}</div>
                <div className="text-sm text-pink-600">Direction Precision</div>
              </div>
            )}
            {metrics.direction_recall !== undefined && (
              <div className="text-center p-3 bg-indigo-50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-700">{metrics.direction_recall.toFixed(4)}</div>
                <div className="text-sm text-indigo-600">Direction Recall</div>
              </div>
            )}
            {metrics.direction_f1 !== undefined && (
              <div className="text-center p-3 bg-teal-50 rounded-lg">
                <div className="text-2xl font-bold text-teal-700">{metrics.direction_f1.toFixed(4)}</div>
                <div className="text-sm text-teal-600">Direction F1 Score</div>
              </div>
            )}
          </div>
          <div className="mt-3 text-center text-sm text-gray-500">
            Direction metrics measure how well the model predicts price movement direction (up/down)
          </div>
        </div>
      )}
    </div>
  );
};

// Компонент для отображения только линейного графика
const SimpleAreaChart = ({ data }: { data: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    try {
      const getAreaData = (chartData: any): any[] => {
        if (!chartData) {
          console.log('No data available for area chart');
          return [];
        }
        
        let areaData: any[] = [];
        
        if (chartData.data && Array.isArray(chartData.data)) {
          areaData = chartData.data.map((item: any) => ({
            time: new Date(item.datetime).getTime() / 1000,
            value: item.close || 0
          }));
        } 
        else if (chartData.chart_data && Array.isArray(chartData.chart_data)) {
          areaData = chartData.chart_data.map((item: any) => ({
            time: new Date(item.time).getTime() / 1000,
            value: item.value || item.close || 0
          }));
        }
        else if (Array.isArray(chartData)) {
          areaData = chartData.map((item: any) => ({
            time: new Date(item.time).getTime() / 1000,
            value: item.value || 0
          }));
        }
        
        return areaData;
      };

      const areaData = getAreaData(data['chart_data']);
      
      if (areaData.length === 0) {
        console.log('No area data available for chart');
        return;
      }

      const chart = createChart(chartContainerRef.current, {
        layout: { 
          textColor: "black", 
          background: { color: "white" },
          fontSize: 12
        },
        width: chartContainerRef.current.clientWidth,
        height: 300,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        }
      });

      const areaSeries = chart.addSeries(AreaSeries, { 
        lineColor: '#2962FF', 
        topColor: '#2962FF', 
        bottomColor: 'rgba(41, 98, 255, 0.28)' 
      });

      areaSeries.setData(areaData);
      chart.timeScale().fitContent();
      chartRef.current = chart;

    } catch (err) {
      console.error('Error creating area chart:', err);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  return (
    <div ref={chartContainerRef} style={{ width: "100%", height: "300px" }}/>
  );
};

function Experiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [newExperiment, setNewExperiment] = useState({
    name: '',
    dataset_id: '',
    model_id: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'predictions' | 'metrics' | 'config'>('overview');
  const [isTesting, setIsTesting] = useState(false);
  
  const [datasetData, setDatasetData] = useState<any>(null);
  const [predictionResults, setPredictionResults] = useState<PredictionResults | null>(null);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false);

  // Загрузка экспериментов
  const loadExperiments = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/experiments`);
      if (response.ok) {
        const data = await response.json();
        setExperiments(data);
        if (data.length > 0 && !selectedExperiment) {
          setSelectedExperiment(data[0]);
        }
      }
    } catch (error) {
      console.error('Error loading experiments:', error);
    }
  };

  // Загрузка датасетов
  const loadDatasets = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/datasets`);
      if (response.ok) {
        const data = await response.json();
        setDatasets(data);
      }
    } catch (error) {
      console.error('Error loading datasets:', error);
    }
  };

  // Загрузка моделей
  const loadModels = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/models`);
      if (response.ok) {
        const data = await response.json();
        setModels(data);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  // Загрузка данных датасета при выборе эксперимента
  const loadDatasetData = async (experiment: Experiment) => {
    if (!experiment || !experiment.dataset_id) return;
    
    try {
      console.log('Loading dataset data for experiment:', experiment.id);
      console.log(experiment)
      const response = await fetch(`${BACKEND_URL}/api/datasets/${experiment.dataset_id}/load-chart`);
      if (response.ok) {
        const data = await response.json();
        console.log('Dataset data loaded:', data);
        setDatasetData(data);
      } else if (response.status !== 404) {
        console.error('Error loading dataset data:', await response.text());
        setDatasetData(null);
      } else {
        setDatasetData(null);
      }
    } catch (error) {
      console.error('Error loading dataset data:', error);
      setDatasetData(null);
    }
  };

  // Загрузка результатов предсказаний
  const loadPredictionResults = async (experiment: Experiment) => {
    if (!experiment || !experiment.id) return;
    
    setIsLoadingPredictions(true);
    try {
      console.log('Loading prediction results for experiment:', experiment.id);
      const response = await fetch(`${BACKEND_URL}/api/experiments/${experiment.id}/prediction-results`);
      if (response.ok) {
        const data = await response.json();
        console.log('Prediction results loaded:', data);
        setPredictionResults(data);
      } else if (response.status !== 404) {
        console.error('Error loading prediction results:', await response.text());
        setPredictionResults(null);
      } else {
        setPredictionResults(null);
      }
    } catch (error) {
      console.error('Error loading prediction results:', error);
      setPredictionResults(null);
    } finally {
      setIsLoadingPredictions(false);
    }
  };

  useEffect(() => {
    loadExperiments();
    loadDatasets();
    loadModels();
  }, []);

  // При изменении выбранного эксперимента загружаем данные датасета и результаты предсказаний
  useEffect(() => {
    if (selectedExperiment) {
      loadDatasetData(selectedExperiment);
      if (selectedExperiment.status === 'completed') {
          loadPredictionResults(selectedExperiment);
      }
      
      // Если эксперимент в статусе running, начинаем отслеживание
      if (selectedExperiment.status === 'running') {
        setIsTesting(true);
        checkTestingStatus(selectedExperiment.id);
      } else {
        setIsTesting(false);
      }
    } else {
      setDatasetData(null);
      setPredictionResults(null);
      setIsTesting(false);
    }
  }, [selectedExperiment]);

  // Создание нового эксперимента
  const createExperiment = async () => {
    if (!newExperiment.name || !newExperiment.dataset_id || !newExperiment.model_id) {
      alert('Please fill all fields');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/experiments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newExperiment.name,
          dataset_id: parseInt(newExperiment.dataset_id),
          model_id: parseInt(newExperiment.model_id),
          status: 'created'
        })
      });

      if (response.ok) {
        const createdExperiment = await response.json();
        setExperiments(prev => [...prev, createdExperiment]);
        setSelectedExperiment(createdExperiment);
        setIsNewDialogOpen(false);
        setNewExperiment({ name: '', dataset_id: '', model_id: '' });
        
        // Автоматически запускаем тестирование модели через model_tester
        await runModelTesting(createdExperiment.id);
        
      } else {
        alert('Error creating experiment');
      }
    } catch (error) {
      console.error('Error creating experiment:', error);
      alert('Error creating experiment');
    } finally {
      setIsLoading(false);
    }
  };

  // Запуск тестирования модели через model_tester
  const runModelTesting = async (experimentId: number) => {
    try {
      console.log('Starting model testing for experiment:', experimentId);
      setIsTesting(true);
      
      // Запускаем тестирование через model_tester
      const response = await fetch(`${TESTING_URL}/api/experiments/${experimentId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Model testing started:', result);
        
        // Обновляем статус эксперимента
        if (selectedExperiment && selectedExperiment.id === experimentId) {
          setSelectedExperiment(prev => prev ? {...prev, status: 'running'} : null);
        }
        
        // Начинаем отслеживание статуса
        checkTestingStatus(experimentId);
        
      } else {
        const errorData = await response.json();
        console.error('Failed to start model testing:', errorData);
        alert(`Failed to start model testing: ${errorData.error}`);
        setIsTesting(false);
      }
    } catch (error) {
      console.error('Error starting model testing:', error);
      alert('Error starting model testing');
      setIsTesting(false);
    }
  };

  // Рестарт тестирования модели
  const restartModelTesting = async () => {
    if (!selectedExperiment) return;
    
    try {
      console.log('Restarting model testing for experiment:', selectedExperiment.id);
      setIsTesting(true);
      
      const response = await fetch(`${TESTING_URL}/api/experiments/${selectedExperiment.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Model testing restarted:', result);
        
        // Обновляем статус эксперимента
        setSelectedExperiment(prev => prev ? {...prev, status: 'running'} : null);
        
        // Начинаем отслеживание статуса
        checkTestingStatus(selectedExperiment.id);
        
      } else {
        const errorData = await response.json();
        console.error('Failed to restart model testing:', errorData);
        alert(`Failed to restart model testing: ${errorData.error}`);
        setIsTesting(false);
      }
    } catch (error) {
      console.error('Error restarting model testing:', error);
      alert('Error restarting model testing');
      setIsTesting(false);
    }
  };

  // Проверка статуса тестирования
  const checkTestingStatus = async (experimentId: number) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/experiments/${experimentId}`);
      if (response.ok) {
        const experiment = await response.json();
        
        if (experiment.status === 'running') {
          // Если тестирование еще выполняется, проверяем снова через 2 секунды
          setTimeout(() => checkTestingStatus(experimentId), 2000);
        } else if (experiment.status === 'completed') {
          // Тестирование завершено, загружаем результаты
          setIsTesting(false);
          loadPredictionResults(experiment);
          loadExperiments(); // Обновляем список экспериментов
          
          // Обновляем выбранный эксперимент
          if (selectedExperiment && selectedExperiment.id === experimentId) {
            setSelectedExperiment(experiment);
          }
        } else if (experiment.status === 'failed') {
          setIsTesting(false);
          alert('Model testing failed');
          
          // Обновляем выбранный эксперимент
          if (selectedExperiment && selectedExperiment.id === experimentId) {
            setSelectedExperiment(experiment);
          }
        }
      }
    } catch (error) {
      console.error('Error checking testing status:', error);
      setIsTesting(false);
    }
  };

  // Удаление эксперимента
  const deleteExperiment = async () => {
    if (!selectedExperiment) return;

    if (!confirm(`Are you sure you want to delete experiment "${selectedExperiment.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/experiments/${selectedExperiment.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setExperiments(prev => prev.filter(exp => exp.id !== selectedExperiment.id));
        const remainingExperiments = experiments.filter(exp => exp.id !== selectedExperiment.id);
        setSelectedExperiment(remainingExperiments.length > 0 ? remainingExperiments[0] : null);
        setDatasetData(null);
        setPredictionResults(null);
        setIsTesting(false);
      } else {
        alert('Error deleting experiment');
      }
    } catch (error) {
      console.error('Error deleting experiment:', error);
      alert('Error deleting experiment');
    }
  };

  // Фильтрация экспериментов по поисковому запросу
  const filteredExperiments = experiments.filter(exp =>
    exp.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Рендер контента в зависимости от активной вкладки
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-4">
            {/* Информация об эксперименте */}
            <div className="text-sm space-y-2 p-4 border rounded-md">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p><strong>ID:</strong> {selectedExperiment.id}</p>
                  <p><strong>Dataset:</strong> {selectedExperiment.dataset_name}</p>
                  <p><strong>Model:</strong> {selectedExperiment.model_name}</p>
                </div>
                <div>
                  <p><strong>Status:</strong> 
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${
                      selectedExperiment.status === 'completed' ? 'bg-green-100 text-green-800' :
                      selectedExperiment.status === 'running' ? 'bg-yellow-100 text-yellow-800' :
                      selectedExperiment.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedExperiment.status}
                      {isTesting && ' (testing...)'}
                    </span>
                  </p>
                  <p><strong>Created:</strong> {new Date(selectedExperiment.created_at).toLocaleString()}</p>
                  {selectedExperiment.metrics && (
                    <>
                      <p><strong>RMSE:</strong> {selectedExperiment.metrics.rmse?.toFixed(4) || 'N/A'}</p>
                      <p><strong>Train time:</strong> {selectedExperiment.metrics.train_time ? `${selectedExperiment.metrics.train_time}s` : 'N/A'}</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* График датасета */}
            <div className="border-2 rounded-md overflow-hidden">
              {datasetData ? (
                <div className="h-full flex flex-col">
                  <div className="p-2 border-b bg-gray-50">
                    <h3 className="font-medium">
                      Dataset Chart: {selectedExperiment.dataset_name}
                    </h3>
                  </div>
                  <div className="flex-1 p-4">
                    <SimpleAreaChart data={datasetData} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 py-8">
                  {selectedExperiment.dataset_id ? 
                    'Loading dataset data...' : 
                    'No dataset data available'
                  }
                </div>
              )}
            </div>
          </div>
        );

      case 'predictions':
        return (
          <div className="space-y-4">
            {isLoadingPredictions ? (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Loading prediction results...
              </div>
            ) : predictionResults ? (
              <>
                {predictionResults.error ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Error in Model Testing</h3>
                    <p className="text-red-700">{predictionResults.error}</p>
                  </div>
                ) : (
                  <>
                    <div className="border-2 rounded-md overflow-hidden">
                      <div className="p-2 border-b bg-gray-50">
                        <h3 className="font-medium">
                          Prediction Comparison: {selectedExperiment.dataset_name}
                          {isTesting && (
                            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                              Testing in progress...
                            </span>
                          )}
                        </h3>
                      </div>
                      <div className="flex-1 p-4">
                        <PredictionComparisonChart 
                          datasetData={datasetData} 
                          predictionData={predictionResults} 
                        />
                      </div>
                    </div>
                    
                    <MetricsDisplay metrics={predictionResults.metrics} />
                    
                    {/* Детальная информация о предсказаниях */}
                    {predictionResults.predictions && predictionResults.predictions.length > 0 && (
                      <div className="border-2 rounded-md p-4">
                        <h3 className="text-lg font-semibold mb-3">Prediction Details</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left">Timestamp</th>
                                <th className="px-3 py-2 text-left">Actual</th>
                                <th className="px-3 py-2 text-left">Predicted</th>
                                <th className="px-3 py-2 text-left">Error</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {predictionResults.predictions.slice(0, 10).map((pred: any, index: number) => (
                                <tr key={index}>
                                  <td className="px-3 py-2">{new Date(pred.timestamp).toLocaleString()}</td>
                                  <td className="px-3 py-2">{pred.actual?.toFixed(4)}</td>
                                  <td className="px-3 py-2">{pred.predicted?.toFixed(4)}</td>
                                  <td className="px-3 py-2">{pred.error?.toFixed(4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {predictionResults.predictions.length > 10 && (
                            <div className="text-center text-gray-500 mt-2">
                              Showing first 10 of {predictionResults.predictions.length} predictions
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                {isTesting 
                  ? 'Model testing in progress...' 
                  : 'No prediction results available. Run model testing first.'
                }
              </div>
            )}
          </div>
        );

      case 'metrics':
        return (
          <div className="space-y-4">
            {predictionResults && predictionResults.metrics ? (
              <MetricsDisplay metrics={predictionResults.metrics} />
            ) : selectedExperiment.metrics ? (
              <div className="border-2 rounded-md p-4">
                <h3 className="text-lg font-semibold mb-3">Experiment Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {selectedExperiment.metrics.rmse !== undefined && (
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-700">{selectedExperiment.metrics.rmse.toFixed(4)}</div>
                      <div className="text-sm text-blue-600">RMSE</div>
                    </div>
                  )}
                  {selectedExperiment.metrics.mae !== undefined && (
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-700">{selectedExperiment.metrics.mae.toFixed(4)}</div>
                      <div className="text-sm text-green-600">MAE</div>
                    </div>
                  )}
                  {selectedExperiment.metrics.mse !== undefined && (
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-700">{selectedExperiment.metrics.mse.toFixed(6)}</div>
                      <div className="text-sm text-purple-600">MSE</div>
                    </div>
                  )}
                </div>
                {selectedExperiment.metrics.train_time !== undefined && (
                  <div className="mt-4 text-center">
                    <div className="text-lg font-semibold text-gray-700">
                      Training Time: {selectedExperiment.metrics.train_time}s
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                {isTesting ? 'Testing in progress...' : 'No metrics available'}
              </div>
            )}
          </div>
        );

      case 'config':
        return (
          <div className="space-y-4">
            {predictionResults && predictionResults.test_config ? (
              <div className="border-2 rounded-md p-4">
                <h3 className="text-lg font-semibold mb-3">Test Configuration</h3>
                <pre className="bg-gray-50 p-4 rounded-md overflow-x-auto text-sm">
                  {JSON.stringify(predictionResults.test_config, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No configuration data available
              </div>
            )}
            
            {predictionResults && predictionResults.model_metadata ? (
              <div className="border-2 rounded-md p-4">
                <h3 className="text-lg font-semibold mb-3">Model Metadata</h3>
                <pre className="bg-gray-50 p-4 rounded-md overflow-x-auto text-sm">
                  {JSON.stringify(predictionResults.model_metadata, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="main-page">
      <Hat />
      
      {/* Диалог создания нового эксперимента */}
      {isNewDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Create New Experiment</h3>
              <button
                onClick={() => setIsNewDialogOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Experiment Name
                </label>
                <input
                  type="text"
                  value={newExperiment.name}
                  onChange={(e) => setNewExperiment(prev => ({
                    ...prev,
                    name: e.target.value
                  }))}
                  className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter experiment name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dataset
                </label>
                <select
                  value={newExperiment.dataset_id}
                  onChange={(e) => setNewExperiment(prev => ({
                    ...prev,
                    dataset_id: e.target.value
                  }))}
                  className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select Dataset</option>
                  {datasets.map(dataset => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <select
                  value={newExperiment.model_id}
                  onChange={(e) => setNewExperiment(prev => ({
                    ...prev,
                    model_id: e.target.value
                  }))}
                  className="w-full border-2 rounded-md p-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select Model</option>
                  {models.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setIsNewDialogOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={createExperiment}
                disabled={isLoading || !newExperiment.name || !newExperiment.dataset_id || !newExperiment.model_id}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-row w-full p-2 gap-2 h-[calc(100vh-80px)]">
        {/* Left panel */}
        <div className="w-1/4 border-2 rounded-md p-2 flex flex-col">
          <div className="flex flex-col gap-10 flex-1">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl">Experiments</h2>
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-2 rounded-md p-2 text-left text-gray-700 border-gray-300 border-dotted hover:bg-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
              {filteredExperiments.map(experiment => (
                <button
                  key={experiment.id}
                  onClick={() => setSelectedExperiment(experiment)}
                  className={`border-2 rounded-md p-2 text-left text-gray-700 border-gray-300 hover:bg-gray-200 ${
                    selectedExperiment?.id === experiment.id ? 'bg-blue-100 border-blue-500' : ''
                  }`}
                >
                  <div className="font-medium">{experiment.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {experiment.dataset_name} → {experiment.model_name}
                  </div>
                  <div className={`text-xs mt-1 ${
                    experiment.status === 'completed' ? 'text-green-600' :
                    experiment.status === 'running' ? 'text-yellow-600' :
                    experiment.status === 'failed' ? 'text-red-600' :
                    'text-gray-500'
                  }`}>
                    {experiment.status}
                    {experiment.status === 'running' && ' (testing...)'}
                  </div>
                </button>
              ))}
              {filteredExperiments.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  No experiments found
                </div>
              )}
              <div className="flex-1"></div>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <button 
              onClick={deleteExperiment}
              disabled={!selectedExperiment}
              className="bg-red-700 hover:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md px-4 py-2 w-full"
            >
              Delete
            </button>
            <button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-green-700 hover:bg-green-800 text-white rounded-md px-4 py-2 w-full"
            >
              New
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-3/4 border-2 rounded-md p-2 flex flex-col gap-2">
          {selectedExperiment ? (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-xl">Experiment: {selectedExperiment.name}</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={restartModelTesting}
                    disabled={isTesting}
                    className={`px-4 py-2 rounded-md ${
                      isTesting 
                        ? 'bg-gray-400 cursor-not-allowed text-white' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isTesting ? 'Testing...' : 'Restart Testing'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('overview')}
                  className={`border-2 rounded-md p-2 hover:bg-gray-200 ${
                    activeTab === 'overview' ? 'bg-gray-100 border-blue-500' : ''
                  }`}
                >
                  Overview
                </button>
                <button 
                  onClick={() => setActiveTab('predictions')}
                  className={`border-2 rounded-md p-2 hover:bg-gray-200 ${
                    activeTab === 'predictions' ? 'bg-gray-100 border-blue-500' : ''
                  }`}
                >
                  Predictions
                </button>
                <button 
                  onClick={() => setActiveTab('metrics')}
                  className={`border-2 rounded-md p-2 hover:bg-gray-200 ${
                    activeTab === 'metrics' ? 'bg-gray-100 border-blue-500' : ''
                  }`}
                >
                  Metrics
                </button>
                <button 
                  onClick={() => setActiveTab('config')}
                  className={`border-2 rounded-md p-2 hover:bg-gray-200 ${
                    activeTab === 'config' ? 'bg-gray-100 border-blue-500' : ''
                  }`}
                >
                  Config
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {renderTabContent()}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select an experiment to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Experiments