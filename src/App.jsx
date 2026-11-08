
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { routes } from "./routes";
import "./App.css";

import { AuthProvider } from "./context/AuthContext";
import { BusinessProvider } from "./context/TenantContext";

const router = createBrowserRouter(routes);

export default function App() {
    return (
        <AuthProvider>
            <BusinessProvider>
                <RouterProvider router={router} />
            </BusinessProvider>
        </AuthProvider>
    );
}
