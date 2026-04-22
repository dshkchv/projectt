import { Link } from "react-router-dom";

function Hat() {
    return (
        <div className="md w-full flex items-center justify-between px-2 py-2 spbu">
            <div className="flex gap-2">
                <Link
                    to="/datasets"
                    className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm"
                >
                    DataSets
                </Link>

                <Link
                    to="/experiments"
                    className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm"
                >
                    Experiments
                </Link>

                <Link
                    to="/models"
                    className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm"
                >
                    Models
                </Link>
            </div>

            <Link
                to="/"
                className="px-3 py-1 rounded-md bg-white hover:bg-gray-200 text-sm"
            >
                Help
            </Link>
        </div>
    );
}

export default Hat;
