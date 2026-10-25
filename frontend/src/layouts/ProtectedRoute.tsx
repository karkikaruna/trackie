import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorState, LoadingBlock } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";

export default function ProtectedRoute() {
  const { user, isLoading, error, retry } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingBlock label="Checking your session…" />;
  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState message="We couldn't reach the server to check your session." onRetry={retry} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
