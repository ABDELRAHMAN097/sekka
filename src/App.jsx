import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { routes } from "./routes";
import "./App.css";
import { AuthProvider } from "./context/AuthContext";
import { TenantProvider } from "./context/TenantContext";

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <RouterProvider router={router} />
      </TenantProvider>
    </AuthProvider>
  );
}