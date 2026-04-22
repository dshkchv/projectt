import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from "react";
import { createChart, CandlestickSeries, AreaSeries, LineSeries } from "lightweight-charts";
import type { CandlestickData, AreaData as LWCAreaData, UTCTimestamp } from "lightweight-charts";

import { DATALOADER_URL, NEWS_URL, TICKERLIST} from "./config.ts";

function formatDate(
    timestamp: number,
): string {
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

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

interface DefaultChartProps {
    selectedDataset: Dataset | null;
    datasetData?: any;
    onDatasetSelect: (dataset: Dataset | null) => void;
    onDatasetDelete: (dataset: Dataset) => void;
    onDatasetCreate: (name: string) => void;
    onChartDataChange: (hasData: boolean, chartData?: any) => void;
    onClearChart: () => void;
    onDownloadData: (chartData: any) => void;
    onNewsLoaded?: (news: NewsItem[]) => void;
}

interface CandleData extends CandlestickData<UTCTimestamp> {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface AreaData extends LWCAreaData<UTCTimestamp> {
    time: UTCTimestamp;
    value: number;
}

const DefaultChart = forwardRef(({ 
    selectedDataset, 
    datasetData,
    onDatasetSelect, 
    onChartDataChange, 
    onDownloadData,
    onNewsLoaded
}: DefaultChartProps, ref) => {
    const candlesRef = useRef<HTMLDivElement>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const candlesChartRef = useRef<any>(null);
    const areaChartRef = useRef<any>(null);

    const [tempSelected, setTempSelected] = useState<string | null>(null);
    const [tempStartDate, setTempStartDate] = useState(Date.now() - 1000 * 60 * 60 * 24 * 7);
    const [tempEndDate, setTempEndDate] = useState(Date.now());
    const [tempInterval, setTempInterval] = useState("1h");
    
    const [confirmedSelected, setConfirmedSelected] = useState<string | null>(null);
    const [confirmedStartDate, setConfirmedStartDate] = useState(tempStartDate);
    const [confirmedEndDate, setConfirmedEndDate] = useState(tempEndDate);
    const [confirmedInterval, setConfirmedInterval] = useState("1h");

    const [isDatasetOpen, setIsDatasetOpen] = useState(false);
    const [data, setData] = useState<any>(undefined);
    const [error, setError] = useState<any>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [dataSource, setDataSource] = useState<'dataloader' | 'database' | null>(null);
    
    const [news, setNews] = useState<NewsItem[]>([]);
    const [hasTickerColumn, setHasTickerColumn] = useState<boolean | null>(null);

    const availableDatasets = TICKERLIST;

    useEffect(() => {
        const checkTickerColumn = async () => {
            try {
                const response = await fetch(`${NEWS_URL}/api/news/has-ticker-column`);
                if (response.ok) {
                    const data = await response.json();
                    setHasTickerColumn(data.has_ticker_column);
                }
            } catch (error) {
                console.error('Error checking ticker column:', error);
                setHasTickerColumn(false);
            }
        };
        checkTickerColumn();
    }, []);

    useImperativeHandle(ref, () => ({
        getChartData: () => data,
        clearChart: () => {
            clearCharts();
        },
        getNews: () => news
    }));

    const handleDatasetSelect = (dataset: string) => {
        setTempSelected(dataset);
        setIsDatasetOpen(false);
    };

    const loadNews = useCallback(async (ticker: string | null, startDate: number, endDate: number) => {
        try {
            let url = `${NEWS_URL}/api/news?`;
            
            if (hasTickerColumn && ticker) {
                url += `ticker=${ticker}&`;
            }
            
            url += `start_date=${new Date(startDate).toISOString()}&`;
            url += `end_date=${new Date(endDate).toISOString()}`;
            
            console.log('Loading news from:', url);
            
            const response = await fetch(url);
            if (response.ok) {
                const newsData = await response.json();
                
                const filteredNews = newsData.filter((item: NewsItem) => {
                    if (!item.parsed_at) return false;
                    const newsTime = new Date(item.parsed_at).getTime();
                    return newsTime >= startDate && newsTime <= endDate;
                });
                
                filteredNews.sort((a: NewsItem, b: NewsItem) => {
                    return new Date(a.parsed_at!).getTime() - new Date(b.parsed_at!).getTime();
                });
                
                console.log('News loaded:', filteredNews.length, 'items');
                console.log('News data sample:', filteredNews.slice(0, 3));
                setNews(filteredNews);
                if (onNewsLoaded) {
                    onNewsLoaded(filteredNews);
                }
            } else {
                console.error('Error loading news:', response.status);
                setNews([]);
                if (onNewsLoaded) {
                    onNewsLoaded([]);
                }
            }
        } catch (error) {
            console.error('Error loading news:', error);
            setNews([]);
            if (onNewsLoaded) {
                onNewsLoaded([]);
            }
        }
    }, [hasTickerColumn, onNewsLoaded]);

    const applyParameters = () => {
        if (!tempSelected) return;
        
        setConfirmedSelected(tempSelected);
        setConfirmedStartDate(tempStartDate);
        setConfirmedEndDate(tempEndDate);
        setConfirmedInterval(tempInterval);
        setDataSource('dataloader');
        setError(undefined);
        
        if (selectedDataset) {
            onDatasetSelect(null);
        }
        
        loadNews(tempSelected, tempStartDate, tempEndDate);
    };

    const handleDownload = () => {
        if (!data) return;
        
        const chartData = {
            data: data.data || data.chart_data || data,
            count: data.count,
            interval: confirmedInterval,
            start_date: new Date(confirmedStartDate).toISOString(),
            end_date: new Date(confirmedEndDate).toISOString(),
            dataset: confirmedSelected,
            metadata: {
                downloaded_at: new Date().toISOString(),
                data_points: data.data ? data.data.length : (data.chart_data ? data.chart_data.length : 0),
                source: dataSource,
                news_count: news.length
            }
        };
        
        onDownloadData(chartData);
    };

    const clearCharts = useCallback(() => {
        console.log('Clearing charts...');
        setData(undefined);
        setConfirmedSelected(null);
        setTempSelected(null);
        setTempStartDate(Date.now() - 1000 * 60 * 60 * 24 * 7);
        setTempEndDate(Date.now());
        setTempInterval("1h");
        setConfirmedStartDate(Date.now() - 1000 * 60 * 60 * 24 * 7);
        setConfirmedEndDate(Date.now());
        setConfirmedInterval("1h");
        setDataSource(null);
        setNews([]);
        if (onNewsLoaded) {
            onNewsLoaded([]);
        }
        
        if (candlesChartRef.current) {
            candlesChartRef.current.remove();
            candlesChartRef.current = null;
        }
        if (areaChartRef.current) {
            areaChartRef.current.remove();
            areaChartRef.current = null;
        }
        
        onChartDataChange(false);
    }, [onChartDataChange, onNewsLoaded]);

    useEffect(() => {
        (window as any).clearChart = clearCharts;
        
        return () => {
            if ((window as any).clearChart === clearCharts) {
                delete (window as any).clearChart;
            }
        };
    }, []);

    useEffect(() => {
        if (selectedDataset && datasetData) {
            setData(datasetData);
            setConfirmedSelected(selectedDataset.name);
            setTempSelected(selectedDataset.name);
            setDataSource('database');
            setError(undefined);
            setIsLoading(false);
            
            let startDate = Date.now() - 1000 * 60 * 60 * 24 * 30;
            let endDate = Date.now();
            
            if (datasetData.metadata) {
                if (datasetData.metadata.date_range) {
                    startDate = new Date(datasetData.metadata.date_range.start).getTime();
                    endDate = new Date(datasetData.metadata.date_range.end).getTime();
                    
                    setConfirmedStartDate(startDate);
                    setConfirmedEndDate(endDate);
                    setTempStartDate(startDate);
                    setTempEndDate(endDate);
                }
                if (datasetData.metadata.interval) {
                    setConfirmedInterval(datasetData.metadata.interval);
                    setTempInterval(datasetData.metadata.interval);
                }
            } else if (datasetData.interval) {
                setConfirmedInterval(datasetData.interval);
                setTempInterval(datasetData.interval);
            }
            
            loadNews(selectedDataset.name, startDate, endDate);
        } else if (!selectedDataset && !confirmedSelected) {
            clearCharts();
            setDataSource(null);
            setNews([]);
        }
    }, [selectedDataset, datasetData, clearCharts, confirmedSelected, loadNews]);

    useEffect(() => {
        if (data && !isLoading) {
            const chartData = {
                data: data.data,
                count: data.count,
                interval: confirmedInterval,
                start_date: new Date(confirmedStartDate).toISOString(),
                end_date: new Date(confirmedEndDate).toISOString(),
                dataset: confirmedSelected,
                metadata: {
                    loaded_at: new Date().toISOString(),
                    data_points: data.data ? data.data.length : 0,
                    source: dataSource,
                    news_count: news.length
                }
            };
            onChartDataChange(true, chartData);
        } else if (!data && !isLoading && confirmedSelected) {
            onChartDataChange(false);
        }
    }, [data, isLoading, confirmedInterval, confirmedStartDate, confirmedEndDate, confirmedSelected, onChartDataChange, dataSource, news.length]);

    useEffect(() => {
        if (!confirmedSelected || dataSource !== 'dataloader') {
            return;
        }

        setData(undefined);
        setError(undefined);
        setIsLoading(true);

        fetch(`${DATALOADER_URL}/api/stocks/${confirmedSelected}/history?start_date=${formatDate(confirmedStartDate)}&end_date=${formatDate(confirmedEndDate)}&interval=${confirmedInterval}`)
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(`Ошибка ${response.status}`);
                }
            })
            .then(data => {
                console.log('Data received from dataloader:', data);
                setData(data);
                setError(undefined);
            })
            .catch(error => {
                console.error('Error fetching from dataloader:', error);
                setError(error);
                setData(undefined);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [confirmedSelected, confirmedStartDate, confirmedEndDate, confirmedInterval, dataSource]);

    const getCandleData = (): CandleData[] => {
        if (!data) return [];

        let candleData: CandleData[] = [];

        if (data.data && Array.isArray(data.data)) {
            candleData = data.data.map((item: any) => ({
                time: (Math.floor(new Date(item.datetime).getTime() / 1000) as UTCTimestamp),
                open: item.open || 0,
                high: item.high || 0,
                low: item.low || 0,
                close: item.close || 0
            }));
        }
        else if (data.chart_data && Array.isArray(data.chart_data)) {
            candleData = data.chart_data.map((item: any) => ({
                time: (Math.floor(new Date(item.datetime).getTime() / 1000) as UTCTimestamp),
                open: item.open || item.value || 0,
                high: item.high || item.value || 0,
                low: item.low || item.value || 0,
                close: item.close || item.value || 0
            }));
        }
        else if (Array.isArray(data) && data[0] && data[0].open !== undefined) {
            candleData = data.map((item: any) => ({
                time: (Math.floor(new Date(item.datetime).getTime() / 1000) as UTCTimestamp),
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close
            }));
        }

        candleData.sort((a, b) => (a.time as number) - (b.time as number));
        return candleData;
    };

    const getAreaData = (): AreaData[] => {
        if (!data) return [];

        let areaData: AreaData[] = [];

        if (data.data && Array.isArray(data.data)) {
            areaData = data.data.map((item: any) => ({
                time: (Math.floor(new Date(item.datetime).getTime() / 1000) as UTCTimestamp),
                value: item.close || 0
            }));
        }
        else if (data.chart_data && Array.isArray(data.chart_data)) {
            areaData = data.chart_data.map((item: any) => ({
                time: (Math.floor(new Date(item.datetime).getTime() / 1000) as UTCTimestamp),
                value: item.value || item.close || 0
            }));
        }
        
        areaData.sort((a, b) => (a.time as number) - (b.time as number));
        return areaData;
    };

    // Функция для создания маркеров новостей
    const createNewsMarkers = (chartData: AreaData[]) => {
        if (!news || news.length === 0 || chartData.length === 0) {
            console.log('No news or chart data for markers');
            return [];
        }

        console.log('Creating markers for', news.length, 'news items');
        console.log('Chart data range:', {
            start: new Date(chartData[0].time * 1000).toISOString(),
            end: new Date(chartData[chartData.length - 1].time * 1000).toISOString()
        });

        const markers: any[] = [];
        const timeToPrice = new Map<number, number>();
        
        chartData.forEach(point => {
            timeToPrice.set(point.time as number, point.value);
        });

        // Фильтруем новости, попадающие в диапазон графика
        const chartStartTime = chartData[0].time as number;
        const chartEndTime = chartData[chartData.length - 1].time as number;

        news.forEach((newsItem) => {
            if (!newsItem.parsed_at) return;
            
            const newsTime = Math.floor(new Date(newsItem.pub_time).getTime() / 1000);
            // Проверяем, что новость в пределах графика
            if (newsTime < chartStartTime || newsTime > chartEndTime) {
                return;
            }

            // Находим ближайшую точку на графике
            let closestTime = chartData[0].time as number;
            let minDiff = Math.abs(newsTime - closestTime);

            chartData.forEach(point => {
                const diff = Math.abs(newsTime - (point.time as number));
                if (diff < minDiff) {
                    minDiff = diff;
                    closestTime = point.time as number;
                }
            });

            // Если разница меньше 3 дней
            if (minDiff < 259200) {
                const price = timeToPrice.get(closestTime) || 0;
                
                // Определяем цвет
                let color = '#FF6B6B';
                const title = newsItem.title?.toLowerCase() || '';
                if (title.includes('рост') || title.includes('вырос') || title.includes('прибыль')) {
                    color = '#26a69a';
                } else if (title.includes('падение') || title.includes('упал') || title.includes('убыток')) {
                    color = '#ef5350';
                }

                markers.push({
                    time: closestTime,
                    position: 'aboveBar',
                    color: color,
                    shape: 'circle',
                    text: newsItem.title?.substring(0, 50) || 'News',
                    size: 2
                });
            }
        });

        // Удаляем дубликаты по времени
        const uniqueMarkers = markers.filter((marker, index, self) => 
            index === self.findIndex(m => m.time === marker.time)
        );

        console.log('Created', uniqueMarkers.length, 'unique news markers');
        return uniqueMarkers;
    };

    // Обновление свечного графика
    useEffect(() => {
        if (!candlesRef.current || !data || isLoading) {
            return;
        }

        if (candlesChartRef.current) {
            candlesChartRef.current.remove();
            candlesChartRef.current = null;
        }

        try {
            const candleData = getCandleData();
            const areaData = getAreaData();
            
            if (candleData.length === 0) return;

            const chart = createChart(candlesRef.current, {
                layout: { 
                    textColor: "black", 
                    background: { color: "white" },
                    fontSize: 12
                },
                width: candlesRef.current.clientWidth,
                height: 300,
                timeScale: {
                    timeVisible: true,
                    secondsVisible: confirmedInterval.includes('min'),
                }
            });

            const candlestickSeries = chart.addSeries(CandlestickSeries, { 
                upColor: '#26a69a', 
                downColor: '#ef5350', 
                borderVisible: false, 
                wickUpColor: '#26a69a', 
                wickDownColor: '#ef5350' 
            });

            candlestickSeries.setData(candleData);

            // Добавляем маркеры новостей
            const newsMarkers = createNewsMarkers(areaData);
            
            if (newsMarkers.length > 0) {
                try {
                    // @ts-ignore - setMarkers может не быть в типах, но работает
                    if (typeof candlestickSeries.setMarkers === 'function') {
                        candlestickSeries.setMarkers(newsMarkers);
                        console.log('Added', newsMarkers.length, 'markers to candles chart using setMarkers');
                    } else {
                        // Альтернативный способ - через отдельную серию
                        const markerSeries = chart.addSeries(LineSeries, {
                            color: '#FF6B6B',
                            lineWidth: 0,
                            pointMarkersVisible: true,
                            pointMarkersRadius: 4,
                            lastValueVisible: false,
                            priceLineVisible: false,
                        });
                        
                        const markerData = newsMarkers.map(m => ({
                            time: m.time,
                            value: areaData.find(d => d.time === m.time)?.value || 0
                        }));
                        
                        markerSeries.setData(markerData);
                        console.log('Added', markerData.length, 'markers using LineSeries');
                    }
                } catch (err) {
                    console.error('Error adding markers:', err);
                }
            }

            chart.timeScale().fitContent();
            candlesChartRef.current = chart;

        } catch (err) {
            console.error('Error creating candles chart:', err);
        }

        return () => {
            if (candlesChartRef.current) {
                candlesChartRef.current.remove();
                candlesChartRef.current = null;
            }
        };
    }, [data, confirmedInterval, isLoading, news]);

    // Обновление area графика
    useEffect(() => {
        if (!areaRef.current || !data || isLoading) {
            return;
        }

        if (areaChartRef.current) {
            areaChartRef.current.remove();
            areaChartRef.current = null;
        }

        try {
            const areaData = getAreaData();
            
            if (areaData.length === 0) return;

            const chart = createChart(areaRef.current, {
                layout: { 
                    textColor: "black", 
                    background: { color: "white" },
                    fontSize: 12
                },
                width: areaRef.current.clientWidth,
                height: 200,
                timeScale: {
                    timeVisible: true,
                    secondsVisible: confirmedInterval.includes('min'),
                }
            });

            const areaSeries = chart.addSeries(AreaSeries, { 
                lineColor: '#2962FF', 
                topColor: '#2962FF', 
                bottomColor: 'rgba(41, 98, 255, 0.28)' 
            });

            areaSeries.setData(areaData);

            // Добавляем маркеры новостей
            const newsMarkers = createNewsMarkers(areaData);
            
            if (newsMarkers.length > 0) {
                try {
                    // @ts-ignore
                    if (typeof areaSeries.setMarkers === 'function') {
                        areaSeries.setMarkers(newsMarkers);
                        console.log('Added', newsMarkers.length, 'markers to area chart using setMarkers');
                    } else {
                        const markerSeries = chart.addSeries(LineSeries, {
                            color: '#FF6B6B',
                            lineWidth: 0,
                            pointMarkersVisible: true,
                            pointMarkersRadius: 4,
                            lastValueVisible: false,
                            priceLineVisible: false,
                        });
                        
                        const markerData = newsMarkers.map(m => ({
                            time: m.time,
                            value: areaData.find(d => d.time === m.time)?.value || 0
                        }));
                        
                        markerSeries.setData(markerData);
                        console.log('Added', markerData.length, 'markers using LineSeries');
                    }
                } catch (err) {
                    console.error('Error adding markers:', err);
                }
            }

            chart.timeScale().fitContent();
            areaChartRef.current = chart;

        } catch (err) {
            console.error('Error creating area chart:', err);
        }

        return () => {
            if (areaChartRef.current) {
                areaChartRef.current.remove();
                areaChartRef.current = null;
            }
        };
    }, [data, confirmedInterval, isLoading, news]);

    useEffect(() => {
        return () => {
            if (candlesChartRef.current) {
                candlesChartRef.current.remove();
            }
            if (areaChartRef.current) {
                areaChartRef.current.remove();
            }
        };
    }, []);

    const hasChanges = 
        tempSelected !== confirmedSelected ||
        tempStartDate !== confirmedStartDate ||
        tempEndDate !== confirmedEndDate ||
        tempInterval !== confirmedInterval;

    return (
        <>
            <div className="w-full flex items-center justify-center border-black rounded-md p-5 border-b-0 border-l-2 border-r-2 border-t-2">
                <div>
                    {confirmedSelected 
                        ? `Chart - ${confirmedSelected} - ${confirmedInterval} interval${selectedDataset ? ` (Dataset: ${selectedDataset.name})` : ' (Live Data)'}${news.length > 0 ? ` - ${news.length} news` : ''}`
                        : tempSelected
                        ? `Ready to load: ${tempSelected} - ${tempInterval} (Click Apply)`
                        : "Please select parameters and click 'Apply' to view the chart"
                    }
                </div>
            </div>
            
            {error && (
                <div className="w-full flex items-center justify-center border-black rounded-md p-5 border-b-0 border-l-2 border-r-2 border-t-2">
                    <div className="text-red-700">Error: {error.message}</div>
                </div>
            )}
            
            {confirmedSelected ? (
                <>
                    {isLoading ? (
                        <div className="w-full flex items-center justify-center border-black rounded-md p-5 border-b-0 border-l-2 border-r-2 border-t-2" style={{ minHeight: '500px' }}>
                            <div>Downloading data for {confirmedSelected}...</div>
                        </div>
                    ) : data ? (
                        <>
                            <div className="w-full flex items-center justify-center border-black rounded-md p-5 border-b-0 border-l-2 border-r-2 border-t-2">
                                <div ref={candlesRef} style={{ width: "100%", height: "300px", margin: "0" }}/>
                            </div>
                            <div className="w-full flex items-center justify-center border-black rounded-md p-5 border-b-0 border-l-2 border-r-2 border-t-2">
                                <div ref={areaRef} style={{ width: "100%", height: "200px", margin: "0" }}/>
                            </div>
                            {news.length > 0 && (
                                <div className="w-full flex items-center justify-center border-black rounded-md p-2 border-b-0 border-l-2 border-r-2 border-t-2">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1">
                                            <div className="w-3 h-3 rounded-full bg-green-400"></div>
                                            <span className="text-xs text-gray-600">Positive</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                                            <span className="text-xs text-gray-600">Negative</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-3 h-3 rounded-full bg-red-300"></div>
                                            <span className="text-xs text-gray-600">Other</span>
                                        </div>
                                        <span className="text-xs text-gray-500">Total: {news.length} news</span>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="w-full flex items-center justify-center border-black rounded-md p-5 border-b-0 border-l-2 border-r-2 border-t-2" style={{ minHeight: '500px' }}>
                            <div>No data available for {confirmedSelected}</div>
                        </div>
                    )}
                </>
            ) : (
                <div className="w-full flex items-center justify-center border-black rounded-md p-5 border-b-0 border-l-2 border-r-2 border-t-2" style={{ minHeight: '500px' }}>
                    <div>
                        {tempSelected 
                            ? `Selected: ${tempSelected} - ${tempInterval}. Click 'Apply' to load data.`
                            : "Please select parameters and click 'Apply' to view the chart"
                        }
                    </div>
                </div>
            )}

            <div className="w-full flex items-center px-2 py-2 border-black rounded-md border-t-2 border-l-2 border-r-2 border-b-2 gap-2">
                <div className="relative">
                    <button
                        onClick={() => setIsDatasetOpen(!isDatasetOpen)}
                        className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm text-gray-700 border-2 border-gray-300 border-dotted flex items-center gap-2 min-w-[140px] justify-between"
                    >
                        <span>{tempSelected || "Select Ticker"}</span>
                        <span className="text-xs">▼</span>
                    </button>
                    
                    {isDatasetOpen && (
                        <div className="absolute bottom-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 min-w-full">
                            {availableDatasets.map((dataset) => (
                                <button
                                    key={dataset}
                                    onClick={() => handleDatasetSelect(dataset)}
                                    className={`w-full text-left px-3 py-2 hover:bg-gray-100 text-sm ${
                                        tempSelected === dataset ? "bg-blue-100 text-blue-700" : ""
                                    }`}
                                >
                                    {dataset}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <input
                    type="date"
                    value={formatDate(tempStartDate)}
                    onChange={(e) => setTempStartDate(new Date(e.target.value).getTime())}
                    className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm text-gray-700 border-2 border-gray-300 border-dotted"
                />
                <input
                    type="date"
                    value={formatDate(tempEndDate)}
                    onChange={(e) => setTempEndDate(new Date(e.target.value).getTime())}
                    className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm text-gray-700 border-2 border-gray-300 border-dotted"
                />
                <select
                    value={tempInterval}
                    onChange={(e) => setTempInterval(e.target.value)}
                    className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm text-gray-700 border-2 border-gray-300 border-dotted"
                >
                    <option value="1min">1 minute</option>
                    <option value="5min">5 minutes</option>
                    <option value="10min">10 minutes</option>
                    <option value="15min">15 minutes</option>
                    <option value="30min">30 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="1d">1 day</option>
                </select>

                <button
                    onClick={applyParameters}
                    disabled={!tempSelected || !hasChanges}
                    className={`px-4 py-1 rounded-md text-sm font-medium ${
                        !tempSelected || !hasChanges
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                >
                    Apply
                </button>

                <button
                    onClick={handleDownload}
                    disabled={!data || isLoading}
                    className={`px-4 py-1 rounded-md text-sm font-medium ${
                        !data || isLoading
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700 text-white"
                    }`}
                >
                    Download
                </button>
            </div>
        </>
    );
});

export default DefaultChart;