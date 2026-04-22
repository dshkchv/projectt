import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider, createBrowserRouter } from "react-router-dom"
import Help from "./Help"
import DataSets from "./DataSets.tsx";
import Experiments from "./Experiments.tsx";
import Models from "./Models.tsx";

const router = createBrowserRouter([{ path: "/", element: <Help /> },
    { path: "/datasets", element: <DataSets /> },
    { path: "/experiments", element: <Experiments /> },
    { path: "/models", element: <Models /> }])

createRoot(document.getElementById("root")!).render(
    <RouterProvider router={router} />
)
