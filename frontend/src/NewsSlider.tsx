// NewsSlider.tsx - полная обновленная версия с отладкой
import { useState, useMemo } from 'react';

// Временно хардкодим URL для теста
const NEWS_URL = 'http://localhost:8002';

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

interface NewsSliderProps {
    news: NewsItem[];
    isLoading: boolean;
    ticker?: string;
    currentReturn?: number;
}

interface AnalysisResult {
    analysis: string;
    source: string;
    error?: string;
}

function NewsSlider({ news, isLoading, ticker, currentReturn = 0 }: NewsSliderProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [analyzingNewsId, setAnalyzingNewsId] = useState<number | null>(null);
    const [analysisResults, setAnalysisResults] = useState<Map<number, AnalysisResult>>(new Map());
    
    // Добавим отладочный вывод
    const [debugInfo, setDebugInfo] = useState<string>('');

    const MAX_VISIBLE_DOTS = 15;

    const visibleDots = useMemo(() => {
        if (news.length <= MAX_VISIBLE_DOTS) {
            return news.map((_, idx) => idx);
        }

        const dots: (number | string)[] = [];
        const halfVisible = Math.floor(MAX_VISIBLE_DOTS / 2);
        
        let startIdx = Math.max(0, currentIndex - halfVisible);
        let endIdx = Math.min(news.length - 1, startIdx + MAX_VISIBLE_DOTS - 1);
        
        if (endIdx === news.length - 1) {
            startIdx = Math.max(0, endIdx - MAX_VISIBLE_DOTS + 1);
        }

        if (startIdx > 0) {
            dots.push(0);
            if (startIdx > 1) {
                dots.push('...');
            }
        }

        for (let i = startIdx; i <= endIdx; i++) {
            if (!dots.includes(i)) {
                dots.push(i);
            }
        }

        if (endIdx < news.length - 1) {
            if (endIdx < news.length - 2) {
                dots.push('...');
            }
            dots.push(news.length - 1);
        }

        return dots;
    }, [news.length, currentIndex]);

    const analyzeNews = async (newsItem: NewsItem) => {
        console.log('Analyze button clicked for news:', newsItem.id);
        setDebugInfo(`Starting analysis for news ${newsItem.id}...`);
        setAnalyzingNewsId(newsItem.id);
        
        try {
            const requestBody = {
                news: {
                    title: newsItem.title,
                    description: newsItem.description,
                    pub_time: newsItem.pub_time,
                },
                ticker: ticker || newsItem.ticker || 'UNKNOWN',
                current_return: currentReturn
            };
            
            console.log('Sending request to:', `${NEWS_URL}/api/news/analyze`);
            console.log('Request body:', requestBody);
            setDebugInfo(`Sending request to ${NEWS_URL}/api/news/analyze`);
            
            const response = await fetch(`${NEWS_URL}/api/news/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });
            
            console.log('Response status:', response.status);
            setDebugInfo(`Response status: ${response.status}`);
            
            if (response.ok) {
                const result: AnalysisResult = await response.json();
                console.log('Analysis result:', result);
                setDebugInfo(`Analysis received from ${result.source}`);
                
                setAnalysisResults(prev => {
                    const newMap = new Map(prev);
                    newMap.set(newsItem.id, result);
                    return newMap;
                });
            } else {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                setDebugInfo(`Error: ${response.status} - ${errorText}`);
                
                setAnalysisResults(prev => {
                    const newMap = new Map(prev);
                    newMap.set(newsItem.id, { 
                        analysis: '', 
                        source: 'error',
                        error: `Server error: ${response.status}`
                    });
                    return newMap;
                });
            }
        } catch (err) {
            console.error('Error analyzing news:', err);
            setDebugInfo(`Network error: ${err}`);
            
            setAnalysisResults(prev => {
                const newMap = new Map(prev);
                newMap.set(newsItem.id, { 
                    analysis: '', 
                    source: 'error',
                    error: `Network error: ${err}`
                });
                return newMap;
            });
        } finally {
            setAnalyzingNewsId(null);
        }
    };

    // Отладочный вывод в консоль при монтировании
    console.log('NewsSlider rendered with:', { 
        newsCount: news.length, 
        isLoading, 
        ticker, 
        currentReturn,
        newsUrl: NEWS_URL
    });

    if (isLoading) {
        return (
            <div className="w-full border-black rounded-md p-4 border-2 bg-gray-50">
                <div className="text-center text-gray-500">Loading news...</div>
            </div>
        );
    }

    if (!news || news.length === 0) {
        return (
            <div className="w-full border-black rounded-md p-4 border-2 bg-gray-50">
                <div className="text-center text-gray-500">No news available for this period</div>
                {/* Кнопка для теста */}
                <button 
                    onClick={() => console.log('Test button clicked')}
                    className="mt-2 px-4 py-2 bg-gray-200 rounded"
                >
                    Test Click
                </button>
            </div>
        );
    }

    const currentNews = news[currentIndex];
    const currentAnalysis = analysisResults.get(currentNews.id);
    const isAnalyzingCurrent = analyzingNewsId === currentNews.id;

    const goToPrevious = () => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : news.length - 1));
    };

    const goToNext = () => {
        setCurrentIndex((prev) => (prev < news.length - 1 ? prev + 1 : 0));
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'N/A';
        try {
            return new Date(dateStr).toLocaleString('ru-RU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    const getNewsType = (title: string | null, description: string | null): 'positive' | 'negative' | 'neutral' => {
        const text = ((title || '') + ' ' + (description || '')).toLowerCase();
        if (text.includes('рост') || text.includes('вырос') || text.includes('прибыль')) {
            return 'positive';
        } else if (text.includes('падение') || text.includes('упал') || text.includes('убыток')) {
            return 'negative';
        }
        return 'neutral';
    };

    const newsType = getNewsType(currentNews.title, currentNews.description);

    return (
        <div className="w-full border-black rounded-md border-2 bg-gray-50 overflow-hidden">
            {/* Отладочная информация */}
            {debugInfo && (
                <div className="bg-yellow-100 px-4 py-1 text-xs text-gray-700 border-b border-yellow-200">
                    Debug: {debugInfo}
                </div>
            )}
            
            <div className="bg-gray-200 px-4 py-2 border-b border-gray-300 flex justify-between items-center flex-wrap gap-2">
                <span className="font-medium flex items-center gap-2">
                    News {currentIndex + 1} of {news.length}
                    {currentNews.ticker && <span className="text-blue-600">[{currentNews.ticker}]</span>}
                    <span className={`text-xs px-2 py-0.5 rounded ${
                        newsType === 'positive' ? 'bg-green-200 text-green-800' :
                        newsType === 'negative' ? 'bg-red-200 text-red-800' :
                        'bg-gray-300 text-gray-700'
                    }`}>
                        {newsType === 'positive' ? '↑ Positive' : 
                         newsType === 'negative' ? '↓ Negative' : '● Neutral'}
                    </span>
                    {/* Отображаем переданный тикер и return */}
                    {ticker && <span className="text-xs text-gray-500">Ticker: {ticker}</span>}
                    {currentReturn !== 0 && (
                        <span className={`text-xs ${currentReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            Return: {currentReturn > 0 ? '+' : ''}{currentReturn.toFixed(2)}%
                        </span>
                    )}
                </span>
                <span className="text-sm text-gray-600">
                    {formatDate(currentNews.pub_time)}
                </span>
            </div>

            <div className="p-4 min-h-[150px] max-h-[300px] overflow-y-auto">
                <h4 className="font-semibold text-gray-800 mb-2">
                    {currentNews.title || 'No title'}
                </h4>
                {currentNews.description && (
                    <p className="text-gray-700 text-sm mb-2 whitespace-pre-line">
                        {currentNews.description}
                    </p>
                )}
                
                {/* Блок анализа */}
                {currentAnalysis && !currentAnalysis.error && (
                    <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-blue-700">AI Agent</span>
                            <span className="text-xs text-gray-500">({currentAnalysis.source})</span>
                        </div>
                        <p className="text-sm text-gray-700 italic">
                            "{currentAnalysis.analysis}"
                        </p>
                    </div>
                )}
                
                {currentAnalysis?.error && (
                    <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
                        <p className="text-sm text-red-600">
                            Error: {currentAnalysis.error}
                        </p>
                    </div>
                )}
                
                <div className="flex justify-between items-center text-xs text-gray-500 mt-3">
                    <span>Author: {currentNews.author || 'Unknown'}</span>
                    {currentNews.url && (
                        <a 
                            href={currentNews.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            Read more →
                        </a>
                    )}
                </div>
            </div>

            <div className="flex justify-between items-center px-4 py-3 border-t border-gray-300 bg-gray-100">
                <button
                    onClick={goToPrevious}
                    className="px-4 py-2 bg-white border border-gray-400 rounded hover:bg-gray-200 text-sm transition-colors"
                >
                    ← Previous
                </button>
                
                <div className="flex gap-1 items-center">
                    {visibleDots.map((dot, idx) => {
                        if (dot === '...') {
                            return (
                                <span key={`ellipsis-${idx}`} className="px-1 text-gray-500 text-xs">
                                    •••
                                </span>
                            );
                        }
                        
                        const dotIndex = dot as number;
                        const dotNews = news[dotIndex];
                        const dotType = getNewsType(dotNews.title, dotNews.description);
                        
                        return (
                            <button
                                key={dotIndex}
                                onClick={() => setCurrentIndex(dotIndex)}
                                className={`w-2 h-2 rounded-full transition-all ${
                                    dotIndex === currentIndex 
                                        ? `w-3 h-3 ${
                                            dotType === 'positive' ? 'bg-green-600' :
                                            dotType === 'negative' ? 'bg-red-600' :
                                            'bg-blue-600'
                                          }`
                                        : `${
                                            dotType === 'positive' ? 'bg-green-400' :
                                            dotType === 'negative' ? 'bg-red-400' :
                                            'bg-gray-400'
                                          } hover:bg-gray-500`
                                }`}
                                title={`${dotIndex + 1}: ${dotNews.title?.substring(0, 30) || 'News'}`}
                            />
                        );
                    })}
                </div>
                
                <button
                    onClick={goToNext}
                    className="px-4 py-2 bg-white border border-gray-400 rounded hover:bg-gray-200 text-sm transition-colors"
                >
                    Next →
                </button>
            </div>
            
            {/* Кнопка анализа - ГАРАНТИРОВАННО ВИДИМА */}
            <div className="flex justify-center px-4 py-3 border-t border-gray-300 bg-gray-100">
                <button
                    onClick={() => {
                        console.log('ANALYZE BUTTON CLICKED!');
                        console.log('Current news:', currentNews);
                        console.log('Ticker:', ticker);
                        console.log('Current return:', currentReturn);
                        analyzeNews(currentNews);
                    }}
                    disabled={isAnalyzingCurrent}
                    className={`px-6 py-2 text-sm font-medium rounded-lg border-2 transition-all ${
                        currentAnalysis 
                            ? 'bg-green-100 border-green-400 text-green-700'
                            : 'bg-blue-500 border-blue-600 text-white hover:bg-blue-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`}
                    style={{ minWidth: '200px' }}  // Явно задаем минимальную ширину
                >
                    {isAnalyzingCurrent ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin">⏳</span> Analyzing...
                        </span>
                    ) : currentAnalysis ? (
                        <span className="flex items-center justify-center gap-2">
                            Done
                        </span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">
                            GET AI OPINION
                        </span>
                    )}
                </button>
            </div>
            
            {/* Дополнительная информация */}
            <div className="text-center text-xs text-gray-400 py-1 bg-gray-100 border-t border-gray-200">
                News URL: {NEWS_URL} | Ticker: {ticker || 'none'} | Return: {currentReturn}%
            </div>

            {news.length > MAX_VISIBLE_DOTS && (
                <div className="text-center text-xs text-gray-500 py-1 bg-gray-100 border-t border-gray-200">
                    Showing {currentIndex + 1} of {news.length} news items
                </div>
            )}
        </div>
    );
}

export default NewsSlider;