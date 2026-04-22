import Hat from "./Hat";
import DefaultChart from "./DefaultChart";
import DS_Manager from "./DS_Manager";
import NewsSlider from "./NewsSlider";
import { useState, useCallback, useRef } from "react";

interface Dataset {
    id: number;
    name: string;
    description?: string;
    created_at: string;
}

interface NewsItem {
    id: number;
    pub_id: string;
    pub_time: string;
    author: string | null;
    title: string | null;
    description: string | null;
    url: string | null;
    parsed_at: string | null;
    ticker: string | null;
}

function DataSets() {
    const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
    const [datasetData, setDatasetData] = useState<any>(null);
    const [hasChartData, setHasChartData] = useState<boolean>(false);
    const [currentChartData, setCurrentChartData] = useState<any>(null);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isLoadingNews, setIsLoadingNews] = useState<boolean>(false);
    
    const chartRef = useRef<any>(null);

    const handleDatasetSelect = useCallback((dataset: Dataset | null, datasetData?: any) => {
        setSelectedDataset(dataset);
        if (dataset && datasetData) {
            setDatasetData(datasetData);
            setHasChartData(true);
        } else {
            setDatasetData(null);
        }
    }, []);

    const handleDatasetDelete = useCallback((dataset: Dataset) => {
        console.log(`Dataset ${dataset.name} deleted`);
        setSelectedDataset(null);
        setDatasetData(null);
        setCurrentChartData(null);
        setHasChartData(false);
        setNews([]);
    }, []);

    const handleDatasetCreate = useCallback((name: string) => {
        console.log(`Creating dataset: ${name}`);
    }, []);

    const handleChartDataChange = useCallback((hasData: boolean, chartData?: any) => {
        setHasChartData(hasData);
        setCurrentChartData(chartData || null);
    }, []);

    const handleNewsLoaded = useCallback((newsData: NewsItem[]) => {
        console.log('News loaded in DataSets:', newsData.length);
        setNews(newsData);
        setIsLoadingNews(false);
    }, []);

    const handleClearChart = useCallback(() => {
        console.log('Clearing chart from DataSets');
        if (chartRef.current && chartRef.current.clearChart) {
            chartRef.current.clearChart();
        }
        setSelectedDataset(null);
        setDatasetData(null);
        setCurrentChartData(null);
        setHasChartData(false);
        setNews([]);
    }, []);

    const handleDownloadData = useCallback((chartData: any) => {
        if (!chartData) return;

        const filename = `${chartData.dataset}_${chartData.interval}_${new Date().toISOString().split('T')[0]}.json`;
        
        const dataToDownload = {
            ...chartData,
            news: news,
            exported_at: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(dataToDownload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`Data downloaded: ${filename}`);
    }, [news]);

    const getCurrentReturn = (): number => {
        if (!currentChartData?.data || currentChartData.data.length < 2) return 0;
        
        const data = currentChartData.data;
        const firstPrice = data[0]?.close || data[0]?.value || 0;
        const lastPrice = data[data.length - 1]?.close || data[data.length - 1]?.value || 0;
        
        if (firstPrice === 0) return 0;
        return ((lastPrice - firstPrice) / firstPrice) * 100;
    };

    // Временно добавим отладку
    console.log('DataSets render:', { 
        newsCount: news.length, 
        selectedDataset: selectedDataset?.name,
        chartData: currentChartData 
    });

    return (
        <div className="main-page">
            <Hat />
            <DS_Manager 
                onDatasetSelect={handleDatasetSelect}
                onDatasetDelete={handleDatasetDelete}
                onDatasetCreate={handleDatasetCreate}
                onClearChart={handleClearChart}
                currentDataset={selectedDataset}
                hasChartData={hasChartData}
                chartData={currentChartData}
            />
            <DefaultChart 
                ref={chartRef}
                selectedDataset={selectedDataset}
                datasetData={datasetData}
                onDatasetSelect={handleDatasetSelect}
                onDatasetDelete={handleDatasetDelete}
                onDatasetCreate={handleDatasetCreate}
                onChartDataChange={handleChartDataChange}
                onClearChart={handleClearChart}
                onDownloadData={handleDownloadData}
                onNewsLoaded={handleNewsLoaded}
            />
            {/* Слайдер новостей - ПЕРЕДАЕМ TICKER */}
            <div className="w-full px-2 py-2">
                <NewsSlider 
                    news={news} 
                    isLoading={isLoadingNews}
                    ticker={selectedDataset?.name || currentChartData?.dataset || 'AAPL'}  // Принудительно передаем тикер
                    currentReturn={0}  // Временно 0 для теста
                />
            </div>
        </div>
    );
}

export default DataSets;