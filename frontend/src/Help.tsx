import Hat from './Hat'

function Help() {

  return (
    <div className="main-page">
        <Hat />
        <div className="w-full flex flex-col items-center mt-2">
            <h2 className="text-2xl mb-2">Help & Documentation</h2>


            <div className="w-1/3 flex flex-col gap-2 text-gray-800">
                {/* Quick Start */}
                <div className="flex flex-col gap-2">
                    <p className="text-lg">• Quick Start</p>
                    <p className="text-sm ml-6 text-gray-600">Загрузка датасета, выбор модели, запуск эксперимента</p>
                </div>


                {/* Sections */}
                <div className="flex flex-col gap-2">
                    <p className="text-lg">• Работа с разделами</p>
                    <p className="text-sm ml-6 text-gray-600">DataSets, Experiments, Models</p>
                </div>


                {/* Charts */}
                <div className="flex flex-col gap-2">
                    <p className="text-lg">• Графики</p>
                    <p className="text-sm ml-6 text-gray-600">Навигация без пагинации, масштабирование</p>
                </div>


                {/* API */}
                <div className="flex flex-col gap-2">
                    <p className="text-lg">• API</p>
                    <p className="text-sm ml-6 text-gray-600">OpenAPI, эндпоинты</p>
                </div>


                {/* Contacts */}
                <div className="flex flex-col gap-2 mb-10">
                    <p className="text-lg">• Контакты</p>
                    <p className="text-sm ml-6 text-gray-600">Служба поддержки</p>
                </div>
            </div>
        </div>
    </div>
  )
}

export default Help