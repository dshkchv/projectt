import { useState, useEffect } from "react";
import { BACKEND_URL } from "./config.ts";

interface Dataset {
    id: number;
    name: string;
    description?: string;
    created_at: string;
}

interface DS_ManagerProps {
    onDatasetSelect: (dataset: Dataset | null, datasetData?: any) => void;
    onDatasetDelete: (dataset: Dataset) => void;
    onDatasetCreate: (name: string) => void;
    onClearChart: () => void;
    currentDataset: Dataset | null;
    hasChartData: boolean;
    chartData?: any;
}

function DS_Manager({ 
    onDatasetSelect, 
    onDatasetDelete, 
    onDatasetCreate, 
    onClearChart, 
    currentDataset, 
    hasChartData,
    chartData 
}: DS_ManagerProps) {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(false);
    const [newDatasetName, setNewDatasetName] = useState<string>("");
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Загрузка датасетов из базы данных
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

    useEffect(() => {
        loadDatasets();
    }, []);

    const handleDatasetSelectWithData = async (dataset: Dataset) => {
        try {
            // Загружаем данные датасета
            const dataResponse = await fetch(`${BACKEND_URL}/api/datasets/${dataset.id}/load-chart`);
            if (dataResponse.ok) {
                const datasetData = await dataResponse.json();
                console.log('Loaded dataset data from database:', datasetData);
                
                // Преобразуем данные в формат, понятный DefaultChart
                const formattedData = transformDatabaseDataToChartFormat(datasetData, dataset.name);
                console.log('Formatted dataset data:', formattedData);
                
                // Передаем данные вместе с датасетом
                onDatasetSelect(dataset, formattedData);
            } else if (dataResponse.status !== 404) {
                console.error('Error loading dataset data:', await dataResponse.text());
                // Если не удалось загрузить данные, передаем только датасет
                onDatasetSelect(dataset);
            } else {
                // Если данных нет, передаем только датасет
                onDatasetSelect(dataset);
            }
        } catch (error) {
            console.error('Error loading dataset data:', error);
            onDatasetSelect(dataset);
        }
        setIsOpen(false);
    };

    // Функция для преобразования данных из базы в формат графика
    const transformDatabaseDataToChartFormat = (databaseData: any, datasetName: string) => {
        console.log('Transforming database data:', databaseData);
        
        // Если данные уже в правильном формате (из chart_data)
        if (databaseData.chart_data) {
            return {
                ticker: datasetName,
                source: 'database',
                interval: databaseData.chart_data.interval || '1d',
                data: databaseData.chart_data.data || [],
                count: databaseData.chart_data.data?.length || 0,
                chart_data: databaseData.chart_data.chart_data || []
            };
        }
        
        // Если данные в другом формате, пытаемся адаптировать
        if (databaseData.data) {
            return {
                ticker: datasetName,
                source: 'database',
                interval: databaseData.interval || '1d',
                data: databaseData.data,
                count: databaseData.data.length || 0,
                chart_data: databaseData.chart_data || []
            };
        }
        
        // Если структура неизвестна, возвращаем как есть
        console.warn('Unknown database data format:', databaseData);
        return databaseData;
    };

    const handleDelete = async () => {
        if (currentDataset) {
            if (!confirm(`Are you sure you want to delete dataset "${currentDataset.name}"?`)) {
                return;
            }

            try {
                const response = await fetch(`${BACKEND_URL}/api/datasets/${currentDataset.id}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    setDatasets(prev => prev.filter(ds => ds.id !== currentDataset.id));
                    onDatasetDelete(currentDataset);
                    onClearChart(); // Вызываем очистку графика
                    alert('Dataset deleted successfully!');
                } else {
                    const errorData = await response.json();
                    alert(`Error deleting dataset: ${errorData.detail || errorData.error}`);
                }
            } catch (error) {
                console.error('Error deleting dataset:', error);
                alert('Error deleting dataset');
            }
        } else {
            // Если нет текущего датасета, но есть данные графика - очищаем график
            onClearChart();
        }
    };

    const handleCreate = async () => {
        if (!newDatasetName.trim()) {
            alert('Please enter dataset name');
            return;
        }

        if (!chartData) {
            alert('No chart data available to save. Please load chart data first by clicking "Apply".');
            return;
        }

        setIsLoading(true);
        try {
            console.log('Creating dataset with data:', chartData);

            // 1. Создаем запись датасета в базе данных
            const createResponse = await fetch(`${BACKEND_URL}/api/datasets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: newDatasetName.trim(),
                    description: `Dataset created from chart data - ${new Date().toLocaleString()}`
                })
            });

            if (!createResponse.ok) {
                const errorData = await createResponse.json();
                throw new Error(errorData.detail || errorData.error || 'Failed to create dataset');
            }

            const createdDataset = await createResponse.json();
            console.log('Dataset created:', createdDataset);
            
            // 2. Сохраняем данные графика в датасет
            const saveDataResponse = await fetch(`${BACKEND_URL}/api/datasets/${createdDataset.id}/data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chart_data: chartData,
                    metadata: {
                        created_at: new Date().toISOString(),
                        source: 'chart_export',
                        data_points: chartData.data ? chartData.data.length : 0,
                        interval: chartData.interval,
                        symbol: chartData.dataset,
                        date_range: {
                            start: chartData.start_date,
                            end: chartData.end_date
                        }
                    }
                })
            });

            if (!saveDataResponse.ok) {
                const errorData = await saveDataResponse.json();
                // Если не удалось сохранить данные, удаляем созданный датасет
                await fetch(`${BACKEND_URL}/api/datasets/${createdDataset.id}`, {
                    method: 'DELETE'
                });
                throw new Error(`Failed to save chart data: ${errorData.error || 'Unknown error'}`);
            }

            const saveResult = await saveDataResponse.json();
            console.log('Data saved:', saveResult);

            // 3. Обновляем список датасетов
            setDatasets(prev => [...prev, createdDataset]);
            setNewDatasetName("");
            setIsCreateDialogOpen(false);
            onDatasetCreate(newDatasetName.trim());
            
            // Загружаем данные созданного датасета для отображения
            handleDatasetSelectWithData(createdDataset);
            
            alert(`Dataset "${createdDataset.name}" created successfully with ${chartData.data?.length || 0} data points!`);

        } catch (error) {
            console.error('Error creating dataset:', error);
            alert(`Error creating dataset: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const isDeleteActive = currentDataset || hasChartData;

    return (
        <div className="w-full flex items-center justify-between px-2 py-2">
            <div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm
                    text-gray-700 border-2 border-gray-300 border-dotted"
                >
                    Choose DataSet
                </button>
                {isOpen && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50">
                        <div className="bg-white p-6 rounded-xl shadow-lg w-80 max-h-96 overflow-y-auto">
                            <h2 className="text-lg mb-4">Select Dataset</h2>

                            {datasets.length === 0 ? (
                                <div className="text-center text-gray-500 py-4">
                                    No datasets available
                                </div>
                            ) : (
                                <ul className="space-y-2 mb-4">
                                    {datasets.map((dataset) => (
                                        <li key={dataset.id}>
                                            <button
                                                onClick={() => handleDatasetSelectWithData(dataset)}
                                                className={`w-full text-left px-3 py-2 rounded ${
                                                    currentDataset?.id === dataset.id
                                                        ? "bg-blue-500 text-white"
                                                        : "bg-gray-100 hover:bg-gray-200"
                                                }`}
                                            >
                                                <div className="font-medium">{dataset.name}</div>
                                                {dataset.description && (
                                                    <div className="text-xs text-gray-600 mt-1">
                                                        {dataset.description}
                                                    </div>
                                                )}
                                                <div className="text-xs text-gray-500 mt-1">
                                                    Created: {new Date(dataset.created_at).toLocaleDateString()}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div className="flex justify-end space-x-2">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <button
                    onClick={handleDelete}
                    disabled={!isDeleteActive}
                    className={`px-3 py-1 rounded-md text-sm text-white ${
                        !isDeleteActive 
                            ? "bg-gray-400 cursor-not-allowed" 
                            : "bg-red-700 hover:bg-red-800"
                    }`}
                >
                    {currentDataset ? "Delete" : "Clear"}
                </button>

                <button
                    onClick={() => setIsCreateDialogOpen(true)}
                    disabled={!hasChartData || !chartData}
                    className={`px-3 py-1 rounded-md text-sm text-white ${
                        !hasChartData || !chartData
                            ? "bg-gray-400 cursor-not-allowed" 
                            : "bg-green-700 hover:bg-green-800"
                    }`}
                >
                    New
                </button>
            </div>

            {/* Диалог создания нового датасета */}
            {isCreateDialogOpen && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50">
                    <div className="bg-white p-6 rounded-xl shadow-lg w-96">
                        <h2 className="text-lg mb-4">Create New Dataset</h2>
                        
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Dataset Name
                            </label>
                            <input
                                type="text"
                                value={newDatasetName}
                                onChange={(e) => setNewDatasetName(e.target.value)}
                                placeholder="Enter dataset name"
                                className="w-full px-3 py-2 border-2 border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                                autoFocus
                            />
                        </div>

                        <div className="text-sm text-gray-600 mb-4 p-3 bg-gray-50 rounded-md">
                            <p><strong>Data to be saved:</strong></p>
                            <ul className="list-disc list-inside mt-1">
                                <li>Symbol: {chartData?.dataset}</li>
                                <li>Interval: {chartData?.interval}</li>
                                <li>Data points: {chartData?.data?.length || 0}</li>
                                <li>Date range: {chartData?.start_date ? new Date(chartData.start_date).toLocaleDateString() : 'N/A'} to {chartData?.end_date ? new Date(chartData.end_date).toLocaleDateString() : 'N/A'}</li>
                            </ul>
                        </div>

                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => {
                                    setIsCreateDialogOpen(false);
                                    setNewDatasetName("");
                                }}
                                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!newDatasetName.trim() || isLoading}
                                className={`px-4 py-2 rounded text-white ${
                                    !newDatasetName.trim() || isLoading
                                        ? "bg-gray-400 cursor-not-allowed"
                                        : "bg-green-600 hover:bg-green-700"
                                }`}
                            >
                                {isLoading ? "Creating..." : "Create Dataset"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DS_Manager;